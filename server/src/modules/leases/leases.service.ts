import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  lockRecordCodes,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";
import {
  agreementParties,
  agreementRevisions,
  agreements,
  leaseInstallments,
  leases,
  people,
  rentals,
  vouchers,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { addMoney } from "../../shared/money.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  installmentLeft,
  leaseSchedule,
  leaseTermsOf,
  renewalStart,
  terminationError,
  type Installment,
  type LeaseFrequency,
  type RentTerms,
} from "./leases.rules.js";
import type { LeasePayload, LeaseRenewPayload } from "./leases.schema.js";

/**
 * Putting leases in force, ending, renewing and cancelling them. A lease and
 * its schedule are written in one transaction; the listing it rents is
 * marked rented, and back to available when no lease in force rents it.
 * Rent collected against the schedule, the deposit and the landlord's
 * payouts are client-funds vouchers naming the lease (vouchers.service.ts,
 * through leaseLink and leaseHeld below).
 */

const RENT_TEMPLATES = ["residential_rent", "commercial_rent"];
const rule = (message: string) => new DomainError(400, message, "LEASE_RULE");
/** A voucher naming a lease that does not fit it. */
const voucherRule = (message: string) =>
  new DomainError(400, message, "VOUCHER_RULE");

type LeaseValues = {
  agreementId: number | null;
  agreementRevision: number | null;
  rentalId: number | null;
  landlordPersonId: number;
  tenantPersonId: number;
  currency: "IQD" | "USD";
  rent: string;
  frequency: LeaseFrequency;
  startDate: string;
  endDate: string;
  deposit: string | null;
  officeCollects: boolean;
  notes: string | null;
};

/** The schedule of a lease's terms, or the reason it has none. */
export function scheduleOf(values: {
  rent: string;
  frequency: LeaseFrequency;
  startDate: string;
  endDate: string;
}) {
  const schedule = leaseSchedule(values);
  if ("error" in schedule) throw rule(schedule.error);
  return {
    installments: schedule.installments,
    total: addMoney(...schedule.installments.map((row) => row.amount)),
  };
}

async function checkParties(
  tx: Transaction,
  values: Pick<LeaseValues, "landlordPersonId" | "tenantPersonId" | "rentalId">,
) {
  if (values.landlordPersonId === values.tenantPersonId)
    throw rule("المؤجر والمستأجر لا يكونان الشخص نفسه.");
  const found = await tx
    .select({ id: people.id })
    .from(people)
    .where(
      inArray(people.id, [values.landlordPersonId, values.tenantPersonId]),
    );
  if (found.length !== 2) throw rule("المؤجر أو المستأجر غير موجود.");
  if (values.rentalId) {
    const [rental] = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.id, values.rentalId));
    if (!rental) throw rule("عرض الإيجار غير موجود.");
  }
}

async function nextCode(tx: Transaction) {
  await lockRecordCodes(tx, "leases");
  const [last] = await tx
    .select({ code: leases.code })
    .from(leases)
    .orderBy(desc(leases.id))
    .limit(1);
  const next = last ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `LS-${String(next).padStart(6, "0")}`;
}

