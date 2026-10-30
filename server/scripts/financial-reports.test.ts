import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Financial reports (Phase 6a): a known year of money (capital, commissions
// with an employee's share, collections, client funds in and out, expenses
// and a void, a share paid, a transfer, a dollar receipt), and every report
// checked against those figures and against the journal: the trial balance,
// income and expenses, the balance sheet, cash flow, commissions,
// receivables and payables, per currency, with their permission.

type Section = { currency: string } & Record<string, unknown>;
const sectionOf = (body: { sections: Section[] }, currency: string) => {
  const found = body.sections.find((section) => section.currency === currency);
  assert.ok(found, `no ${currency} section`);
  return found as any;
};

test("financial reports agree with the documents and with the journal", async () => {
  const ctx = await removalTestContext("reports");
  try {
    const call = (method: "GET" | "POST", url: string, body?: unknown, token = ctx.token) =>
      ctx.app.inject({
        method,
        url,
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
      });
    const ok = async (method: "GET" | "POST", url: string, body?: unknown) => {
      const result = await call(method, url, body);
      assert.ok(result.statusCode < 300, `${method} ${url}: ${result.statusCode} ${result.body}`);
      return result.json();
    };
    const keys = new Map(
      (await pool.query("SELECT system_key, id FROM accounts WHERE system_key IS NOT NULL")).rows.map((row) => [row.system_key, Number(row.id)]),
    );
    const id = (key: string) => keys.get(key)!;
    const [seller, buyer] = ctx.people;
    const employee = Number(
      (await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES('agent_a', 'الموظف أ', $1) RETURNING id", [await hashPin("5678")])).rows[0].id,
    );
    const deal = Number(
      (await pool.query(
        "INSERT INTO deals(code, deal_type, stage, client_person_id, owner_person_id, property_id, currency, agreed_price) VALUES('D-0001', 'sale', 'agreed', $1, $2, $3, 'IQD', 100000000) RETURNING id",
        [buyer.id, seller.id, ctx.property.id],
      )).rows[0].id,
    );

    // ─── A year of money ────────────────────────────────────────────────
    await ok("POST", "/api/accounting/journal", {
      entry_date: "2026-01-05",
      currency: "IQD",
      description: "رأس المال",
      post: true,
      lines: [
        { account_id: id("cash.IQD"), debit: "10000000", credit: "0" },
        { account_id: id("capital.IQD"), debit: "0", credit: "10000000" },
      ],
    });
    const c1 = await ok("POST", "/api/commissions", {
      deal_id: deal,
      payer_role: "client",
      basis: "fixed",
      amount: "2000000",
      commission_date: "2026-03-10",
      splits: [{ user_id: employee, basis: "fixed", amount: "500000" }],
    });
    await ok("POST", "/api/commissions", {
      deal_id: deal,
      payer_role: "owner",
      basis: "fixed",
      amount: "1000000",
      commission_date: "2026-09-20",
    });
    const voucher = (patch: object) => ({
      kind: "receipt",
      currency: "IQD",
      money_account_id: id("cash.IQD"),
      description: "سند",
      ...patch,
    });
    await ok("POST", "/api/vouchers", voucher({ voucher_date: "2026-04-01", purpose: "commission", amount: "1500000", commission_id: c1.id }));
    await ok("POST", "/api/vouchers", voucher({ voucher_date: "2026-05-01", purpose: "client_funds", amount: "5000000", person_id: buyer.id, deal_id: deal }));
    await ok("POST", "/api/vouchers", voucher({ kind: "payment", voucher_date: "2026-05-10", purpose: "client_funds", amount: "3000000", person_id: seller.id, deal_id: deal }));
    const category = (await ok("GET", "/api/expense-categories")).find((row: { iqd_account_id: number | null }) => row.iqd_account_id);
    await ok("POST", "/api/vouchers", voucher({ kind: "payment", voucher_date: "2026-06-15", purpose: "expense", amount: "250000", party_name: "المؤجر", expense_category_id: category.id }));
    const mistaken = await ok("POST", "/api/vouchers", voucher({ kind: "payment", voucher_date: "2026-06-20", purpose: "expense", amount: "100000", party_name: "خطأ", expense_category_id: category.id }));
    await ok("POST", `/api/vouchers/${mistaken.id}/void`, { void_date: "2026-06-21", reason: "أُدخل مرتين" });
    const split = (await ok("GET", `/api/commissions/${c1.id}`)).splits[0];
    await ok("POST", "/api/vouchers", voucher({ kind: "payment", voucher_date: "2026-07-01", purpose: "commission", amount: "200000", commission_split_id: split.id }));
    await ok("POST", "/api/cash/transfers", {
      transfer_date: "2026-08-01",
      currency: "IQD",
      from_account_id: id("cash.IQD"),
      to_account_id: id("bank.IQD"),
      amount: "1000000",
      description: "إيداع",
    });
    await ok("POST", "/api/vouchers", voucher({ voucher_date: "2026-02-01", currency: "USD", money_account_id: id("cash.USD"), purpose: "commission", amount: "300", party_name: "زبون أجنبي" }));

    const year = "from=2026-01-01&to=2026-12-31";

    // ─── Trial balance ──────────────────────────────────────────────────
    const tb = await ok("GET", `/api/reports/financial/trial-balance?${year}`);
    for (const section of tb.sections) assert.ok(section.balanced, `${section.currency} trial balance`);
    const iqd = sectionOf(tb, "IQD");
    const closing = (key: string) => {
      const row = iqd.rows.find((item: { account_id: number }) => item.account_id === id(key));
      return row ? (row.closing_debit !== "0.00" ? row.closing_debit : `-${row.closing_credit}`) : "0.00";
    };
    assert.equal(closing("cash.IQD"), "12050000.00");
    assert.equal(closing("bank.IQD"), "1000000.00");
    assert.equal(closing("receivables.IQD"), "1500000.00");
    assert.equal(closing("client_funds.IQD"), "-2000000.00");
    assert.equal(closing("commissions_payable.IQD"), "-300000.00");
    assert.equal(closing("capital.IQD"), "-10000000.00");
    // The trial balance's debits are every posted debit line of the currency.
    const posted = (await pool.query(
      "SELECT sum(l.debit)::numeric(18,2)::text AS d FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE e.status = 'posted' AND e.currency = 'IQD'",
    )).rows[0].d;
    assert.equal(iqd.totals.debit, posted);
    assert.equal(iqd.totals.opening, "0.00");
    // A later period opens with the balances before it.
    const h2 = sectionOf(await ok("GET", "/api/reports/financial/trial-balance?from=2026-07-01&to=2026-12-31"), "IQD");
    const cashH2 = h2.rows.find((row: { account_id: number }) => row.account_id === id("cash.IQD"));
    assert.equal(cashH2.opening, "13250000.00");
    assert.equal(cashH2.closing_debit, "12050000.00");

    // ─── Income and expenses ────────────────────────────────────────────
    const pl = await ok("GET", `/api/reports/financial/income-statement?${year}&group=month`);
    const plIqd = sectionOf(pl, "IQD");
    assert.deepEqual(plIqd.totals, { revenue: "3000000.00", expenses: "750000.00", net: "2250000.00" });
    assert.equal(plIqd.by_month.find((row: { month: string }) => row.month === "2026-03").revenue, "2000000.00");
    assert.equal(plIqd.by_month.find((row: { month: string }) => row.month === "2026-06").expenses, "250000.00", "the void nets out in June");
    assert.equal(pl.months.length, 12);
    assert.deepEqual(
      plIqd.expense_categories.map((row: { category_id: number; amount: string }) => [row.category_id, row.amount]),
      [[category.id, "250000.00"]],
    );
    assert.deepEqual(sectionOf(pl, "USD").totals, { revenue: "300.00", expenses: "0.00", net: "300.00" });
    // The client funds (5,000,000 in) and the listing's price are not income.
    const april = sectionOf(await ok("GET", "/api/reports/financial/income-statement?from=2026-04-01&to=2026-12-31"), "IQD");
    assert.deepEqual(april.totals, { revenue: "1000000.00", expenses: "250000.00", net: "750000.00" });

    // ─── Balance sheet ──────────────────────────────────────────────────
    const bs = await ok("GET", "/api/reports/financial/balance-sheet?as_of=2026-12-31");
    for (const section of bs.sections) assert.ok(section.balanced, `${section.currency} balance sheet`);
    const bsIqd = sectionOf(bs, "IQD");
    assert.deepEqual(bsIqd.totals, {
      assets: "14550000.00",
      liabilities: "2300000.00",
      equity: "10000000.00",
      earnings: "2250000.00",
      liabilities_and_equity: "14550000.00",
    });
    // The earnings on the balance sheet are the income statement's net since the start.
    assert.equal(bsIqd.totals.earnings, plIqd.totals.net);
    const midYear = sectionOf(await ok("GET", "/api/reports/financial/balance-sheet?as_of=2026-03-31"), "IQD");
    assert.ok(midYear.balanced);
    assert.equal(midYear.totals.earnings, "1500000.00");

    // ─── Cash flow ──────────────────────────────────────────────────────
    const cf = await ok("GET", `/api/reports/financial/cash-flow?${year}`);
    for (const section of cf.sections) assert.ok(section.balanced, `${section.currency} cash flow`);
    const cfIqd = sectionOf(cf, "IQD");
    assert.equal(cfIqd.totals.opening, "0.00");
    assert.equal(cfIqd.totals.closing, "13050000.00");
    assert.equal(cfIqd.totals.net, "13050000.00");
    const flow = (category: string) => cfIqd.categories.find((row: { category: string }) => row.category === category);
    assert.equal(flow("capital").money_in, "10000000.00");
    assert.equal(flow("receivables").money_in, "1500000.00");
    assert.deepEqual([flow("client_funds").money_in, flow("client_funds").money_out], ["5000000.00", "3000000.00"]);
    assert.equal(flow("operating_expenses").net, "-250000.00", "the void comes back in");
    assert.equal(flow("commissions_payable").money_out, "200000.00");
    assert.equal(flow("cash"), undefined, "a transfer between cash and bank is not a flow");
    const bank = cfIqd.accounts.find((row: { account_id: number }) => row.account_id === id("bank.IQD"));
    assert.deepEqual([bank.opening, bank.money_in, bank.money_out, bank.closing], ["0.00", "1000000.00", "0.00", "1000000.00"]);
    // The closing cash and bank equal the trial balance's.
    assert.equal(sectionOf(cf, "USD").totals.closing, "300.00");

    // ─── Commissions ────────────────────────────────────────────────────
    const cr = await ok("GET", `/api/reports/financial/commissions?${year}`);
    const crIqd = sectionOf(cr, "IQD");
    assert.deepEqual(
      {
        count: crIqd.totals.count,
        recorded: crIqd.totals.recorded,
        collected: crIqd.totals.collected,
        outstanding: crIqd.totals.outstanding,
        shares: crIqd.totals.shares,
        shares_paid: crIqd.totals.shares_paid,
        shares_owed: crIqd.totals.shares_owed,
        office_net: crIqd.totals.office_net,
      },
      {
        count: 2,
        recorded: "3000000.00",
        collected: "1500000.00",
        outstanding: "1500000.00",
        shares: "500000.00",
        shares_paid: "200000.00",
        shares_owed: "300000.00",
        office_net: "2500000.00",
      },
    );
    assert.deepEqual(crIqd.employees.map((row: { user_id: number; owed: string }) => [row.user_id, row.owed]), [[employee, "300000.00"]]);
    // Recorded commissions are the brokerage income of the year (no other income here).
    const brokerage = plIqd.revenue.find((row: { account_id: number }) => row.account_id === id("brokerage_income.IQD"));
    assert.equal(brokerage.amount, crIqd.totals.recorded);
    const mine = sectionOf(await ok("GET", `/api/reports/financial/commissions?${year}&user_id=${employee}`), "IQD");
    assert.deepEqual(mine.rows.map((row: { id: number }) => row.id), [c1.id]);
    // Collected only up to the period's end.
    const march = sectionOf(await ok("GET", "/api/reports/financial/commissions?from=2026-01-01&to=2026-03-31"), "IQD");
    assert.equal(march.totals.collected, "0.00");

    // ─── Receivables ────────────────────────────────────────────────────
    const ar = sectionOf(await ok("GET", "/api/reports/financial/receivables?as_of=2026-10-31&currency=IQD"), "IQD");
    const owing = (personId: number) => ar.rows.find((row: { person_id: number }) => row.person_id === personId);
    assert.deepEqual([owing(buyer.id).total, owing(buyer.id).over_90], ["500000.00", "500000.00"]);
    assert.deepEqual([owing(seller.id).total, owing(seller.id).days_31_60], ["1000000.00", "1000000.00"]);
    assert.equal(ar.totals.total, "1500000.00");
    const tbOct = sectionOf(await ok("GET", "/api/reports/financial/trial-balance?to=2026-10-31&currency=IQD"), "IQD");
    assert.equal(
      tbOct.rows.find((row: { account_id: number }) => row.account_id === id("receivables.IQD")).closing_debit,
      ar.totals.total,
      "receivables add up to the receivable account",
    );

    // ─── Payables ───────────────────────────────────────────────────────
    const ap = sectionOf(await ok("GET", "/api/reports/financial/payables?as_of=2026-12-31"), "IQD");
    assert.deepEqual(ap.client_funds.map((row: { person_id: number; amount: string }) => [row.person_id, row.amount]), [[seller.id, "2000000.00"]]);
    assert.deepEqual(ap.employees.map((row: { user_id: number; owed: string }) => [row.user_id, row.owed]), [[employee, "300000.00"]]);
    assert.equal(ap.totals.client_funds, "2000000.00");
    assert.equal(ap.totals.employee_shares, ap.totals.employee_shares_ledger);
    const beforeShare = sectionOf(await ok("GET", "/api/reports/financial/payables?as_of=2026-06-30"), "IQD");
    assert.equal(beforeShare.totals.employee_shares, "500000.00");

    // ─── Ledger, filters, validation ────────────────────────────────────
    const ledger = await ok("GET", `/api/reports/financial/ledger/${id("bank.IQD")}?from=2026-01-01&to=2026-12-31`);
    assert.equal(ledger.closing_balance, "1000000.00");
    assert.equal(ledger.lines.length, 1);
    const onlyUsd = await ok("GET", `/api/reports/financial/trial-balance?${year}&currency=USD`);
    assert.deepEqual(onlyUsd.sections.map((section: Section) => section.currency), ["USD"]);
    const backwards = await call("GET", "/api/reports/financial/cash-flow?from=2026-12-31&to=2026-01-01");
    assert.equal(backwards.statusCode, 400);
    assert.equal((await call("GET", "/api/reports/financial/balance-sheet?as_of=2026-13-01")).statusCode, 400);
    // Defaults: the year to date, ending on the office's today.
    const defaults = await ok("GET", "/api/reports/financial/income-statement");
    assert.match(defaults.from, /^\d{4}-01-01$/);
    assert.equal(defaults.to.slice(0, 4), defaults.from.slice(0, 4));

    // ─── Permissions ────────────────────────────────────────────────────
    async function userWith(username: string, permissionKeys: string[]) {
      const role = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
      await pool.query("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)", [role.id, permissionKeys]);
      const user = (await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, $2) RETURNING id", [username, await hashPin("5678")])).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      return (await login(username, "5678"))!.token;
    }
    const accountant = await userWith("reports_reader", ["reports.financial"]);
    const clerk = await userWith("vouchers_reader", ["vouchers.read", "accounting.read"]);
    for (const report of ["trial-balance", "income-statement", "balance-sheet", "cash-flow", "commissions", "receivables", "payables", `ledger/${id("cash.IQD")}`]) {
      const url = `/api/reports/financial/${report}`;
      assert.equal((await call("GET", url, undefined, clerk)).statusCode, 403, `${report} without reports.financial`);
      assert.equal((await call("GET", url, undefined, accountant)).statusCode, 200, `${report} with reports.financial`);
    }
  } finally {
    await ctx.close();
  }
});
