import { sql, type SQL } from "drizzle-orm";
import {
  rawRows,
  type RawRow,
} from "../../infrastructure/database/raw-query.js";
import {
  CURRENCIES,
  compareMoney,
  fromMinor,
  subtractMoney,
  toMinor,
  type Currency,
} from "../../shared/money.js";
import { accountStatement } from "../accounting/journal.repository.js";
import {
  ageReceivable,
  AGING_BUCKETS,
  monthsBetween,
  officeToday,
  reportPeriod,
  sumOf,
  type ReceivableLine,
} from "./reports.rules.js";
import type {
  AsOfQuery,
  CommissionsReportQuery,
  IncomeStatementQuery,
  PeriodQuery,
} from "./reports.schema.js";

/**
 * The financial reports. Each reads the posted journal (and, for
 * commissions and employees' shares, the documents behind it), so its totals
 * agree with the trial balance. Currencies are never mixed: every report has
 * one section per currency. The formulas are in docs/REPORTS.md.
 */

/**
 * Every account with the heading it falls under: the nearest account at or
 * above it whose system key is a heading (no currency suffix), so an account
 * an office adds under "bank" is a bank account.
 */
const TREE = sql`WITH RECURSIVE tree AS (
    SELECT id,
      CASE WHEN system_key IS NOT NULL AND position('.' in system_key) = 0 THEN system_key END AS heading,
      CASE WHEN system_key IS NOT NULL AND position('.' in system_key) = 0 THEN id END AS heading_id
    FROM accounts WHERE parent_id IS NULL
    UNION ALL
    SELECT child.id,
      coalesce(CASE WHEN child.system_key IS NOT NULL AND position('.' in child.system_key) = 0 THEN child.system_key END, tree.heading),
      coalesce(CASE WHEN child.system_key IS NOT NULL AND position('.' in child.system_key) = 0 THEN child.id END, tree.heading_id)
    FROM accounts child JOIN tree ON child.parent_id = tree.id
  )`;

/** Cash and bank: where the office's own money is. */
const MONEY_HEADINGS = ["cash", "bank"] as const;

const text = (value: unknown) => (value as string | null) ?? "0.00";
const id = (value: unknown) => (value === null ? null : Number(value));
const currencyFilter = (column: SQL, currency?: Currency) =>
  currency ? sql`AND ${column} = ${currency}` : sql``;

/** The currencies to show: the one asked for, else those with figures. */
function currenciesOf(found: Iterable<string>, only?: Currency) {
  if (only) return [only];
  const present = new Set(found);
  return CURRENCIES.filter((currency) => present.has(currency));
}

interface AccountRow {
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  heading: string | null;
  heading_name: string | null;
}
const accountOf = (row: RawRow): AccountRow => ({
  account_id: Number(row.id),
  code: row.code as string,
  name: row.name as string,
  account_type: row.account_type as string,
  heading: (row.heading as string | null) ?? null,
  heading_name: (row.heading_name as string | null) ?? null,
});

// ─── Trial balance ─────────────────────────────────────────────────────

/**
 * Every account with posted lines up to `to`: its balance before the
 * period, the debits and credits in it, and its balance at its end (debit
 * balances positive). The debits equal the credits in each currency.
 */
