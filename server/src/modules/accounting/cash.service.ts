import { asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  lockRecordCodes,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";
import {
  accounts,
  cashReconciliations,
  cashTransfers,
  expenseCategories,
  journalEntries,
  users,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { compareMoney, type Currency } from "../../shared/money.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  adjustmentLines,
  categoryAccountError,
  reconciliationDifference,
  transferError,
} from "./cash.rules.js";
import type {
  ExpenseCategoryPayload,
  ReconciliationPayload,
  TransferPayload,
} from "./cash.schema.js";
import { reverseEntry, writeEntry } from "./ledger.service.js";
import { isMoneyAccount } from "./vouchers.rules.js";
import { chartWithHeadings, postedBalance } from "./vouchers.service.js";

/**
 * Transfers between cash and bank accounts, reconciliations of a count or a
 * statement against the books, and expense categories. Transfers and
 * reconciliation adjustments are posted through the ledger's gateway in the
 * same transaction as their record.
 */

async function nextCode(tx: Transaction, table: string, prefix: string) {
  await lockRecordCodes(tx, table);
  const source =
    table === "cash_transfers" ? cashTransfers : cashReconciliations;
  const [last] = await tx
    .select({ code: source.code })
    .from(source)
    .orderBy(desc(source.id))
    .limit(1);
  const next = last ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `${prefix}-${String(next).padStart(6, "0")}`;
}

async function reserveId(tx: Transaction, table: string) {
  const [row] = (
    await tx.execute<{ id: string }>(
      sql`SELECT nextval(pg_get_serial_sequence(${table}, 'id')) AS id`,
    )
  ).rows;
  return Number(row!.id);
}

/** An account row locked against other payments and transfers out of it. */
async function lockMoney(tx: Transaction, accountId: number) {
  await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .for("no key update");
}

export async function createTransfer(
  payload: TransferPayload,
  userId?: number,
) {
  const id = await db.transaction(async (tx) => {
    const chart = await chartWithHeadings(tx);
    const from = chart.asVoucherAccount(payload.from_account_id);
    const to = chart.asVoucherAccount(payload.to_account_id);
    const error = transferError(from, to, payload.currency);
    if (error) throw new DomainError(400, error, "TRANSFER_RULE");
    await lockMoney(tx, from!.id);
    const available = await postedBalance(tx, from!.id, "debit");
    if (compareMoney(payload.amount, available) > 0)
      throw new DomainError(
        409,
        `رصيد الحساب ${from!.code} ${available} لا يكفي لتحويل ${payload.amount}.`,
        "TRANSFER_BALANCE",
      );
    const transferId = await reserveId(tx, "cash_transfers");
    const code = await nextCode(tx, "cash_transfers", "TR");
    const entryId = await writeEntry(
      tx,
      {
        entryDate: payload.transfer_date,
        currency: payload.currency,
        description: `تحويل ${code}: ${payload.description}`,
        sourceType: "transfer",
        sourceId: transferId,
        idempotencyKey: `transfer:${transferId}`,
        lines: [
          { accountId: to!.id, debit: payload.amount, credit: "0.00" },
          { accountId: from!.id, debit: "0.00", credit: payload.amount },
        ],
      },
      { post: true, userId },
    );
    await tx.insert(cashTransfers).values({
      id: transferId,
      code,
      transferDate: payload.transfer_date,
      currency: payload.currency,
      fromAccountId: from!.id,
      toAccountId: to!.id,
      amount: payload.amount,
      description: payload.description,
      reference: payload.reference,
      journalEntryId: entryId,
      createdBy: userId ?? null,
    });
    return transferId;
  });
  const [row] = await db
    .select()
    .from(cashTransfers)
    .where(eq(cashTransfers.id, id));
  await recordAudit({
    entityType: "cash_transfer",
    entityId: id,
    action: "created",
    newValue: { code: row.code, amount: row.amount, currency: row.currency },
    userId,
  });
  return id;
}

/**
 * Voids a transfer: posts its reversing entry. The money must still be in
 * the account it went to, or the reversal would take out what was spent.
 */
export async function voidTransfer(
  id: number,
  input: { void_date?: string; reason: string },
  userId?: number,
) {
  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(cashTransfers)
      .where(eq(cashTransfers.id, id))
      .for("update");
    if (!row) return null;
    if (row.status === "voided")
      throw new DomainError(
        409,
        `التحويل ${row.code} ملغى أصلاً.`,
        "TRANSFER_VOIDED",
      );
    await lockMoney(tx, row.toAccountId);
    const held = await postedBalance(tx, row.toAccountId, "debit");
    if (compareMoney(row.amount, held) > 0)
      throw new DomainError(
        409,
        `في الحساب المحوَّل إليه ${held} فقط؛ لا يُلغى تحويل ${row.amount} منه.`,
        "TRANSFER_BALANCE",
      );
    const voidEntryId = await reverseEntry(
      tx,
      row.journalEntryId,
      {
        entryDate: input.void_date,
        reason: `إلغاء التحويل ${row.code}: ${input.reason}`,
      },
      userId,
    );
    await tx
      .update(cashTransfers)
      .set({
        status: "voided",
        voidEntryId,
        voidReason: input.reason,
        voidedAt: new Date(),
        voidedBy: userId ?? null,
      })
      .where(eq(cashTransfers.id, id));
    return row;
  });
  if (!done) return null;
  await recordAudit({
    entityType: "cash_transfer",
    entityId: id,
    action: "status_changed",
    oldValue: { status: "posted" },
    newValue: { status: "voided", reason: input.reason },
    userId,
  });
  return id;
}