/** Writes the lease and its schedule, and marks its listing rented. */
async function insertLease(
  tx: Transaction,
  values: LeaseValues,
  installments: Installment[],
  userId?: number,
  renewedFromId: number | null = null,
) {
  const code = await nextCode(tx);
  const [row] = await tx
    .insert(leases)
    .values({
      code,
      agreementId: values.agreementId,
      agreementRevision: values.agreementRevision,
      rentalId: values.rentalId,
      landlordPersonId: values.landlordPersonId,
      tenantPersonId: values.tenantPersonId,
      currency: values.currency,
      rentAmount: values.rent,
      frequency: values.frequency,
      startDate: values.startDate,
      endDate: values.endDate,
      deposit: values.deposit,
      officeCollects: values.officeCollects,
      notes: values.notes,
      renewedFromId,
      createdBy: userId ?? null,
    })
    .returning({ id: leases.id, code: leases.code });
  await tx.insert(leaseInstallments).values(
    installments.map((installment) => ({
      leaseId: row!.id,
      seq: installment.seq,
      dueDate: installment.due_date,
      periodStart: installment.period_start,
      periodEnd: installment.period_end,
      amount: installment.amount,
    })),
  );
  let rentalChange: { id: number; from: string } | null = null;
  if (values.rentalId) {
    const [rental] = await tx
      .select({ status: rentals.status })
      .from(rentals)
      .where(eq(rentals.id, values.rentalId))
      .for("update");
    if (rental && rental.status !== "rented" && rental.status !== "archived") {
      await tx
        .update(rentals)
        .set({ status: "rented", updatedAt: new Date() })
        .where(eq(rentals.id, values.rentalId));
      rentalChange = { id: values.rentalId, from: rental.status };
    }
  }
  return { ...row!, rentalChange };
}

async function auditCreated(
  created: {
    id: number;
    code: string;
    rentalChange: { id: number; from: string } | null;
  },
  values: LeaseValues,
  userId?: number,
) {
  await recordAudit({
    entityType: "lease",
    entityId: created.id,
    action: "created",
    newValue: {
      code: created.code,
      agreement_id: values.agreementId,
      rental_id: values.rentalId,
      rent_amount: values.rent,
      currency: values.currency,
      start_date: values.startDate,
      end_date: values.endDate,
    },
    userId,
  });
  if (created.rentalChange)
    await recordAudit({
      entityType: "rental",
      entityId: created.rentalChange.id,
      action: "status_changed",
      oldValue: { status: created.rentalChange.from },
      newValue: { status: "rented", lease_code: created.code },
      userId,
    });
}

/** A lease in force without a contract in the system, entered by hand. */
export async function createLease(payload: LeasePayload, userId?: number) {
  const values: LeaseValues = {
    agreementId: null,
    agreementRevision: null,
    rentalId: payload.rental_id ?? null,
    landlordPersonId: payload.landlord_person_id,
    tenantPersonId: payload.tenant_person_id,
    currency: payload.currency,
    rent: payload.rent_amount,
    frequency: payload.frequency,
    startDate: payload.start_date,
    endDate: payload.end_date,
    deposit: payload.deposit ?? null,
    officeCollects: payload.office_collects,
    notes: payload.notes,
  };
  const { installments } = scheduleOf(values);
  const created = await db.transaction(async (tx) => {
    await checkParties(tx, values);
    return insertLease(tx, values, installments, userId);
  });
  await auditCreated(created, values, userId);
  return created.id;
}

type AgreementLease =
  | { values: LeaseValues; problem: null }
  | { values: Partial<LeaseValues> | null; problem: string };

/**
 * What a lease activated from a contract would take: the terms of its
 * current issued revision, its landlord and tenant, its listing. Inside a
 * transaction when activating, so the contract row is locked.
 */