export async function trialBalance(query: PeriodQuery) {
  const { from, to } = reportPeriod(query);
  const found = await rawRows(sql`${TREE},
    moves AS (
      SELECT l.account_id,
        coalesce(sum(l.debit - l.credit) FILTER (WHERE e.entry_date < ${from}), 0) AS opening,
        coalesce(sum(l.debit) FILTER (WHERE e.entry_date >= ${from}), 0) AS debit,
        coalesce(sum(l.credit) FILTER (WHERE e.entry_date >= ${from}), 0) AS credit
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      WHERE e.status = 'posted' AND e.entry_date <= ${to}
      GROUP BY l.account_id
    )
    SELECT a.id, a.code, a.name, a.account_type, a.currency, t.heading, h.name AS heading_name,
      m.opening::numeric(18,2)::text AS opening, m.debit::numeric(18,2)::text AS debit,
      m.credit::numeric(18,2)::text AS credit
    FROM moves m
    JOIN accounts a ON a.id = m.account_id
    JOIN tree t ON t.id = a.id
    LEFT JOIN accounts h ON h.id = t.heading_id
    WHERE true ${currencyFilter(sql`a.currency`, query.currency)}
    ORDER BY a.code`);

  const sections = currenciesOf(
    found.map((row) => row.currency as string),
    query.currency,
  ).map((currency) => {
    const rows = found
      .filter((row) => row.currency === currency)
      .map((row) => {
        const opening = toMinor(text(row.opening));
        const closing =
          opening + toMinor(text(row.debit)) - toMinor(text(row.credit));
        return {
          ...accountOf(row),
          opening: fromMinor(opening),
          debit: text(row.debit),
          credit: text(row.credit),
          closing_debit: fromMinor(closing > 0n ? closing : 0n),
          closing_credit: fromMinor(closing < 0n ? -closing : 0n),
        };
      });
    const totals = {
      opening: sumOf(rows.map((row) => row.opening)),
      debit: sumOf(rows.map((row) => row.debit)),
      credit: sumOf(rows.map((row) => row.credit)),
      closing_debit: sumOf(rows.map((row) => row.closing_debit)),
      closing_credit: sumOf(rows.map((row) => row.closing_credit)),
    };
    return {
      currency,
      rows,
      totals,
      balanced:
        compareMoney(totals.debit, totals.credit) === 0 &&
        compareMoney(totals.closing_debit, totals.closing_credit) === 0,
    };
  });
  return { from, to, sections };
}

// ─── Income and expenses ───────────────────────────────────────────────

/**
 * Revenue and expense accounts' movement in the period (revenue: credits
 * less debits; expenses: debits less credits), month by month when asked,
 * and the net. Client funds are a liability and never appear here, nor
 * does a listing's price. Expenses paid by voucher are also split by the
 * voucher's category, from the same journal lines.
 */
export async function incomeStatement(query: IncomeStatementQuery) {
  const { from, to } = reportPeriod(query);
  const [found, categories] = await Promise.all([
    rawRows(sql`${TREE}
      SELECT a.id, a.code, a.name, a.account_type, a.currency, t.heading, h.name AS heading_name,
        to_char(e.entry_date, 'YYYY-MM') AS month,
        sum(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit ELSE l.debit - l.credit END)::numeric(18,2)::text AS amount
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN accounts a ON a.id = l.account_id
      JOIN tree t ON t.id = a.id
      LEFT JOIN accounts h ON h.id = t.heading_id
      WHERE e.status = 'posted' AND e.entry_date BETWEEN ${from} AND ${to}
        AND a.account_type IN ('revenue', 'expense')
        ${currencyFilter(sql`a.currency`, query.currency)}
      GROUP BY a.id, a.code, a.name, a.account_type, a.currency, t.heading, h.name, month
      ORDER BY a.code, month`),
    // A voucher's entry and its void's reversal both name the voucher.
    rawRows(sql`
      SELECT e.currency, c.id AS category_id, c.name AS category_name,
        sum(l.debit - l.credit)::numeric(18,2)::text AS amount
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN accounts a ON a.id = l.account_id AND a.account_type = 'expense'
      JOIN vouchers v ON v.journal_entry_id = e.id OR v.void_entry_id = e.id
      LEFT JOIN expense_categories c ON c.id = v.expense_category_id
      WHERE e.status = 'posted' AND e.entry_date BETWEEN ${from} AND ${to}
        AND v.kind = 'payment'
        ${currencyFilter(sql`e.currency`, query.currency)}
      GROUP BY e.currency, c.id, c.name
      HAVING sum(l.debit - l.credit) <> 0
      ORDER BY e.currency, c.name NULLS LAST`),
  ]);

  const months = query.group === "month" ? monthsBetween(from, to) : [];
  const sections = currenciesOf(
    found.map((row) => row.currency as string),
    query.currency,
  ).map((currency) => {
    const accounts = new Map<
      number,
      AccountRow & { amount: bigint; by_month: Map<string, bigint> }
    >();
    for (const row of found.filter((item) => item.currency === currency)) {
      const key = Number(row.id);
      const entry = accounts.get(key) ?? {
        ...accountOf(row),
        amount: 0n,
        by_month: new Map(),
      };
      const amount = toMinor(text(row.amount));
      entry.amount += amount;
      const month = row.month as string;
      entry.by_month.set(month, (entry.by_month.get(month) ?? 0n) + amount);
      accounts.set(key, entry);
    }
    const shape = (type: "revenue" | "expense") =>
      [...accounts.values()]
        .filter((row) => row.account_type === type)
        .map(({ amount, by_month, ...row }) => ({
          ...row,
          amount: fromMinor(amount),
          by_month: months.map((month) => ({
            month,
            amount: fromMinor(by_month.get(month) ?? 0n),
          })),
        }));
    const revenue = shape("revenue");
    const expenses = shape("expense");
    const total = (list: typeof revenue, month?: string) =>
      sumOf(
        list.map((row) =>
          month
            ? row.by_month.find((item) => item.month === month)!.amount
            : row.amount,
        ),
      );
    return {
      currency,
      revenue,
      expenses,
      expense_categories: categories
        .filter((row) => row.currency === currency)
        .map((row) => ({
          category_id: id(row.category_id),
          category_name: (row.category_name as string | null) ?? null,
          amount: text(row.amount),
        })),
      totals: {
        revenue: total(revenue),
        expenses: total(expenses),
        net: subtractMoney(total(revenue), total(expenses)),
      },
      by_month: months.map((month) => ({
        month,
        revenue: total(revenue, month),
        expenses: total(expenses, month),
        net: subtractMoney(total(revenue, month), total(expenses, month)),
      })),
    };
  });
  return { from, to, group: query.group, months, sections };
}