/**
 * Records a count or a statement against the books on its date. With
 * `adjust`, a difference is posted: an overage to other income, a shortage
 * to operating expenses, both in the account's currency.
 */
export async function createReconciliation(
  payload: ReconciliationPayload,
  userId?: number,
) {
  const id = await db.transaction(async (tx) => {
    const chart = await chartWithHeadings(tx);
    const account = chart.asVoucherAccount(payload.account_id);
    if (!account || !isMoneyAccount(account) || !account.isPostable)
      throw new DomainError(
        400,
        "المطابقة لصندوق أو مصرف فقط.",
        "RECONCILIATION_RULE",
      );
    await lockMoney(tx, account.id);
    const book = await postedBalance(tx, account.id, "debit", {
      asOf: payload.statement_date,
    });
    const difference = reconciliationDifference(
      payload.statement_balance,
      book,
    );
    const reconciliationId = await reserveId(tx, "cash_reconciliations");
    const code = await nextCode(tx, "cash_reconciliations", "RN");
    let adjustmentEntryId: number | null = null;
    const lines = payload.adjust
      ? adjustmentLines(
          difference,
          account.id,
          chart.bySystemKey(`other_income.${account.currency}`)!,
          chart.bySystemKey(`operating_expenses.${account.currency}`)!,
        )
      : null;
    if (lines)
      adjustmentEntryId = await writeEntry(
        tx,
        {
          entryDate: payload.statement_date,
          currency: account.currency as Currency,
          description: `تسوية مطابقة ${code}: ${compareMoney(difference, "0.00") > 0 ? "زيادة" : "عجز"} في ${account.code}`,
          sourceType: "reconciliation",
          sourceId: reconciliationId,
          idempotencyKey: `reconciliation:${reconciliationId}`,
          lines,
        },
        { post: true, userId },
      );
    await tx.insert(cashReconciliations).values({
      id: reconciliationId,
      code,
      accountId: account.id,
      statementDate: payload.statement_date,
      statementBalance: payload.statement_balance,
      bookBalance: book,
      difference,
      adjustmentEntryId,
      notes: payload.notes,
      createdBy: userId ?? null,
    });
    return reconciliationId;
  });
  await recordAudit({
    entityType: "cash_reconciliation",
    entityId: id,
    action: "created",
    userId,
  });
  return id;
}

export async function listReconciliations(accountId?: number | null) {
  const creator = alias(users, "creator");
  const entry = alias(journalEntries, "entry");
  return db
    .select({
      id: cashReconciliations.id,
      code: cashReconciliations.code,
      account_id: cashReconciliations.accountId,
      account_code: accounts.code,
      account_name: accounts.name,
      currency: accounts.currency,
      statement_date: cashReconciliations.statementDate,
      statement_balance: cashReconciliations.statementBalance,
      book_balance: cashReconciliations.bookBalance,
      difference: cashReconciliations.difference,
      adjustment_entry_id: cashReconciliations.adjustmentEntryId,
      adjustment_entry_code: entry.code,
      notes: cashReconciliations.notes,
      created_by_name: creator.displayName,
      created_at: cashReconciliations.createdAt,
    })
    .from(cashReconciliations)
    .innerJoin(accounts, eq(cashReconciliations.accountId, accounts.id))
    .leftJoin(entry, eq(cashReconciliations.adjustmentEntryId, entry.id))
    .leftJoin(creator, eq(cashReconciliations.createdBy, creator.id))
    .where(accountId ? eq(cashReconciliations.accountId, accountId) : undefined)
    .orderBy(
      desc(cashReconciliations.statementDate),
      desc(cashReconciliations.id),
    )
    .limit(200);
}

// ─── Expense categories ──────────────────────────────────────────────────

const iqdAccount = alias(accounts, "iqd_account");
const usdAccount = alias(accounts, "usd_account");