async function fromAgreement(
  executor: Transaction | typeof db,
  agreementId: number,
  lock: boolean,
): Promise<{
  agreement: typeof agreements.$inferSelect;
  lease: AgreementLease;
} | null> {
  const query = executor
    .select()
    .from(agreements)
    .where(eq(agreements.id, agreementId));
  const [agreement] = lock ? await query.for("update") : await query;
  if (!agreement) return null;
  const fail = (problem: string): AgreementLease => ({ values: null, problem });
  if (!RENT_TEMPLATES.includes(agreement.templateKey))
    return { agreement, lease: fail("العقد ليس عقد إيجار.") };
  if (agreement.status !== "issued" || agreement.currentRevision < 1)
    return {
      agreement,
      lease: fail("يُفعَّل الإيجار من عقد صادر؛ أصدر العقد أولاً."),
    };
  const [revision] = await executor
    .select({ terms: agreementRevisions.terms })
    .from(agreementRevisions)
    .where(
      and(
        eq(agreementRevisions.agreementId, agreementId),
        eq(agreementRevisions.revision, agreement.currentRevision),
      ),
    );
  const parties = await executor
    .select({
      role: agreementParties.role,
      personId: agreementParties.personId,
    })
    .from(agreementParties)
    .where(eq(agreementParties.agreementId, agreementId));
  const landlordId = parties.find((row) => row.role === "landlord")?.personId;
  const tenantId = parties.find((row) => row.role === "tenant")?.personId;
  if (!revision)
    return { agreement, lease: fail("نسخة العقد الصادرة مفقودة.") };
  if (!landlordId || !tenantId)
    return { agreement, lease: fail("العقد بلا مؤجر أو مستأجر.") };
  const terms = leaseTermsOf(revision.terms as RentTerms);
  if ("error" in terms) return { agreement, lease: fail(terms.error) };
  return {
    agreement,
    lease: {
      problem: null,
      values: {
        agreementId,
        agreementRevision: agreement.currentRevision,
        rentalId: agreement.rentalId,
        landlordPersonId: landlordId,
        tenantPersonId: tenantId,
        currency: terms.currency,
        rent: terms.rent,
        frequency: terms.frequency,
        startDate: terms.startDate,
        endDate: terms.endDate,
        deposit: terms.deposit,
        officeCollects: false,
        notes: null,
      },
    },
  };
}

async function liveLeaseOf(
  executor: Transaction | typeof db,
  agreementId: number,
) {
  const [live] = await executor
    .select({ id: leases.id, code: leases.code })
    .from(leases)
    .where(
      and(eq(leases.agreementId, agreementId), ne(leases.status, "cancelled")),
    );
  return live ?? null;
}

/**
 * What activating a contract would put in force, for the activation form:
 * the values and schedule, or why it cannot, and a lease already live.
 */
export async function agreementLeaseDraft(agreementId: number) {
  const found = await fromAgreement(db, agreementId, false);
  if (!found) return null;
  const { agreement, lease } = found;
  const existing = await liveLeaseOf(db, agreementId);
  let problem = lease.problem;
  let schedule: ReturnType<typeof scheduleOf> | null = null;
  if (!problem && lease.values) {
    try {
      schedule = scheduleOf(lease.values as LeaseValues);
    } catch (error) {
      problem = (error as Error).message;
    }
  }
  const values = lease.values;
  return {
    agreement_id: agreement.id,
    agreement_code: agreement.code,
    agreement_status: agreement.status,
    agreement_revision: agreement.currentRevision,
    problem,
    existing_lease: existing,
    lease: values?.rent
      ? {
          rental_id: values.rentalId ?? null,
          landlord_person_id: values.landlordPersonId ?? null,
          tenant_person_id: values.tenantPersonId ?? null,
          currency: values.currency!,
          rent_amount: values.rent,
          frequency: values.frequency!,
          start_date: values.startDate!,
          end_date: values.endDate!,
          deposit: values.deposit ?? null,
        }
      : null,
    installments: schedule?.installments ?? [],
    total_rent: schedule?.total ?? "0.00",
  };
}

/** Puts an issued rent contract in force, once. */
export async function activateLease(
  input: {
    agreement_id: number;
    office_collects: boolean;
    notes: string | null;
  },
  userId?: number,
) {
  let values: LeaseValues | null = null;
  const created = await db.transaction(async (tx) => {
    // Activations of one contract take turns on its row.
    const found = await fromAgreement(tx, input.agreement_id, true);
    if (!found) throw rule("العقد غير موجود.");
    if (found.lease.problem !== null)
      throw new DomainError(409, found.lease.problem, "LEASE_RULE");
    const live = await liveLeaseOf(tx, input.agreement_id);
    if (live)
      throw new DomainError(
        409,
        `العقد ${found.agreement.code} مفعَّل بالإيجار ${live.code}.`,
        "LEASE_EXISTS",
      );
    values = {
      ...found.lease.values,
      officeCollects: input.office_collects,
      notes: input.notes,
    };
    const { installments } = scheduleOf(values);
    await checkParties(tx, values);
    return insertLease(tx, values, installments, userId);
  });
  await auditCreated(created, values!, userId);
  return created.id;
}