// ─── Balance sheet ─────────────────────────────────────────────────────

/**
 * Assets, liabilities and equity on a day, and the earnings not yet closed
 * into equity (all revenue less all expenses up to that day). Assets equal
 * liabilities, equity and those earnings in each currency.
 */
export async function balanceSheet(query: AsOfQuery) {
  const asOf = query.as_of ?? officeToday();
  const found = await rawRows(sql`${TREE}
    SELECT a.id, a.code, a.name, a.account_type, a.currency, t.heading, h.name AS heading_name,
      sum(l.debit - l.credit)::numeric(18,2)::text AS balance
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN accounts a ON a.id = l.account_id
    JOIN tree t ON t.id = a.id
    LEFT JOIN accounts h ON h.id = t.heading_id
    WHERE e.status = 'posted' AND e.entry_date <= ${asOf}
      ${currencyFilter(sql`a.currency`, query.currency)}
    GROUP BY a.id, a.code, a.name, a.account_type, a.currency, t.heading, h.name
    ORDER BY a.code`);

  const sections = currenciesOf(
    found.map((row) => row.currency as string),
    query.currency,
  ).map((currency) => {
    const rows = found.filter((row) => row.currency === currency);
    // Debit balances for assets; credit balances for the rest.
    const side = (type: string) =>
      rows
        .filter((row) => row.account_type === type)
        .map((row) => {
          const debit = toMinor(text(row.balance));
          return {
            ...accountOf(row),
            balance: fromMinor(type === "asset" ? debit : -debit),
          };
        })
        .filter((row) => row.balance !== "0.00");
    const assets = side("asset");
    const liabilities = side("liability");
    const equity = side("equity");
    const earnings = fromMinor(
      -rows
        .filter((row) =>
          ["revenue", "expense"].includes(row.account_type as string),
        )
        .reduce((sum, row) => sum + toMinor(text(row.balance)), 0n),
    );
    const totals = {
      assets: sumOf(assets.map((row) => row.balance)),
      liabilities: sumOf(liabilities.map((row) => row.balance)),
      equity: sumOf(equity.map((row) => row.balance)),
      earnings,
    };
    const claims = sumOf([totals.liabilities, totals.equity, earnings]);
    return {
      currency,
      assets,
      liabilities,
      equity,
      totals: { ...totals, liabilities_and_equity: claims },
      balanced: compareMoney(totals.assets, claims) === 0,
    };
  });
  return { as_of: asOf, sections };
}

// ─── Cash flow ─────────────────────────────────────────────────────────

