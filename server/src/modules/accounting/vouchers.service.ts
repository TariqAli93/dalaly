import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  lockRecordCodes,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";
import {
  accounts,
  deals,
  journalEntries,
  journalLines,
  people,
  vouchers,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { compareMoney, type Currency } from "../../shared/money.js";
import { recordAudit } from "../audit/audit.service.js";
import type { AccountType } from "./accounting.rules.js";
import { reverseEntry, writeEntry } from "./ledger.service.js";
import {
  purposeOf,
  voucherAccountsError,
  voucherLines,
  type VoucherAccount,
  type VoucherKind,
} from "./vouchers.rules.js";
import type { VoucherPayload } from "./vouchers.schema.js";

/**
 * Issuing and voiding receipts and payments. A voucher and its journal entry
 * are written in one transaction through the ledger's gateway, so neither
 * exists without the other. Payments are held to what is there: no more
 * than the cash or bank account holds, and no more client funds to a
 * landlord or seller than were collected for them.
 */

const KIND_LABEL: Record<VoucherKind, string> = {
  receipt: "سند قبض",
  payment: "سند صرف",
};
const KIND_PREFIX: Record<VoucherKind, string> = {
  receipt: "RC",
  payment: "PV",
};

/** Every account, with the system keys of the headings above each. */
async function chartWithHeadings(tx: Transaction) {
  const rows = await tx.select().from(accounts);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const headingKeys = (id: number) => {
    const keys: string[] = [];
    let parent = byId.get(id)?.parentId ?? null;
    for (let depth = 0; parent !== null && depth < 50; depth += 1) {
      const heading = byId.get(parent);
      if (!heading) break;
      if (heading.systemKey) keys.push(heading.systemKey);
      parent = heading.parentId;
    }
    return keys;
  };
  const asVoucherAccount = (id: number | null | undefined) => {
    const row = id ? byId.get(id) : undefined;
    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      accountType: row.accountType as AccountType,
      currency: row.currency as Currency | null,
      isPostable: row.isPostable,
      isActive: row.isActive,
      headingKeys: headingKeys(row.id),
    } satisfies VoucherAccount;
  };
  const bySystemKey = (key: string) =>
    rows.find((row) => row.systemKey === key)?.id ?? null;
  return { asVoucherAccount, bySystemKey };
}

/**
 * An account's posted balance on one side: debits less credits for "debit"
 * (cash, bank), credits less debits for "credit" (client funds), optionally
 * only the lines that name a person.
 */
