import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import { rawRows } from "../../infrastructure/database/raw-query.js";
import {
  accounts,
  commissionSplits,
  commissions,
  deals,
  expenseCategories,
  journalEntries,
  officeProfiles,
  users,
  vouchers,
} from "../../infrastructure/database/schema.js";
import { decimalAmountInWords } from "../../shared/contract-document/index.js";
import type { Currency } from "../../shared/money.js";
import { pageOffset } from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import type { VoucherPageQuery } from "./vouchers.schema.js";

const moneyAccount = alias(accounts, "money_account");
const otherAccount = alias(accounts, "other_account");
const entry = alias(journalEntries, "entry");
const voidEntry = alias(journalEntries, "void_entry");
const creator = alias(users, "creator");
const voider = alias(users, "voider");

function selectVouchers() {
  return db
    .select({
      id: vouchers.id,
      code: vouchers.code,
      kind: vouchers.kind,
      voucher_date: vouchers.voucherDate,
      currency: vouchers.currency,
      amount: vouchers.amount,
      purpose: vouchers.purpose,
      money_account_id: vouchers.moneyAccountId,
      money_account_code: moneyAccount.code,
      money_account_name: moneyAccount.name,
      other_account_id: vouchers.otherAccountId,
      other_account_code: otherAccount.code,
      other_account_name: otherAccount.name,
      person_id: vouchers.personId,
      party_name: vouchers.partyName,
      deal_id: vouchers.dealId,
      deal_code: deals.code,
      description: vouchers.description,
      reference: vouchers.reference,
      commission_id: vouchers.commissionId,
      commission_code: commissions.code,
      commission_split_id: vouchers.commissionSplitId,
      expense_category_id: vouchers.expenseCategoryId,
      expense_category_name: expenseCategories.name,
      status: vouchers.status,
      journal_entry_id: vouchers.journalEntryId,
      journal_entry_code: entry.code,
      void_entry_id: vouchers.voidEntryId,
      void_entry_code: voidEntry.code,
      void_reason: vouchers.voidReason,
      voided_at: vouchers.voidedAt,
      voided_by_name: voider.displayName,
      created_by_name: creator.displayName,
      created_at: vouchers.createdAt,
    })
    .from(vouchers)
    .innerJoin(moneyAccount, eq(vouchers.moneyAccountId, moneyAccount.id))
    .innerJoin(otherAccount, eq(vouchers.otherAccountId, otherAccount.id))
    .innerJoin(entry, eq(vouchers.journalEntryId, entry.id))
    .leftJoin(voidEntry, eq(vouchers.voidEntryId, voidEntry.id))
    .leftJoin(deals, eq(vouchers.dealId, deals.id))
    .leftJoin(
      commissions,
      sql`${commissions.id} = coalesce(${vouchers.commissionId}, (select ${commissionSplits.commissionId} from ${commissionSplits} where ${commissionSplits.id} = ${vouchers.commissionSplitId}))`,
    )
    .leftJoin(
      expenseCategories,
      eq(vouchers.expenseCategoryId, expenseCategories.id),
    )
    .leftJoin(creator, eq(vouchers.createdBy, creator.id))
    .leftJoin(voider, eq(vouchers.voidedBy, voider.id));
}

function conditions(query: VoucherPageQuery): SQL | undefined {
  const where: SQL[] = [];
  if (query.kind) where.push(eq(vouchers.kind, query.kind));
  if (query.currency) where.push(eq(vouchers.currency, query.currency));
  if (query.status) where.push(eq(vouchers.status, query.status));
  if (query.purpose) where.push(eq(vouchers.purpose, query.purpose));
  if (query.person_id) where.push(eq(vouchers.personId, query.person_id));
  if (query.deal_id) where.push(eq(vouchers.dealId, query.deal_id));
  if (query.money_account_id)
    where.push(eq(vouchers.moneyAccountId, query.money_account_id));
  if (query.commission_id)
    where.push(eq(vouchers.commissionId, query.commission_id));
  if (query.expense_category_id)
    where.push(eq(vouchers.expenseCategoryId, query.expense_category_id));
  if (query.from) where.push(gte(vouchers.voucherDate, query.from));
  if (query.to) where.push(lte(vouchers.voucherDate, query.to));
  if (query.q) {
    const pattern = containsPattern(query.q);
    where.push(
      or(
        ilike(vouchers.code, pattern),
        ilike(vouchers.partyName, pattern),
        ilike(vouchers.description, pattern),
        ilike(vouchers.reference, pattern),
      )!,
    );
  }
  return where.length ? and(...where) : undefined;
}

const SORT_COLUMNS = {
  voucher_date: vouchers.voucherDate,
  code: vouchers.code,
  amount: vouchers.amount,
  created_at: vouchers.createdAt,
} as const;

export async function listVouchersPage(query: VoucherPageQuery) {
  const where = conditions(query);
  const order = query.sort_order === "asc" ? asc : desc;
  const items = await selectVouchers()
    .where(where)
    .orderBy(order(SORT_COLUMNS[query.sort_by]), order(vouchers.id))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(vouchers)
    .where(where);
  return { items, total, page: query.page, page_size: query.page_size };
}

/**
 * A voucher as its page and its printed copy show it, with the office's
 * header for the printout (whoever may read vouchers may print them, without
 * the settings permission).
 */
export async function getVoucher(id: number) {
  const [row] = await selectVouchers().where(eq(vouchers.id, id));
  if (!row) return null;
  const [office] = await db
    .select({
      company_name: officeProfiles.companyName,
      phone_primary: officeProfiles.phonePrimary,
      phone_secondary: officeProfiles.phoneSecondary,
      address: officeProfiles.address,
      license_number: officeProfiles.licenseNumber,
    })
    .from(officeProfiles)
    .limit(1);
  return {
    ...row,
    amount_in_words: decimalAmountInWords(row.amount, row.currency as Currency),
    office: office ?? null,
  };
}

/**
 * The active cash and bank posting accounts (anywhere under the default
 * "cash" and "bank" headings), each with its posted balance, for the voucher
 * form: money is paid only from what an account holds.
 */
export async function listMoneyAccounts(asOf?: string) {
  const rows = await rawRows(sql`
    WITH RECURSIVE tree AS (
      SELECT id, system_key AS kind FROM accounts WHERE system_key IN ('cash', 'bank')
      UNION ALL
      SELECT child.id, tree.kind FROM accounts child JOIN tree ON child.parent_id = tree.id
    )
    SELECT a.id, a.code, a.name, a.currency, tree.kind,
      coalesce((
        SELECT sum(l.debit - l.credit)
        FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
        WHERE l.account_id = a.id AND e.status = 'posted'
          AND (${asOf ?? null}::date IS NULL OR e.entry_date <= ${asOf ?? null}::date)
      ), 0)::numeric(18,2)::text AS balance
    FROM tree JOIN accounts a ON a.id = tree.id
    WHERE a.is_postable AND a.is_active
    ORDER BY a.code`);
  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code as string,
    name: row.name as string,
    currency: row.currency as Currency,
    kind: row.kind as "cash" | "bank",
    balance: row.balance as string,
  }));
}
