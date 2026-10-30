import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import type { Transaction } from "../../infrastructure/database/record-codes.js";
import {
  agreements,
  deals,
  people,
} from "../../infrastructure/database/schema.js";
import {
  CURRENCIES,
  subtractMoney,
  type Currency,
} from "../../shared/money.js";
import { readTerms } from "../agreements/agreements.repository.js";

/**
 * The money of a deal and of a customer, read from the posted journal so it
 * always agrees with the ledger: office income and costs, what the customer
 * owes the office, and client funds held for landlords and sellers, which
 * are a liability and never income. Commission and client-funds figures
 * from the documents sit beside them.
 */

type Executor = typeof db | Transaction;

async function rows<T extends Record<string, unknown>>(
  executor: Executor,
  query: SQL,
) {
  return (await executor.execute<T>(query)).rows;
}

/**
 * The accounts under the default headings these summaries read, at any
 * depth, each with its heading's key.
 */
const HEADED = sql`WITH RECURSIVE headed AS (
    SELECT id, system_key AS heading FROM accounts
      WHERE system_key IN ('client_funds', 'receivables', 'commissions_payable')
    UNION ALL
    SELECT child.id, headed.heading FROM accounts child
      JOIN headed ON child.parent_id = headed.id
  )`;

const money = (value: unknown) => (value as string | null) ?? "0.00";

/** Every currency that has figures, in the fixed order, plus `always`. */
function currenciesOf(found: Iterable<string>, always?: string) {
  const present = new Set(found);
  if (always) present.add(always);
  return CURRENCIES.filter((currency) => present.has(currency));
}

/**
 * Client funds held on a deal per currency (posted lines naming the deal),
 * only where something is left.
 */
export async function dealFundsHeld(executor: Executor, dealId: number) {
  const found = await rows<{ currency: Currency; held: string }>(
    executor,
    sql`${HEADED}
      SELECT e.currency, sum(l.credit - l.debit)::numeric(18,2)::text AS held
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
      JOIN headed h ON h.id = l.account_id AND h.heading = 'client_funds'
      WHERE l.deal_id = ${dealId}
      GROUP BY e.currency
      HAVING sum(l.credit - l.debit) <> 0
      ORDER BY e.currency`,
  );
  return found;
}

/** The deal's commissions still standing, by code. */
export async function dealLiveCommissions(executor: Executor, dealId: number) {
  const found = await rows<{ code: string }>(
    executor,
    sql`SELECT code FROM commissions
      WHERE deal_id = ${dealId} AND status = 'active' ORDER BY id`,
  );
  return found.map((row) => row.code);
}

export async function dealFinance(dealId: number) {
  const [deal] = await db
    .select({
      id: deals.id,
      code: deals.code,
      currency: deals.currency,
      expectedCommission: deals.expectedCommission,
      agreementId: deals.agreementId,
    })
    .from(deals)
    .where(eq(deals.id, dealId));
  if (!deal) return null;

  const [ledger, commissions, funds, agreement] = await Promise.all([
    rows<Record<string, string>>(
      db,
      sql`${HEADED}
        SELECT e.currency,
          coalesce(sum(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit END), 0)::numeric(18,2)::text AS income,
          coalesce(sum(CASE WHEN a.account_type = 'expense' THEN l.debit - l.credit END), 0)::numeric(18,2)::text AS expenses,
          coalesce(sum(CASE WHEN h.heading = 'receivables' THEN l.debit - l.credit END), 0)::numeric(18,2)::text AS receivable,
          coalesce(sum(CASE WHEN h.heading = 'commissions_payable' THEN l.credit - l.debit END), 0)::numeric(18,2)::text AS payable,
          coalesce(sum(CASE WHEN h.heading = 'client_funds' THEN l.credit - l.debit END), 0)::numeric(18,2)::text AS held
        FROM journal_lines l
        JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
        JOIN accounts a ON a.id = l.account_id
        LEFT JOIN headed h ON h.id = a.id
        WHERE l.deal_id = ${dealId}
        GROUP BY e.currency`,
    ),
    rows<Record<string, string>>(
      db,
      sql`SELECT c.currency,
          sum(c.amount)::numeric(18,2)::text AS recorded,
          coalesce(sum((SELECT sum(v.amount) FROM vouchers v
            WHERE v.commission_id = c.id AND v.status = 'posted')), 0)::numeric(18,2)::text AS collected,
          coalesce(sum((SELECT sum(s.amount) FROM commission_splits s
            WHERE s.commission_id = c.id)), 0)::numeric(18,2)::text AS shares,
          coalesce(sum((SELECT sum(v.amount) FROM vouchers v
            JOIN commission_splits s ON s.id = v.commission_split_id
            WHERE s.commission_id = c.id AND v.status = 'posted')), 0)::numeric(18,2)::text AS shares_paid
        FROM commissions c
        WHERE c.deal_id = ${dealId} AND c.status = 'active'
        GROUP BY c.currency`,
    ),
    rows<Record<string, string>>(
      db,
      sql`SELECT currency,
          coalesce(sum(amount) FILTER (WHERE kind = 'receipt'), 0)::numeric(18,2)::text AS received,
          coalesce(sum(amount) FILTER (WHERE kind = 'payment'), 0)::numeric(18,2)::text AS paid_out
        FROM vouchers
        WHERE deal_id = ${dealId} AND purpose = 'client_funds' AND status = 'posted'
        GROUP BY currency`,
    ),
    deal.agreementId
      ? db
          .select({
            id: agreements.id,
            code: agreements.code,
            status: agreements.status,
            terms: agreements.terms,
          })
          .from(agreements)
          .where(eq(agreements.id, deal.agreementId))
          .then((found) => found[0] ?? null)
      : Promise.resolve(null),
  ]);

  const byCurrency = <T extends { currency: string }>(list: T[]) =>
    new Map(list.map((row) => [row.currency, row]));
  const ledgerOf = byCurrency(
    ledger as Array<Record<string, string> & { currency: string }>,
  );
  const commissionsOf = byCurrency(
    commissions as Array<Record<string, string> & { currency: string }>,
  );
  const fundsOf = byCurrency(
    funds as Array<Record<string, string> & { currency: string }>,
  );

  const currencies = currenciesOf(
    [...ledgerOf.keys(), ...commissionsOf.keys(), ...fundsOf.keys()],
    deal.currency,
  );
  const totals = currencies.map((currency) => {
    const books = ledgerOf.get(currency);
    const commission = commissionsOf.get(currency);
    const held = fundsOf.get(currency);
    const recorded = money(commission?.recorded);
    const collected = money(commission?.collected);
    const shares = money(commission?.shares);
    const sharesPaid = money(commission?.shares_paid);
    const income = money(books?.income);
    const expenses = money(books?.expenses);
    return {
      currency,
      expected_commission:
        currency === deal.currency ? deal.expectedCommission : null,
      commission_recorded: recorded,
      commission_collected: collected,
      commission_outstanding: subtractMoney(recorded, collected),
      shares_owed: shares,
      shares_paid: sharesPaid,
      shares_outstanding: subtractMoney(shares, sharesPaid),
      client_funds_received: money(held?.received),
      client_funds_paid_out: money(held?.paid_out),
      // From the ledger: also what manual entries moved on the deal.
      client_funds_held: money(books?.held),
      receivable: money(books?.receivable),
      commissions_payable: money(books?.payable),
      income,
      expenses,
      net: subtractMoney(income, expenses),
    };
  });

  let contract = null;
  if (agreement) {
    const terms = readTerms(agreement.terms);
    const amount = (value: number | null) =>
      value === null ? null : value.toFixed(2);
    contract = {
      id: agreement.id,
      code: agreement.code,
      status: agreement.status,
      currency: terms.currency,
      commission: amount(terms.commission),
      deposit: amount(terms.deposit),
      down_payment: amount(terms.down_payment),
    };
  }
  return { deal_id: deal.id, deal_code: deal.code, totals, contract };
}