/**
 * Frees a lease's listing when no other lease in force rents it: back to
 * available if it was rented. Returns whether it changed.
 */
async function freeRental(
  tx: Transaction,
  rentalId: number | null,
  leaseId: number,
) {
  if (!rentalId) return false;
  const [other] = await tx
    .select({ id: leases.id })
    .from(leases)
    .where(
      and(
        eq(leases.rentalId, rentalId),
        eq(leases.status, "active"),
        ne(leases.id, leaseId),
      ),
    )
    .limit(1);
  if (other) return false;
  const freed = await tx
    .update(rentals)
    .set({ status: "available", updatedAt: new Date() })
    .where(and(eq(rentals.id, rentalId), eq(rentals.status, "rented")))
    .returning({ id: rentals.id });
  return freed.length > 0;
}

async function auditRentalFreed(
  rentalId: number | null,
  leaseCode: string,
  freed: boolean,
  userId?: number,
) {
  if (freed && rentalId)
    await recordAudit({
      entityType: "rental",
      entityId: rentalId,
      action: "status_changed",
      oldValue: { status: "rented" },
      newValue: { status: "available", lease_code: leaseCode },
      userId,
    });
}

async function lockLease(tx: Transaction, id: number) {
  const [row] = await tx
    .select()
    .from(leases)
    .where(eq(leases.id, id))
    .for("update");
  return row ?? null;
}

/** Posted vouchers naming a lease (its rent, deposit or payouts). */
async function leaseVoucherCount(tx: Transaction, leaseId: number) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(vouchers)
    .where(and(eq(vouchers.leaseId, leaseId), eq(vouchers.status, "posted")));
  return row?.count ?? 0;
}

/**
 * Cancels a lease entered by mistake, while no voucher names it. Its
 * listing goes back to available if no other lease in force rents it; the
 * lease it renewed (if any) is in force again.
 */
export async function cancelLease(id: number, reason: string, userId?: number) {
  const done = await db.transaction(async (tx) => {
    const row = await lockLease(tx, id);
    if (!row) return null;
    if (row.status === "cancelled")
      throw new DomainError(
        409,
        `الإيجار ${row.code} ملغى أصلاً.`,
        "LEASE_CANCELLED",
      );
    if (row.status !== "active")
      throw new DomainError(
        409,
        `الإيجار ${row.code} منتهٍ أو مجدَّد؛ يُلغى الإيجار الساري فقط.`,
        "LEASE_RULE",
      );
    if (await leaseVoucherCount(tx, id))
      throw new DomainError(
        409,
        `على الإيجار ${row.code} سندات قبض أو صرف؛ ألغها أولاً.`,
        "LEASE_HAS_VOUCHERS",
      );
    await tx
      .update(leases)
      .set({
        status: "cancelled",
        cancelReason: reason,
        cancelledAt: new Date(),
        cancelledBy: userId ?? null,
      })
      .where(eq(leases.id, id));
    let restored: { id: number; code: string } | null = null;
    if (row.renewedFromId) {
      const [renewed] = await tx
        .update(leases)
        .set({ status: "active" })
        .where(
          and(eq(leases.id, row.renewedFromId), eq(leases.status, "renewed")),
        )
        .returning({ id: leases.id, code: leases.code });
      restored = renewed ?? null;
    }
    // The renewed lease is in force again and still rents the listing.
    const rentalFreed = restored
      ? false
      : await freeRental(tx, row.rentalId, id);
    return { row, rentalFreed, restored };
  });
  if (!done) return null;
  await recordAudit({
    entityType: "lease",
    entityId: id,
    action: "status_changed",
    oldValue: { status: "active" },
    newValue: { status: "cancelled", reason },
    userId,
  });
  if (done.restored)
    await recordAudit({
      entityType: "lease",
      entityId: done.restored.id,
      action: "status_changed",
      oldValue: { status: "renewed" },
      newValue: { status: "active", cancelled_renewal: done.row.code },
      userId,
    });
  await auditRentalFreed(
    done.row.rentalId,
    done.row.code,
    done.rentalFreed,
    userId,
  );
  return id;
}

