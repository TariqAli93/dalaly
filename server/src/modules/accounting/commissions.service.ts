import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  lockRecordCodes,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";
import {
  accounts,
  commissionSplits,
  commissions,
  deals,
  people,
  users,
  vouchers,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { addMoney, type Currency } from "../../shared/money.js";
import { recordAudit } from "../audit/audit.service.js";
import { isClosed } from "../deals/deals.rules.js";
import { outstanding, shareAmount, splitAmounts } from "./commissions.rules.js";
import type { CommissionPayload } from "./commissions.schema.js";
import { reverseEntry, writeEntry, type LedgerLine } from "./ledger.service.js";

/**
 * Recording and cancelling commissions. Recording posts, in one entry: the
 * payer's receivable against brokerage income, and the employees' shares as
 * commission expense against commissions payable. Receipts and payments
 * allocated to a commission or a share settle them (vouchers.service.ts).
 */

const PAYER_LABEL = {
  client: "المشتري أو المستأجر",
  owner: "البائع أو المؤجر",
};

async function systemAccount(tx: Transaction, key: string) {
  const [row] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.systemKey, key));
  if (!row)
    throw new DomainError(
      409,
      `الحساب الأساسي ${key} غير موجود في الدليل.`,
      "ACCOUNT_MISSING",
    );
  return row.id;
}

/** Collected on a commission: its posted, not voided, allocated receipts. */
export async function commissionCollected(tx: Transaction, id: number) {
  const [row] = await tx
    .select({
      total: sql<string>`coalesce(sum(${vouchers.amount}), 0)::numeric(18,2)::text`,
    })
    .from(vouchers)
    .where(and(eq(vouchers.commissionId, id), eq(vouchers.status, "posted")));
  return row.total;
}

/** Paid on a share: its posted, not voided, allocated payments. */
export async function splitPaid(tx: Transaction, id: number) {
  const [row] = await tx
    .select({
      total: sql<string>`coalesce(sum(${vouchers.amount}), 0)::numeric(18,2)::text`,
    })
    .from(vouchers)
    .where(
      and(eq(vouchers.commissionSplitId, id), eq(vouchers.status, "posted")),
    );
  return row.total;
}

async function nextCode(tx: Transaction) {
  await lockRecordCodes(tx, "commissions");
  const [last] = await tx
    .select({ code: commissions.code })
    .from(commissions)
    .orderBy(desc(commissions.id))
    .limit(1);
  const next = last ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `CM-${String(next).padStart(6, "0")}`;
}

export async function recordCommission(
  payload: CommissionPayload,
  userId?: number,
) {
  const id = await db.transaction(async (tx) => {
    // Commissions of one deal take turns: one live commission per payer.
    const [deal] = await tx
      .select()
      .from(deals)
      .where(eq(deals.id, payload.deal_id))
      .for("update");
    if (!deal)
      throw new DomainError(400, "الصفقة غير موجودة.", "COMMISSION_RULE");
    if (isClosed(deal.stage) && deal.stage !== "won")
      throw new DomainError(
        409,
        "الصفقة خاسرة أو ملغاة؛ لا عمولة عليها.",
        "COMMISSION_RULE",
      );
    const payerId =
      payload.payer_role === "client"
        ? deal.clientPersonId
        : deal.ownerPersonId;
    if (!payerId)
      throw new DomainError(
        400,
        "لا بائع أو مؤجر في الصفقة؛ حدده في الصفقة أولاً.",
        "COMMISSION_RULE",
      );
    const [live] = await tx
      .select({ code: commissions.code })
      .from(commissions)
      .where(
        and(
          eq(commissions.dealId, deal.id),
          eq(commissions.payerRole, payload.payer_role),
          eq(commissions.status, "active"),
        ),
      );
    if (live)
      throw new DomainError(
        409,
        `للصفقة عمولة قائمة على ${PAYER_LABEL[payload.payer_role]}: ${live.code}.`,
        "COMMISSION_EXISTS",
      );

    const currency = (payload.currency ?? deal.currency) as Currency;
    let baseAmount: string | null = null;
    if (payload.basis === "percent") {
      if (!deal.agreedPrice)
        throw new DomainError(
          400,
          "العمولة بالنسبة تُحسب من السعر المتفق عليه؛ سجّله في الصفقة أولاً.",
          "COMMISSION_RULE",
        );
      if (currency !== deal.currency)
        throw new DomainError(
          400,
          "العمولة بالنسبة بعملة سعر الصفقة.",
          "COMMISSION_RULE",
        );
      baseAmount = deal.agreedPrice;
    }
    const total = shareAmount(payload, baseAmount, "العمولة");
    if ("error" in total)
      throw new DomainError(400, total.error, "COMMISSION_RULE");

    const splits = splitAmounts(
      total.amount,
      payload.splits.map((split) => ({ ...split, userId: split.user_id })),
    );
    if ("error" in splits)
      throw new DomainError(400, splits.error, "COMMISSION_RULE");
    const staff = payload.splits.length
      ? await tx
          .select({
            id: users.id,
            name: users.displayName,
            active: users.isActive,
          })
          .from(users)
          .where(
            inArray(
              users.id,
              payload.splits.map((split) => split.user_id),
            ),
          )
      : [];
    for (const split of payload.splits) {
      const user = staff.find((row) => row.id === split.user_id);
      if (!user || !user.active)
        throw new DomainError(
          400,
          "حصة لموظف غير موجود أو موقوف.",
          "COMMISSION_RULE",
        );
    }
    const [payer] = await tx
      .select({ fullName: people.fullName })
      .from(people)
      .where(eq(people.id, payerId));

    const [{ id: commissionId }] = (
      await tx.execute<{ id: string }>(
        sql`SELECT nextval(pg_get_serial_sequence('commissions', 'id')) AS id`,
      )
    ).rows.map((row) => ({ id: Number(row.id) }));
    const code = await nextCode(tx);
    const zero = "0.00";
    const lines: LedgerLine[] = [
      {
        accountId: await systemAccount(tx, `receivables.${currency}`),
        debit: total.amount,
        credit: zero,
        personId: payerId,
        dealId: deal.id,
        memo: payer?.fullName ?? null,
      },
      {
        accountId: await systemAccount(tx, `brokerage_income.${currency}`),
        debit: zero,
        credit: total.amount,
        dealId: deal.id,
      },
    ];
    if (splits.amounts.length) {
      lines.push({
        accountId: await systemAccount(tx, `commission_expense.${currency}`),
        debit: addMoney(...splits.amounts),
        credit: zero,
        dealId: deal.id,
      });
      const payable = await systemAccount(
        tx,
        `commissions_payable.${currency}`,
      );
      payload.splits.forEach((split, index) =>
        lines.push({
          accountId: payable,
          debit: zero,
          credit: splits.amounts[index]!,
          dealId: deal.id,
          memo: staff.find((row) => row.id === split.user_id)?.name ?? null,
        }),
      );
    }
    const entryId = await writeEntry(
      tx,
      {
        entryDate: payload.commission_date,
        currency,
        description: `عمولة ${code} على الصفقة ${deal.code}: ${payer?.fullName ?? ""}`,
        sourceType: "commission",
        sourceId: commissionId,
        idempotencyKey: `commission:${commissionId}`,
        lines,
      },
      { post: true, userId },
    );
    await tx.insert(commissions).values({
      id: commissionId,
      code,
      dealId: deal.id,
      payerRole: payload.payer_role,
      payerPersonId: payerId,
      currency,
      basis: payload.basis,
      rate: payload.basis === "percent" ? payload.rate : null,
      baseAmount,
      amount: total.amount,
      commissionDate: payload.commission_date,
      description: payload.description,
      journalEntryId: entryId,
      createdBy: userId ?? null,
    });
    if (payload.splits.length)
      await tx.insert(commissionSplits).values(
        payload.splits.map((split, index) => ({
          commissionId,
          userId: split.user_id,
          basis: split.basis,
          rate: split.basis === "percent" ? split.rate : null,
          amount: splits.amounts[index]!,
        })),
      );
    return commissionId;
  });
  const [row] = await db
    .select()
    .from(commissions)
    .where(eq(commissions.id, id));
  await recordAudit({
    entityType: "commission",
    entityId: id,
    action: "created",
    newValue: {
      code: row.code,
      deal_id: row.dealId,
      payer_role: row.payerRole,
      amount: row.amount,
      currency: row.currency,
    },
    userId,
  });
  return id;
}