async function postedBalance(
  tx: Transaction,
  accountId: number,
  side: "debit" | "credit",
  personId?: number,
) {
  const net =
    side === "debit"
      ? sql`${journalLines.debit} - ${journalLines.credit}`
      : sql`${journalLines.credit} - ${journalLines.debit}`;
  const [row] = await tx
    .select({
      balance: sql<string>`coalesce(sum(${net}), 0)::numeric(18,2)::text`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(
      and(
        eq(journalLines.accountId, accountId),
        eq(journalEntries.status, "posted"),
        personId === undefined
          ? undefined
          : eq(journalLines.personId, personId),
      ),
    );
  return row?.balance ?? "0.00";
}

async function nextCode(tx: Transaction, kind: VoucherKind) {
  await lockRecordCodes(tx, "vouchers");
  const [last] = await tx
    .select({ code: vouchers.code })
    .from(vouchers)
    .where(eq(vouchers.kind, kind))
    .orderBy(desc(vouchers.id))
    .limit(1);
  const next = last ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `${KIND_PREFIX[kind]}-${String(next).padStart(6, "0")}`;
}

export async function issueVoucher(payload: VoucherPayload, userId?: number) {
  const id = await db.transaction(async (tx) => {
    const kind = payload.kind;
    const purpose = purposeOf(kind, payload.purpose);
    if (!purpose)
      throw new DomainError(
        400,
        kind === "receipt"
          ? "هذا الغرض لا يصلح لسند قبض."
          : "هذا الغرض لا يصلح لسند صرف.",
        "VOUCHER_RULE",
      );
    const chart = await chartWithHeadings(tx);
    const otherId =
      payload.other_account_id ??
      chart.bySystemKey(`${purpose.key}.${payload.currency}`);
    const money = chart.asVoucherAccount(payload.money_account_id);
    const other = chart.asVoucherAccount(otherId);
    const error = voucherAccountsError({
      kind,
      purpose: payload.purpose,
      currency: payload.currency,
      money,
      other,
    });
    if (error) throw new DomainError(400, error, "VOUCHER_RULE");

    let partyName = payload.party_name;
    if (payload.person_id) {
      const [person] = await tx
        .select({ fullName: people.fullName })
        .from(people)
        .where(eq(people.id, payload.person_id));
      if (!person)
        throw new DomainError(400, "الزبون غير موجود.", "VOUCHER_RULE");
      partyName ??= person.fullName;
    }
    if (!partyName)
      throw new DomainError(
        400,
        kind === "receipt"
          ? "اختر الزبون الدافع أو اكتب اسمه."
          : "اختر الزبون المستلم أو اكتب اسمه.",
        "VOUCHER_RULE",
      );
    if (payload.deal_id) {
      const [deal] = await tx
        .select({ id: deals.id })
        .from(deals)
        .where(eq(deals.id, payload.deal_id));
      if (!deal)
        throw new DomainError(400, "الصفقة غير موجودة.", "VOUCHER_RULE");
    }

    if (
      kind === "payment" &&
      payload.purpose === "client_funds" &&
      !payload.person_id
    )
      throw new DomainError(
        400,
        "أمانات العملاء تُصرف لزبون بعينه: اختر المالك أو البائع.",
        "VOUCHER_RULE",
      );

    if (kind === "payment") {
      // Payments from one account take turns, so two cannot both spend
      // the same balance. Receipts into it are not held up.
      await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, money!.id))
        .for("no key update");
      const available = await postedBalance(tx, money!.id, "debit");
      if (compareMoney(payload.amount, available) > 0)
        throw new DomainError(
          409,
          `رصيد الحساب ${money!.code} ${available} لا يكفي لصرف ${payload.amount}.`,
          "VOUCHER_BALANCE",
        );
      if (payload.purpose === "client_funds") {
        await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.id, other!.id))
          .for("no key update");
        const held = await postedBalance(
          tx,
          other!.id,
          "credit",
          // Required above for a client-funds payment.
          payload.person_id!,
        );
        if (compareMoney(payload.amount, held) > 0)
          throw new DomainError(
            409,
            `المحتفظ به لهذا الزبون في ${other!.code} هو ${held} فقط.`,
            "VOUCHER_CLIENT_FUNDS",
          );
      }
    }

    const [{ id: voucherId }] = (
      await tx.execute<{ id: string }>(
        sql`SELECT nextval(pg_get_serial_sequence('vouchers', 'id')) AS id`,
      )
    ).rows.map((row) => ({ id: Number(row.id) }));
    const code = await nextCode(tx, kind);
    const lines = voucherLines(kind, payload.amount, money!.id, other!.id).map(
      (line) =>
        line.accountId === other!.id
          ? {
              ...line,
              personId: payload.person_id ?? null,
              dealId: payload.deal_id ?? null,
              memo: partyName,
            }
          : { ...line, dealId: payload.deal_id ?? null },
    );
    const entryId = await writeEntry(
      tx,
      {
        entryDate: payload.voucher_date,
        currency: payload.currency,
        description: `${KIND_LABEL[kind]} ${code}: ${payload.description}`,
        sourceType: kind,
        sourceId: voucherId,
        idempotencyKey: `voucher:${voucherId}`,
        lines,
      },
      { post: true, userId },
    );
    await tx.insert(vouchers).values({
      id: voucherId,
      code,
      kind,
      voucherDate: payload.voucher_date,
      currency: payload.currency,
      amount: payload.amount,
      purpose: payload.purpose,
      moneyAccountId: money!.id,
      otherAccountId: other!.id,
      personId: payload.person_id ?? null,
      partyName,
      dealId: payload.deal_id ?? null,
      description: payload.description,
      reference: payload.reference,
      journalEntryId: entryId,
      createdBy: userId ?? null,
    });
    return voucherId;
  });
  const [row] = await db.select().from(vouchers).where(eq(vouchers.id, id));
  await recordAudit({
    entityType: "voucher",
    entityId: id,
    action: "created",
    newValue: {
      code: row.code,
      kind: row.kind,
      amount: row.amount,
      currency: row.currency,
      purpose: row.purpose,
    },
    userId,
  });
  return id;
}

/**
 * Voids a voucher: posts the reversing entry of its entry and marks it
 * voided, with the reason. A voided voucher stays, as issued, in the books.
 */
export async function voidVoucher(
  id: number,
  input: { void_date?: string; reason: string },
  userId?: number,
) {
  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(vouchers)
      .where(eq(vouchers.id, id))
      .for("update");
    if (!row) return null;
    if (row.status === "voided")
      throw new DomainError(
        409,
        `السند ${row.code} ملغى أصلاً.`,
        "VOUCHER_VOIDED",
      );
    const voidEntryId = await reverseEntry(
      tx,
      row.journalEntryId,
      {
        entryDate: input.void_date,
        reason: `إلغاء ${KIND_LABEL[row.kind as VoucherKind]} ${row.code}: ${input.reason}`,
      },
      userId,
    );
    await tx
      .update(vouchers)
      .set({
        status: "voided",
        voidEntryId,
        voidReason: input.reason,
        voidedAt: new Date(),
        voidedBy: userId ?? null,
      })
      .where(eq(vouchers.id, id));
    return row;
  });
  if (!done) return null;
  await recordAudit({
    entityType: "voucher",
    entityId: id,
    action: "status_changed",
    oldValue: { status: "posted" },
    newValue: { status: "voided", reason: input.reason },
    userId,
  });
  return id;
}

/** What is held in client funds for a person, per currency. */
export async function clientFundsHeld(personId: number) {
  const rows = await db
    .select({
      currency: accounts.currency,
      held: sql<string>`coalesce(sum(${journalLines.credit} - ${journalLines.debit}), 0)::numeric(18,2)::text`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .innerJoin(
      sql`accounts heading`,
      sql`heading.id = ${accounts.parentId} and heading.system_key = 'client_funds'`,
    )
    .where(
      and(
        eq(journalLines.personId, personId),
        eq(journalEntries.status, "posted"),
      ),
    )
    .groupBy(accounts.currency)
    .orderBy(accounts.currency);
  return rows;
}