/**
 * Ends a lease early: installments due after `termination_date` are
 * released. Refused while one due after that day is paid. Its listing goes
 * back to available.
 */
export async function terminateLease(
  id: number,
  input: { termination_date: string; reason: string },
  userId?: number,
) {
  const done = await db.transaction(async (tx) => {
    const row = await lockLease(tx, id);
    if (!row) return null;
    const [paidAfter] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(vouchers)
      .innerJoin(
        leaseInstallments,
        eq(vouchers.leaseInstallmentId, leaseInstallments.id),
      )
      .where(
        and(
          eq(leaseInstallments.leaseId, id),
          eq(vouchers.status, "posted"),
          sql`${leaseInstallments.dueDate} > ${input.termination_date}`,
        ),
      );
    const error = terminationError(
      row,
      input.termination_date,
      paidAfter?.count ?? 0,
    );
    if (error) throw new DomainError(409, error, "LEASE_RULE");
    await tx
      .update(leases)
      .set({
        status: "terminated",
        terminationDate: input.termination_date,
        terminationReason: input.reason,
        terminatedAt: new Date(),
        terminatedBy: userId ?? null,
      })
      .where(eq(leases.id, id));
    return { row, rentalFreed: await freeRental(tx, row.rentalId, id) };
  });
  if (!done) return null;
  await recordAudit({
    entityType: "lease",
    entityId: id,
    action: "status_changed",
    oldValue: { status: "active" },
    newValue: {
      status: "terminated",
      termination_date: input.termination_date,
      reason: input.reason,
    },
    userId,
  });
  await auditRentalFreed(
    done.row.rentalId,
    done.row.code,
    done.rentalFreed,
    userId,
  );
  return id;
}

/**
 * Renews a lease: a new one with the same parties, listing and currency
 * from the day after it ends, with the new terms and schedule. The old
 * lease is marked renewed; its installments are still owed.
 */
export async function renewLease(
  id: number,
  input: LeaseRenewPayload,
  userId?: number,
) {
  let values: LeaseValues | null = null;
  const created = await db.transaction(async (tx) => {
    const row = await lockLease(tx, id);
    if (!row) return null;
    if (row.status !== "active")
      throw new DomainError(
        409,
        `الإيجار ${row.code} ملغى أو منتهٍ أو مجدَّد أصلاً؛ يُجدَّد الإيجار الساري فقط.`,
        "LEASE_RULE",
      );
    if (!row.landlordPersonId || !row.tenantPersonId)
      throw rule("الإيجار بلا مؤجر أو مستأجر.");
    values = {
      agreementId: null,
      agreementRevision: null,
      rentalId: row.rentalId,
      landlordPersonId: row.landlordPersonId,
      tenantPersonId: row.tenantPersonId,
      currency: row.currency as "IQD" | "USD",
      rent: input.rent_amount,
      frequency: input.frequency,
      startDate: renewalStart(row.endDate),
      endDate: input.end_date,
      deposit:
        input.deposit === undefined ? row.deposit : (input.deposit ?? null),
      officeCollects: input.office_collects ?? row.officeCollects,
      notes: input.notes,
    };
    const { installments } = scheduleOf(values);
    const inserted = await insertLease(
      tx,
      values,
      installments,
      userId,
      row.id,
    );
    await tx
      .update(leases)
      .set({ status: "renewed" })
      .where(eq(leases.id, row.id));
    return inserted;
  });
  if (!created) return null;
  await auditCreated(created, values!, userId);
  await recordAudit({
    entityType: "lease",
    entityId: id,
    action: "status_changed",
    oldValue: { status: "active" },
    newValue: { status: "renewed", renewal_code: created.code },
    userId,
  });
  return created.id;
}