export async function listExpenseCategories() {
  return db
    .select({
      id: expenseCategories.id,
      name: expenseCategories.name,
      iqd_account_id: expenseCategories.iqdAccountId,
      iqd_account_code: iqdAccount.code,
      iqd_account_name: iqdAccount.name,
      usd_account_id: expenseCategories.usdAccountId,
      usd_account_code: usdAccount.code,
      usd_account_name: usdAccount.name,
      is_active: expenseCategories.isActive,
    })
    .from(expenseCategories)
    .leftJoin(iqdAccount, eq(expenseCategories.iqdAccountId, iqdAccount.id))
    .leftJoin(usdAccount, eq(expenseCategories.usdAccountId, usdAccount.id))
    .orderBy(asc(expenseCategories.name));
}

async function checkCategoryAccounts(
  tx: Transaction,
  payload: ExpenseCategoryPayload,
) {
  const chart = await chartWithHeadings(tx);
  for (const [id, currency] of [
    [payload.iqd_account_id, "IQD"],
    [payload.usd_account_id, "USD"],
  ] as const) {
    if (!id) continue;
    const error = categoryAccountError(chart.asVoucherAccount(id), currency);
    if (error) throw new DomainError(400, error, "CATEGORY_RULE");
  }
}

async function nameTaken(tx: Transaction, name: string, ownId: number | null) {
  const [row] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.name, name));
  if (row && row.id !== ownId)
    throw new DomainError(409, `التصنيف ${name} موجود.`, "CATEGORY_EXISTS");
}

export async function createExpenseCategory(
  payload: ExpenseCategoryPayload,
  userId?: number,
) {
  const id = await db.transaction(async (tx) => {
    await nameTaken(tx, payload.name, null);
    await checkCategoryAccounts(tx, payload);
    const [row] = await tx
      .insert(expenseCategories)
      .values({
        name: payload.name,
        iqdAccountId: payload.iqd_account_id ?? null,
        usdAccountId: payload.usd_account_id ?? null,
        isActive: payload.is_active,
      })
      .returning({ id: expenseCategories.id });
    return row.id;
  });
  await recordAudit({
    entityType: "expense_category",
    entityId: id,
    action: "created",
    newValue: { name: payload.name },
    userId,
  });
  return id;
}

export async function updateExpenseCategory(
  id: number,
  payload: ExpenseCategoryPayload,
  userId?: number,
) {
  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(eq(expenseCategories.id, id))
      .for("update");
    if (!row) return false;
    await nameTaken(tx, payload.name, id);
    await checkCategoryAccounts(tx, payload);
    await tx
      .update(expenseCategories)
      .set({
        name: payload.name,
        iqdAccountId: payload.iqd_account_id ?? null,
        usdAccountId: payload.usd_account_id ?? null,
        isActive: payload.is_active,
        updatedAt: new Date(),
      })
      .where(eq(expenseCategories.id, id));
    return true;
  });
  if (!done) return null;
  await recordAudit({
    entityType: "expense_category",
    entityId: id,
    action: "updated",
    newValue: { name: payload.name, is_active: payload.is_active },
    userId,
  });
  return id;
}

/** The categories an office starts with, all on operating expenses. */
const DEFAULT_CATEGORIES = [
  "إيجار المكتب",
  "رواتب وأجور",
  "كهرباء ومولدة",
  "إنترنت واتصالات",
  "إعلانات وتسويق",
  "قرطاسية وضيافة",
  "صيانة",
  "نقل ومواصلات",
  "مصروفات أخرى",
];

/**
 * Adds the default categories to an office that has none (a new install, or
 * a restore of an archive from before them). Runs after the default chart.
 */
export async function ensureDefaultExpenseCategories(database: typeof db = db) {
  const table = await database.execute<{ name: string | null }>(
    sql`SELECT to_regclass('expense_categories')::text AS name`,
  );
  if (!table.rows[0]?.name) return 0;
  const [{ count }] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(expenseCategories);
  if (count > 0) return 0;
  const keyed = await database
    .select({ id: accounts.id, key: accounts.systemKey })
    .from(accounts)
    .where(
      sql`${accounts.systemKey} in ('operating_expenses.IQD', 'operating_expenses.USD')`,
    );
  const iqd = keyed.find((row) => row.key === "operating_expenses.IQD")?.id;
  const usd = keyed.find((row) => row.key === "operating_expenses.USD")?.id;
  if (!iqd && !usd) return 0;
  const rows = await database
    .insert(expenseCategories)
    .values(
      DEFAULT_CATEGORIES.map((name) => ({
        name,
        iqdAccountId: iqd ?? null,
        usdAccountId: usd ?? null,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: expenseCategories.id });
  return rows.length;
}