/**
 * Cancels a commission nothing has been collected on and no share of which
 * was paid: posts the reversing entry of its accrual. A settled commission
 * is corrected by voiding its vouchers first.
 */
export async function cancelCommission(
  id: number,
  input: { cancel_date?: string; reason: string },
  userId?: number,
) {
  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(commissions)
      .where(eq(commissions.id, id))
      .for("update");
    if (!row) return null;
    if (row.status === "cancelled")
      throw new DomainError(
        409,
        `العمولة ${row.code} ملغاة أصلاً.`,
        "COMMISSION_CANCELLED",
      );
    const [settled] = await tx
      .select({ code: vouchers.code })
      .from(vouchers)
      .leftJoin(
        commissionSplits,
        eq(vouchers.commissionSplitId, commissionSplits.id),
      )
      .where(
        and(
          eq(vouchers.status, "posted"),
          sql`(${vouchers.commissionId} = ${id} or ${commissionSplits.commissionId} = ${id})`,
        ),
      )
      .limit(1);
    if (settled)
      throw new DomainError(
        409,
        `على العمولة ${row.code} سند ${settled.code}؛ ألغِ سنداتها أولاً.`,
        "COMMISSION_SETTLED",
      );
    const cancelEntryId = await reverseEntry(
      tx,
      row.journalEntryId,
      {
        entryDate: input.cancel_date,
        reason: `إلغاء العمولة ${row.code}: ${input.reason}`,
      },
      userId,
    );
    await tx
      .update(commissions)
      .set({
        status: "cancelled",
        cancelEntryId,
        cancelReason: input.reason,
        cancelledAt: new Date(),
        cancelledBy: userId ?? null,
      })
      .where(eq(commissions.id, id));
    return row;
  });
  if (!done) return null;
  await recordAudit({
    entityType: "commission",
    entityId: id,
    action: "status_changed",
    oldValue: { status: "active" },
    newValue: { status: "cancelled", reason: input.reason },
    userId,
  });
  return id;
}

/** What is left to collect on a commission (inside the caller's lock). */
export async function commissionLeft(tx: Transaction, id: number) {
  const [row] = await tx
    .select()
    .from(commissions)
    .where(eq(commissions.id, id))
    .for("update");
  if (!row) return null;
  return {
    row,
    left: outstanding(row.amount, await commissionCollected(tx, id)),
  };
}

/** What is left to pay on a share (inside the caller's lock). */
export async function splitLeft(tx: Transaction, id: number) {
  const [split] = await tx
    .select()
    .from(commissionSplits)
    .where(eq(commissionSplits.id, id))
    .for("update");
  if (!split) return null;
  const [commission] = await tx
    .select()
    .from(commissions)
    .where(eq(commissions.id, split.commissionId));
  const [user] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, split.userId));
  return {
    split,
    commission: commission!,
    userName: user?.name ?? "",
    left: outstanding(split.amount, await splitPaid(tx, id)),
  };
}
