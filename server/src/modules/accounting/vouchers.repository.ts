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
import { db } from "../../infrastructure/database/db.js";
import { rawRows } from "../../infrastructure/database/raw-query.js";
import {
  lookupValue,
  qualified,
} from "../../infrastructure/database/lookup.js";
import {
  officeProfiles,
  vouchers,
} from "../../infrastructure/database/schema.js";
import { decimalAmountInWords } from "../../shared/contract-document/index.js";
import type { Currency } from "../../shared/money.js";
import { pageOffset } from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import type { VoucherPageQuery } from "./vouchers.schema.js";

/**
 * A voucher with the names and codes of what it links to, one lookup each
 * rather than a join each (`lookupValue`). Filters and sorting use the
 * voucher's own columns, so the page is cut first.
 */
const lookup = lookupValue;
const own = (column: string) => qualified("vouchers", column);

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
      money_account_code: sql<string>`${lookup("accounts", "code", own("money_account_id"))}`,
      money_account_name: sql<string>`${lookup("accounts", "name", own("money_account_id"))}`,
      other_account_id: vouchers.otherAccountId,
      other_account_code: sql<string>`${lookup("accounts", "code", own("other_account_id"))}`,
      other_account_name: sql<string>`${lookup("accounts", "name", own("other_account_id"))}`,
      person_id: vouchers.personId,
      party_name: vouchers.partyName,
      held_for_person_id: vouchers.heldForPersonId,
      held_for_name: sql<
        string | null
      >`${lookup("people", "full_name", own("held_for_person_id"))}`,
      deal_id: vouchers.dealId,
      deal_code: sql<string | null>`${lookup("deals", "code", own("deal_id"))}`,
      description: vouchers.description,
      reference: vouchers.reference,
      commission_id: vouchers.commissionId,
      // A share paid names its split; its commission is the split's.
      commission_code: sql<string | null>`${lookup(
        "commissions",
        "code",
        `coalesce(${own("commission_id")}, (SELECT commission_id FROM commission_splits WHERE id = ${own("commission_split_id")}))`,
      )}`,
      commission_split_id: vouchers.commissionSplitId,
      expense_category_id: vouchers.expenseCategoryId,
      expense_category_name: sql<
        string | null
      >`${lookup("expense_categories", "name", own("expense_category_id"))}`,
      lease_id: vouchers.leaseId,
      lease_code: sql<
        string | null
      >`${lookup("leases", "code", own("lease_id"))}`,
      lease_installment_id: vouchers.leaseInstallmentId,
      lease_installment_seq: sql<
        number | null
      >`${lookup("lease_installments", "seq", own("lease_installment_id"))}`,
      status: vouchers.status,
      journal_entry_id: vouchers.journalEntryId,
      journal_entry_code: sql<string>`${lookup("journal_entries", "code", own("journal_entry_id"))}`,
      void_entry_id: vouchers.voidEntryId,
      void_entry_code: sql<
        string | null
      >`${lookup("journal_entries", "code", own("void_entry_id"))}`,
      void_reason: vouchers.voidReason,
      voided_at: vouchers.voidedAt,
      voided_by_name: sql<
        string | null
      >`${lookup("users", "display_name", own("voided_by"))}`,
      created_by_name: sql<
        string | null
      >`${lookup("users", "display_name", own("created_by"))}`,
      created_at: vouchers.createdAt,
    })
    .from(vouchers);
}

function conditions(query: VoucherPageQuery): SQL | undefined {
  const where: SQL[] = [];
  if (query.kind) where.push(eq(vouchers.kind, query.kind));
  if (query.currency) where.push(eq(vouchers.currency, query.currency));
  if (query.status) where.push(eq(vouchers.status, query.status));
  if (query.purpose) where.push(eq(vouchers.purpose, query.purpose));
  // A customer's vouchers: paid by or to them, or client funds held for them.
  if (query.person_id)
    where.push(
      or(
        eq(vouchers.personId, query.person_id),
        eq(vouchers.heldForPersonId, query.person_id),
      )!,
    );
  if (query.deal_id) where.push(eq(vouchers.dealId, query.deal_id));
  if (query.money_account_id)
    where.push(eq(vouchers.moneyAccountId, query.money_account_id));
  if (query.commission_id)
    where.push(eq(vouchers.commissionId, query.commission_id));
  if (query.expense_category_id)
    where.push(eq(vouchers.expenseCategoryId, query.expense_category_id));
  if (query.lease_id) where.push(eq(vouchers.leaseId, query.lease_id));
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