export type LeaseLink = {
  lease: {
    id: number;
    code: string;
    currency: string;
    landlordPersonId: number | null;
    tenantPersonId: number | null;
  };
  installment: { id: number; seq: number; left: string } | null;
};

/**
 * The lease (and installment) a voucher names, locked to the end of the
 * caller's transaction: receipts and payouts of one lease take turns, and a
 * termination waits for them. Rent is collected only where the office
 * collects it, on an installment a termination has not released.
 */
export async function leaseLink(
  tx: Transaction,
  input: { leaseId: number | null; installmentId: number | null },
): Promise<LeaseLink> {
  let leaseId = input.leaseId;
  let installment: typeof leaseInstallments.$inferSelect | null = null;
  if (input.installmentId) {
    const [found] = await tx
      .select()
      .from(leaseInstallments)
      .where(eq(leaseInstallments.id, input.installmentId));
    if (!found) throw voucherRule("قسط الإيجار غير موجود.");
    if (leaseId && leaseId !== found.leaseId)
      throw voucherRule("القسط ليس من أقساط هذا الإيجار.");
    installment = found;
    leaseId = found.leaseId;
  }
  const [lease] = await tx
    .select()
    .from(leases)
    .where(eq(leases.id, leaseId!))
    .for("no key update");
  if (!lease) throw voucherRule("الإيجار غير موجود.");
  if (lease.status === "cancelled")
    throw voucherRule(`الإيجار ${lease.code} ملغى.`);
  let left: string | null = null;
  if (installment) {
    if (!lease.officeCollects)
      throw voucherRule(
        `المكتب لا يقبض إيجار ${lease.code}؛ يدفعه المستأجر للمؤجر مباشرة.`,
      );
    if (
      lease.status === "terminated" &&
      lease.terminationDate &&
      installment.dueDate > lease.terminationDate
    )
      throw voucherRule(
        `القسط ${installment.seq} بعد تاريخ إنهاء الإيجار ${lease.code}.`,
      );
    // The installment row is locked too: two receipts cannot both take
    // what is left on it.
    await tx
      .select({ id: leaseInstallments.id })
      .from(leaseInstallments)
      .where(eq(leaseInstallments.id, installment.id))
      .for("update");
    const [paid] = await tx
      .select({
        total: sql<string>`coalesce(sum(${vouchers.amount}), 0)::numeric(18,2)::text`,
      })
      .from(vouchers)
      .where(
        and(
          eq(vouchers.leaseInstallmentId, installment.id),
          eq(vouchers.status, "posted"),
        ),
      );
    left = installmentLeft(installment.amount, paid?.total ?? "0.00");
  }
  return {
    lease: {
      id: lease.id,
      code: lease.code,
      currency: lease.currency,
      landlordPersonId: lease.landlordPersonId,
      tenantPersonId: lease.tenantPersonId,
    },
    installment: installment
      ? { id: installment.id, seq: installment.seq, left: left! }
      : null,
  };
}

/** Client funds held on a lease for one person: its receipts less payouts. */
export async function leaseHeld(
  tx: Transaction,
  leaseId: number,
  personId: number,
) {
  const [row] = await tx
    .select({
      held: sql<string>`coalesce(sum(CASE WHEN ${vouchers.kind} = 'receipt' THEN ${vouchers.amount} ELSE -${vouchers.amount} END), 0)::numeric(18,2)::text`,
    })
    .from(vouchers)
    .where(
      and(
        eq(vouchers.leaseId, leaseId),
        eq(vouchers.status, "posted"),
        eq(vouchers.heldForPersonId, personId),
      ),
    );
  return row?.held ?? "0.00";
}