/**
 * Money in and out of cash and bank in the period, by what it was for: each
 * entry touching them is split over its other lines, a credit there being
 * money in and a debit money out (a transfer between them has no other
 * line, so it moves nothing in total). With each account's opening, money
 * in, money out and closing; the opening plus the net equals the closing.
 */
export async function cashFlow(query: PeriodQuery) {
  const { from, to } = reportPeriod(query);
  const moneyIds = sql`SELECT id FROM tree WHERE heading IN (${sql.join(
    MONEY_HEADINGS.map((key) => sql`${key}`),
    sql`, `,
  )})`;
  const [categories, accounts] = await Promise.all([
    rawRows(sql`${TREE},
      touched AS (
        SELECT DISTINCT l.entry_id FROM journal_lines l
        JOIN journal_entries e ON e.id = l.entry_id
        WHERE e.status = 'posted' AND e.entry_date BETWEEN ${from} AND ${to}
          AND l.account_id IN (${moneyIds})
      )
      SELECT e.currency, coalesce(t.heading, a.account_type) AS category,
        coalesce(h.name, a.name) AS category_name,
        sum(greatest(l.credit - l.debit, 0))::numeric(18,2)::text AS money_in,
        sum(greatest(l.debit - l.credit, 0))::numeric(18,2)::text AS money_out
      FROM journal_lines l
      JOIN touched x ON x.entry_id = l.entry_id
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN accounts a ON a.id = l.account_id
      JOIN tree t ON t.id = a.id
      LEFT JOIN accounts h ON h.id = t.heading_id
      WHERE l.account_id NOT IN (${moneyIds})
        ${currencyFilter(sql`e.currency`, query.currency)}
      GROUP BY e.currency, coalesce(t.heading, a.account_type), coalesce(h.name, a.name)
      ORDER BY e.currency, category`),
    rawRows(sql`${TREE}
      SELECT a.id, a.code, a.name, a.account_type, a.currency, t.heading, h.name AS heading_name,
        coalesce(sum(l.debit - l.credit) FILTER (WHERE e.entry_date < ${from}), 0)::numeric(18,2)::text AS opening,
        coalesce(sum(l.debit) FILTER (WHERE e.entry_date >= ${from}), 0)::numeric(18,2)::text AS money_in,
        coalesce(sum(l.credit) FILTER (WHERE e.entry_date >= ${from}), 0)::numeric(18,2)::text AS money_out
      FROM accounts a
      JOIN tree t ON t.id = a.id
      LEFT JOIN accounts h ON h.id = t.heading_id
      LEFT JOIN journal_lines l ON l.account_id = a.id
        AND EXISTS (SELECT 1 FROM journal_entries e2 WHERE e2.id = l.entry_id
          AND e2.status = 'posted' AND e2.entry_date <= ${to})
      LEFT JOIN journal_entries e ON e.id = l.entry_id
      WHERE a.is_postable AND a.id IN (${moneyIds})
        ${currencyFilter(sql`a.currency`, query.currency)}
      GROUP BY a.id, a.code, a.name, a.account_type, a.currency, t.heading, h.name
      ORDER BY a.code`),
  ]);

  const sections = currenciesOf(
    [...categories, ...accounts]
      .filter(
        (row) =>
          row.money_in !== "0.00" ||
          row.money_out !== "0.00" ||
          (row.opening !== undefined && row.opening !== "0.00"),
      )
      .map((row) => row.currency as string),
    query.currency,
  ).map((currency) => {
    const flows = categories
      .filter((row) => row.currency === currency)
      .map((row) => ({
        category: row.category as string,
        category_name: row.category_name as string,
        money_in: text(row.money_in),
        money_out: text(row.money_out),
        net: subtractMoney(text(row.money_in), text(row.money_out)),
      }));
    const rows = accounts
      .filter((row) => row.currency === currency)
      .map((row) => ({
        ...accountOf(row),
        opening: text(row.opening),
        money_in: text(row.money_in),
        money_out: text(row.money_out),
        closing: fromMinor(
          toMinor(text(row.opening)) +
            toMinor(text(row.money_in)) -
            toMinor(text(row.money_out)),
        ),
      }));
    const opening = sumOf(rows.map((row) => row.opening));
    const closing = sumOf(rows.map((row) => row.closing));
    const net = sumOf(flows.map((row) => row.net));
    return {
      currency,
      categories: flows,
      accounts: rows,
      totals: {
        opening,
        money_in: sumOf(flows.map((row) => row.money_in)),
        money_out: sumOf(flows.map((row) => row.money_out)),
        net,
        closing,
      },
      // The categories explain the whole change in cash and bank.
      balanced: compareMoney(sumOf([opening, net]), closing) === 0,
    };
  });
  return { from, to, sections };
}