export async function personFinance(personId: number) {
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.id, personId));
  if (!person) return null;

  const [ledger, commissions, list] = await Promise.all([
    rows<Record<string, string>>(
      db,
      sql`${HEADED}
        SELECT e.currency,
          coalesce(sum(CASE WHEN h.heading = 'receivables' THEN l.debit - l.credit END), 0)::numeric(18,2)::text AS owed,
          coalesce(sum(CASE WHEN h.heading = 'client_funds' THEN l.credit - l.debit END), 0)::numeric(18,2)::text AS held
        FROM journal_lines l
        JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
        JOIN headed h ON h.id = l.account_id
        WHERE l.person_id = ${personId}
        GROUP BY e.currency`,
    ),
    rows<Record<string, string>>(
      db,
      sql`SELECT c.currency,
          sum(c.amount)::numeric(18,2)::text AS recorded,
          coalesce(sum((SELECT sum(v.amount) FROM vouchers v
            WHERE v.commission_id = c.id AND v.status = 'posted')), 0)::numeric(18,2)::text AS collected
        FROM commissions c
        WHERE c.payer_person_id = ${personId} AND c.status = 'active'
        GROUP BY c.currency`,
    ),
    rows<{
      id: string;
      code: string;
      deal_id: string;
      deal_code: string;
      currency: Currency;
      amount: string;
      collected: string;
      status: string;
      commission_date: string;
    }>(
      db,
      sql`SELECT c.id, c.code, c.deal_id, d.code AS deal_code, c.currency,
          c.amount::text, c.status, c.commission_date::text,
          coalesce((SELECT sum(v.amount) FROM vouchers v
            WHERE v.commission_id = c.id AND v.status = 'posted'), 0)::numeric(18,2)::text AS collected
        FROM commissions c JOIN deals d ON d.id = c.deal_id
        WHERE c.payer_person_id = ${personId}
        ORDER BY c.commission_date DESC, c.id DESC
        LIMIT 50`,
    ),
  ]);

  const ledgerOf = new Map(
    (ledger as Array<Record<string, string> & { currency: string }>).map(
      (row) => [row.currency, row],
    ),
  );
  const commissionsOf = new Map(
    (commissions as Array<Record<string, string> & { currency: string }>).map(
      (row) => [row.currency, row],
    ),
  );
  const totals = currenciesOf([
    ...ledgerOf.keys(),
    ...commissionsOf.keys(),
  ]).map((currency) => {
    const recorded = money(commissionsOf.get(currency)?.recorded);
    const collected = money(commissionsOf.get(currency)?.collected);
    return {
      currency,
      commission_recorded: recorded,
      commission_collected: collected,
      commission_outstanding: subtractMoney(recorded, collected),
      // From the ledger: also receivables and funds of manual entries.
      owed_to_office: money(ledgerOf.get(currency)?.owed),
      client_funds_held: money(ledgerOf.get(currency)?.held),
    };
  });
  return {
    person_id: person.id,
    totals,
    commissions: list.map((row) => ({
      id: Number(row.id),
      code: row.code,
      deal_id: Number(row.deal_id),
      deal_code: row.deal_code,
      currency: row.currency,
      amount: row.amount,
      collected: row.collected,
      outstanding:
        row.status === "active"
          ? subtractMoney(row.amount, row.collected)
          : "0.00",
      status: row.status,
      commission_date: row.commission_date,
    })),
  };
}