// ─── Commissions ───────────────────────────────────────────────────────

/**
 * Commissions recorded in the period (by their date), with what was
 * collected on them and their employees' shares and what was paid of them,
 * by vouchers dated up to the period's end that are not voided. Cancelled
 * ones are listed apart and left out of the totals. With one employee, only
 * the commissions they have a share in.
 */
export async function commissionsReport(query: CommissionsReportQuery) {
  const { from, to } = reportPeriod(query);
  const LIMIT = 2000;
  const userFilter = query.user_id
    ? sql`AND EXISTS (SELECT 1 FROM commission_splits s WHERE s.commission_id = c.id AND s.user_id = ${query.user_id})`
    : sql``;
  const [found, shares] = await Promise.all([
    rawRows(sql`
      SELECT c.id, c.code, c.commission_date::text, c.currency, c.amount::text, c.status,
        c.payer_role, c.payer_person_id, p.full_name AS payer_name,
        d.id AS deal_id, d.code AS deal_code, d.deal_type,
        coalesce((SELECT sum(v.amount) FROM vouchers v
          WHERE v.commission_id = c.id AND v.status = 'posted' AND v.voucher_date <= ${to}), 0)::numeric(18,2)::text AS collected,
        coalesce((SELECT sum(s.amount) FROM commission_splits s WHERE s.commission_id = c.id), 0)::numeric(18,2)::text AS shares,
        coalesce((SELECT sum(v.amount) FROM vouchers v JOIN commission_splits s ON s.id = v.commission_split_id
          WHERE s.commission_id = c.id AND v.status = 'posted' AND v.voucher_date <= ${to}), 0)::numeric(18,2)::text AS shares_paid
      FROM commissions c
      JOIN deals d ON d.id = c.deal_id
      LEFT JOIN people p ON p.id = c.payer_person_id
      WHERE c.commission_date BETWEEN ${from} AND ${to}
        ${currencyFilter(sql`c.currency`, query.currency)} ${userFilter}
      ORDER BY c.commission_date, c.id
      LIMIT ${LIMIT + 1}`),
    rawRows(sql`
      SELECT c.currency, s.user_id, u.display_name,
        count(DISTINCT c.id)::int AS commissions,
        sum(s.amount)::numeric(18,2)::text AS shares,
        coalesce(sum((SELECT sum(v.amount) FROM vouchers v
          WHERE v.commission_split_id = s.id AND v.status = 'posted' AND v.voucher_date <= ${to})), 0)::numeric(18,2)::text AS paid
      FROM commission_splits s
      JOIN commissions c ON c.id = s.commission_id AND c.status = 'active'
      JOIN users u ON u.id = s.user_id
      WHERE c.commission_date BETWEEN ${from} AND ${to}
        ${currencyFilter(sql`c.currency`, query.currency)}
        ${query.user_id ? sql`AND s.user_id = ${query.user_id}` : sql``}
      GROUP BY c.currency, s.user_id, u.display_name
      ORDER BY c.currency, u.display_name`),
  ]);
  const listed = found.slice(0, LIMIT).map((row) => {
    const active = row.status === "active";
    return {
      id: Number(row.id),
      code: row.code as string,
      commission_date: row.commission_date as string,
      currency: row.currency as Currency,
      status: row.status as string,
      payer_role: row.payer_role as string,
      payer_person_id: id(row.payer_person_id),
      payer_name: (row.payer_name as string | null) ?? null,
      deal_id: Number(row.deal_id),
      deal_code: row.deal_code as string,
      deal_type: row.deal_type as string,
      amount: row.amount as string,
      collected: text(row.collected),
      outstanding: active
        ? subtractMoney(row.amount as string, text(row.collected))
        : "0.00",
      shares: text(row.shares),
      shares_paid: text(row.shares_paid),
    };
  });

  const sections = currenciesOf(
    [...found, ...shares].map((row) => row.currency as string),
    query.currency,
  ).map((currency) => {
    const rows = listed.filter((row) => row.currency === currency);
    const active = rows.filter((row) => row.status === "active");
    const recorded = sumOf(active.map((row) => row.amount));
    const sharesTotal = sumOf(active.map((row) => row.shares));
    const byType = (type: string) => {
      const list = active.filter((row) => row.deal_type === type);
      return {
        deal_type: type,
        count: list.length,
        recorded: sumOf(list.map((row) => row.amount)),
        collected: sumOf(list.map((row) => row.collected)),
      };
    };
    return {
      currency,
      rows,
      totals: {
        count: active.length,
        recorded,
        collected: sumOf(active.map((row) => row.collected)),
        outstanding: sumOf(active.map((row) => row.outstanding)),
        shares: sharesTotal,
        shares_paid: sumOf(active.map((row) => row.shares_paid)),
        shares_owed: subtractMoney(
          sharesTotal,
          sumOf(active.map((row) => row.shares_paid)),
        ),
        office_net: subtractMoney(recorded, sharesTotal),
        cancelled_count: rows.length - active.length,
        cancelled_amount: sumOf(
          rows
            .filter((row) => row.status !== "active")
            .map((row) => row.amount),
        ),
      },
      by_deal_type: ["sale", "rent"].map(byType),
      employees: shares
        .filter((row) => row.currency === currency)
        .map((row) => ({
          user_id: Number(row.user_id),
          display_name: row.display_name as string,
          commissions: Number(row.commissions),
          shares: text(row.shares),
          paid: text(row.paid),
          owed: subtractMoney(text(row.shares), text(row.paid)),
        })),
    };
  });
  return {
    from,
    to,
    user_id: query.user_id ?? null,
    sections,
    truncated: found.length > LIMIT,
  };
}

// ─── Receivables ───────────────────────────────────────────────────────

/**
 * What each customer owes the office on a day (receivable accounts: debits
 * less credits, by the customer each line names), aged oldest charge first.
 * The rows add up to the receivable accounts' balance.
 */
export async function receivables(query: AsOfQuery) {
  const asOf = query.as_of ?? officeToday();
  const lines = await rawRows(sql`${TREE}
    SELECT e.currency, l.person_id, p.full_name, p.phone_primary,
      e.entry_date::text AS date, l.debit::text, l.credit::text
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN tree t ON t.id = l.account_id AND t.heading = 'receivables'
    LEFT JOIN people p ON p.id = l.person_id
    WHERE e.status = 'posted' AND e.entry_date <= ${asOf}
      ${currencyFilter(sql`e.currency`, query.currency)}
    ORDER BY e.entry_date, e.id, l.line_no`);

  const groups = new Map<string, { row: RawRow; lines: ReceivableLine[] }>();
  for (const line of lines) {
    const key = `${line.currency}:${line.person_id ?? ""}`;
    const group = groups.get(key) ?? { row: line, lines: [] };
    group.lines.push({
      date: line.date as string,
      debit: line.debit as string,
      credit: line.credit as string,
    });
    groups.set(key, group);
  }
  const people = [...groups.values()]
    .map(({ row, lines: list }) => ({
      currency: row.currency as Currency,
      person_id: id(row.person_id),
      person_name: (row.full_name as string | null) ?? null,
      phone: (row.phone_primary as string | null) ?? null,
      last_date: list.at(-1)!.date,
      ...ageReceivable(list, asOf),
    }))
    .filter((row) => row.total !== "0.00");

  const sections = currenciesOf(
    people.map((row) => row.currency),
    query.currency,
  ).map((currency) => {
    const rows = people
      .filter((row) => row.currency === currency)
      .sort((a, b) => compareMoney(b.total, a.total));
    const totals = Object.fromEntries(
      [...AGING_BUCKETS.map((bucket) => bucket.key), "total" as const].map(
        (key) => [key, sumOf(rows.map((row) => row[key]))],
      ),
    );
    return { currency, rows, totals };
  });
  return { as_of: asOf, sections };
}

// ─── Payables ──────────────────────────────────────────────────────────

/**
 * What the office owes on a day: client funds it holds for each customer
 * (landlords, sellers, tenants' deposits), other payables by customer, and
 * each employee's commission shares not yet paid. Client funds and payables
 * come from the journal; shares from the commissions behind it, beside the
 * commissions-payable accounts' balance they should equal.
 */
export async function payables(query: AsOfQuery) {
  const asOf = query.as_of ?? officeToday();
  const [byPerson, employees, ledger] = await Promise.all([
    rawRows(sql`${TREE}
      SELECT e.currency, t.heading, l.person_id, p.full_name, p.phone_primary,
        sum(l.credit - l.debit)::numeric(18,2)::text AS amount
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN tree t ON t.id = l.account_id AND t.heading IN ('client_funds', 'payables')
      LEFT JOIN people p ON p.id = l.person_id
      WHERE e.status = 'posted' AND e.entry_date <= ${asOf}
        ${currencyFilter(sql`e.currency`, query.currency)}
      GROUP BY e.currency, t.heading, l.person_id, p.full_name, p.phone_primary
      HAVING sum(l.credit - l.debit) <> 0
      ORDER BY e.currency, t.heading, sum(l.credit - l.debit) DESC`),
    rawRows(sql`
      SELECT c.currency, s.user_id, u.display_name,
        sum(s.amount)::numeric(18,2)::text AS shares,
        coalesce(sum((SELECT sum(v.amount) FROM vouchers v
          WHERE v.commission_split_id = s.id AND v.status = 'posted' AND v.voucher_date <= ${asOf})), 0)::numeric(18,2)::text AS paid
      FROM commission_splits s
      JOIN commissions c ON c.id = s.commission_id AND c.status = 'active'
      JOIN users u ON u.id = s.user_id
      WHERE c.commission_date <= ${asOf}
        ${currencyFilter(sql`c.currency`, query.currency)}
      GROUP BY c.currency, s.user_id, u.display_name
      ORDER BY c.currency, u.display_name`),
    rawRows(sql`${TREE}
      SELECT e.currency, sum(l.credit - l.debit)::numeric(18,2)::text AS amount
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN tree t ON t.id = l.account_id AND t.heading = 'commissions_payable'
      WHERE e.status = 'posted' AND e.entry_date <= ${asOf}
        ${currencyFilter(sql`e.currency`, query.currency)}
      GROUP BY e.currency`),
  ]);

  const sections = currenciesOf(
    [...byPerson, ...employees, ...ledger]
      .filter((row) => row.amount !== "0.00")
      .map((row) => row.currency as string),
    query.currency,
  ).map((currency) => {
    const personRows = (heading: string) =>
      byPerson
        .filter((row) => row.currency === currency && row.heading === heading)
        .map((row) => ({
          person_id: id(row.person_id),
          person_name: (row.full_name as string | null) ?? null,
          phone: (row.phone_primary as string | null) ?? null,
          amount: text(row.amount),
        }));
    const clientFunds = personRows("client_funds");
    const other = personRows("payables");
    const staff = employees
      .filter((row) => row.currency === currency)
      .map((row) => ({
        user_id: Number(row.user_id),
        display_name: row.display_name as string,
        shares: text(row.shares),
        paid: text(row.paid),
        owed: subtractMoney(text(row.shares), text(row.paid)),
      }))
      .filter((row) => row.owed !== "0.00");
    const sharesOwed = sumOf(staff.map((row) => row.owed));
    const sharesLedger = text(
      ledger.find((row) => row.currency === currency)?.amount,
    );
    return {
      currency,
      client_funds: clientFunds,
      payables: other,
      employees: staff,
      totals: {
        client_funds: sumOf(clientFunds.map((row) => row.amount)),
        payables: sumOf(other.map((row) => row.amount)),
        employee_shares: sharesOwed,
        // What the journal holds for shares; differs only by manual entries.
        employee_shares_ledger: sharesLedger,
      },
    };
  });
  return { as_of: asOf, sections };
}

// ─── Account ledger ────────────────────────────────────────────────────

/** One account's posted lines in a period, with running balance. */
export function accountLedger(
  accountId: number,
  range: { from?: string; to?: string },
) {
  return accountStatement(accountId, range);
}
