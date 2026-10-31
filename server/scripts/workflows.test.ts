import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { addDays, addMonths } from "../src/modules/leases/leases.rules.js";
import { daysBetween, officeToday } from "../src/modules/reports/reports.rules.js";
import { fromMinor, subtractMoney, toMinor } from "../src/shared/money.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* databases.
// The two core workflows end to end through the API (Phase 9a): a sale from
// the customer and their request to a won deal, an issued contract and the
// commissions collected and shared; a rental from the request to an issued
// lease contract, a lease in force, rent and a deposit held for their owners
// and the landlord paid out. At each step the money and the state: the
// deal's and the customer's money, the lease's, the reports, the cash and
// the journal. The office earns its commission only, never the sale price
// or the rent it holds for someone. Dates are relative to the office's today.

type Ctx = Awaited<ReturnType<typeof removalTestContext>>;
type Method = "GET" | "POST" | "PUT" | "PATCH";

function client(ctx: Ctx) {
  const call = (method: Method, url: string, body?: unknown) =>
    ctx.app.inject({
      method,
      url,
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
      headers: {
        authorization: `Bearer ${ctx.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
    });
  const ok = async (method: Method, url: string, body?: unknown) => {
    const result = await call(method, url, body);
    assert.ok(result.statusCode < 300, `${method} ${url}: ${result.statusCode} ${result.body}`);
    return result.json();
  };
  const refused = async (url: string, body: unknown, status: number, code?: string, message?: RegExp) => {
    const result = await call("POST", url, body);
    assert.equal(result.statusCode, status, result.body);
    if (code) assert.equal(result.json().code, code);
    if (message) assert.match(result.json().message, message);
  };
  const accounts = async () =>
    new Map(((await ok("GET", "/api/accounting/accounts")) as Array<{ system_key: string | null; id: number }>).filter((row) => row.system_key).map((row) => [row.system_key!, row.id]));
  const cashBalance = async (accountId: number) => ((await ok("GET", "/api/cash/balances")) as Array<{ id: number; balance: string }>).find((row) => row.id === accountId)!.balance;
  const heldFor = async (personId: number) => (await ok("GET", `/api/vouchers/client-funds?person_id=${personId}`))[0]?.held ?? "0.00";
  const section = (body: { sections: Array<{ currency: string }> }, currency = "IQD") => {
    const found = body.sections.find((row) => row.currency === currency);
    assert.ok(found, `no ${currency} section`);
    return found as any;
  };
  /** The journal balances: every posted entry on its own, and the trial balance in each currency. */
  const assertJournalBalanced = async (period: string) => {
    const unbalanced = await pool.query(
      "SELECT e.id FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id WHERE e.status = 'posted' GROUP BY e.id HAVING sum(l.debit) <> sum(l.credit)",
    );
    assert.deepEqual(unbalanced.rows, [], "every posted entry balances");
    const tb = await ok("GET", `/api/reports/financial/trial-balance?${period}`);
    assert.ok(tb.sections.length > 0);
    for (const row of tb.sections) {
      assert.equal(row.balanced, true, `${row.currency} trial balance`);
      assert.equal(row.totals.debit, row.totals.credit, `${row.currency} debits equal credits`);
    }
    return tb;
  };
  /** An account's closing balance in a trial balance: a debit, or a credit as a negative. */
  const closingOf = (tb: { sections: Array<{ currency: string }> }, accountId: number | undefined) => {
    const row = section(tb).rows.find((item: { account_id: number }) => item.account_id === accountId);
    if (!row) return "0.00";
    if (row.closing_debit !== "0.00") return row.closing_debit as string;
    return row.closing_credit === "0.00" ? "0.00" : `-${row.closing_credit}`;
  };
  return { call, ok, refused, accounts, cashBalance, heldFor, section, closingOf, assertJournalBalanced };
}

test("sale: a customer's request becomes a won deal, an issued contract and collected commissions", async (t) => {
  const ctx = await removalTestContext("workflowsale");
  try {
    const { call, ok, refused, accounts, cashBalance, section, closingOf, assertJournalBalanced } = client(ctx);
    const today = officeToday();
    const period = `from=${today}&to=${today}`;
    const keys = await accounts();
    const cash = keys.get("cash.IQD")!;
    const seller = ctx.people[0]; // the fixture listing's owner
    const salePrice = "145000000.00";

    let buyer: { id: number; full_name: string };
    let request: { id: number; code: string };
    await t.test("the customer and their purchase request, matched to the listing", async () => {
      buyer = await ok("POST", "/api/people", { full_name: "مشتري المسار", phone_primary: "07701110001", roles: ["buyer"], source: "walk_in" });
      request = await ok("POST", "/api/purchase-requests", { person_id: buyer.id, property_type: "بيت", budget_max: 160000000, governorate: "بغداد" });
      assert.equal((request as unknown as { status: string }).status, "open");
      const matches = await ok("GET", `/api/matching/purchase-requests/${request.id}/offers`);
      assert.ok(matches.matches.some((row: { record: { id: number } }) => row.record.id === ctx.property.id), "the listing matches the request");
    });

    let employee: { id: number };
    let deal: { id: number; code: string };
    await t.test("a deal on the listing for the request takes its owner and price", async () => {
      employee = await ok("POST", "/api/users", { username: "wf_agent", pin: "5678", display_name: "موظف المسار" });
      deal = await ok("POST", "/api/deals", {
        deal_type: "sale",
        property_id: ctx.property.id,
        client_person_id: buyer.id,
        purchase_request_id: request.id,
        assigned_user_id: employee.id,
        expected_commission: "2900000",
      });
      const created = deal as unknown as Record<string, unknown>;
      assert.deepEqual(
        [created.code, created.stage, created.owner_person_id, created.asking_price, created.agreed_price, created.request_code, created.currency],
        ["D-0001", "new", seller.id, "150000000.00", null, request.code, "IQD"],
      );
    });

    await t.test("the deal moves through its stages, and an accepted offer agrees the price", async () => {
      for (const stage of ["contacted", "qualified", "viewing_scheduled", "viewing_done", "negotiating"])
        assert.equal((await ok("POST", `/api/deals/${deal.id}/stage`, { stage })).stage, stage);
      await ok("POST", "/api/activities", { person_id: buyer.id, deal_id: deal.id, type: "phone_call", notes: "تفاوض على السعر" });
      await refused(`/api/deals/${deal.id}/stage`, { stage: "won" }, 409, undefined, /بعد الاتفاق على السعر/);
      const first = await ok("POST", `/api/deals/${deal.id}/offers`, { party: "client", amount: "140000000" });
      const counter = await ok("POST", `/api/deals/${deal.id}/offers`, { party: "owner", amount: "145000000" });
      await ok("PATCH", `/api/deals/${deal.id}/offers/${first.id}`, { status: "countered" });
      const agreed = await ok("PATCH", `/api/deals/${deal.id}/offers/${counter.id}`, { status: "accepted" });
      assert.deepEqual([agreed.stage, agreed.agreed_price, agreed.asking_price], ["agreed", salePrice, "150000000.00"]);
    });

    let agreementId = 0;
    await t.test("the deal's sale contract is prepared with its parties, price and commission, and issued", async () => {
      await refused(`/api/deals/${deal.id}/agreement`, { template_key: "residential_rent" }, 400, undefined, /عقد بيع/);
      const prepared = await ok("POST", `/api/deals/${deal.id}/agreement`, { template_key: "sale" });
      agreementId = prepared.agreement_id;
      assert.equal(prepared.deal.stage, "contract_preparation");
      const draft = await ok("GET", `/api/agreements/${agreementId}`);
      assert.deepEqual([draft.status, draft.template_key, draft.property_id], ["draft", "sale", ctx.property.id]);
      assert.deepEqual(
        draft.parties.map((party: { role: string; person_id: number }) => [party.role, party.person_id]).sort(),
        [["buyer", buyer.id], ["seller", seller.id]],
      );
      assert.deepEqual([draft.terms.sale_price, draft.terms.commission, draft.terms.currency], [145000000, 2900000, "IQD"]);
      await refused(`/api/deals/${deal.id}/stage`, { stage: "contract_issued" }, 409, undefined, /عقد صادر/);

      await ok("PUT", "/api/office", { company_name: "مكتب المسار", phone_primary: "07700000009" });
      // The fixture listing is written directly (its pricing method is not one the
      // listing form offers), so its plot is recorded the same way, as deals.test does.
      await pool.query("UPDATE properties SET plot_number = '12', subdistrict_number = '5', subdistrict_name = 'الكرادة' WHERE id = $1", [ctx.property.id]);
      const saved = await ok("PUT", `/api/agreements/${agreementId}`, {
        base_rev: draft.draft_rev,
        terms: { ...draft.terms, contract_place: "بغداد", delivery_date: addDays(today, 30) },
      });
      // The new customer has no national ID or address yet: the contract waits for them.
      const incomplete = await call("POST", `/api/agreements/${agreementId}/issue`, { base_rev: saved.draft_rev });
      assert.equal(incomplete.statusCode, 422, incomplete.body);
      assert.equal(incomplete.json().code, "AGREEMENT_INCOMPLETE");
      assert.deepEqual(incomplete.json().issues.map((issue: { field: string }) => issue.field).sort(), ["buyer.address", "buyer.national_id"]);
      await ok("PUT", `/api/people/${buyer.id}`, { full_name: buyer.full_name, phone_primary: "07701110001", national_id: "3333333333", address: "بغداد زيونة" });
      const issued = await ok("POST", `/api/agreements/${agreementId}/issue`, { base_rev: saved.draft_rev });
      assert.deepEqual([issued.status, issued.current_revision], ["issued", 1]);
      const after = await ok("GET", `/api/deals/${deal.id}`);
      assert.deepEqual([after.stage, after.agreement_id, after.agreement_status], ["contract_issued", agreementId, "issued"]);
    });

    await t.test("the deal is won, through every stage it passed", async () => {
      const won = await ok("POST", `/api/deals/${deal.id}/stage`, { stage: "won" });
      assert.equal(won.stage, "won");
      assert.ok(won.closed_at);
      assert.deepEqual(
        won.history.map((row: { to_stage: string }) => row.to_stage).reverse(),
        ["new", "contacted", "qualified", "viewing_scheduled", "viewing_done", "negotiating", "agreed", "contract_preparation", "contract_issued", "won"],
      );
      // Nothing was earned yet: the price agreed is not money the office has.
      assert.equal(await cashBalance(cash), "0.00");
      assert.deepEqual((await ok("GET", `/api/reports/financial/income-statement?${period}`)).sections, []);
    });

    let buyerCommission: { id: number; code: string; splits: Array<{ id: number; user_id: number; amount: string }> };
    let sellerCommission: { id: number; code: string };
    await t.test("both parties owe a commission; the employee's share is part of the buyer's", async () => {
      buyerCommission = await ok("POST", "/api/commissions", {
        deal_id: deal.id,
        payer_role: "client",
        basis: "percent",
        rate: "2",
        commission_date: today,
        splits: [{ user_id: employee.id, basis: "percent", rate: "25" }],
      });
      const recorded = buyerCommission as unknown as Record<string, string>;
      assert.deepEqual(
        [recorded.code, recorded.amount, recorded.shares_total, recorded.office_share, recorded.outstanding, recorded.status],
        ["CM-000001", "2900000.00", "725000.00", "2175000.00", "2900000.00", "active"],
        "2% of the agreed 145,000,000",
      );
      assert.deepEqual(buyerCommission.splits.map((split) => [split.user_id, split.amount]), [[employee.id, "725000.00"]]);
      sellerCommission = await ok("POST", "/api/commissions", { deal_id: deal.id, payer_role: "owner", basis: "fixed", amount: "1000000", commission_date: today });
      assert.deepEqual([sellerCommission.code, (sellerCommission as unknown as { amount: string }).amount], ["CM-000002", "1000000.00"]);
      await refused("/api/commissions", { deal_id: deal.id, payer_role: "client", basis: "fixed", amount: "1", commission_date: today }, 409, "COMMISSION_EXISTS");
    });

    const receipt = (patch: object) => ({ kind: "receipt", voucher_date: today, currency: "IQD", purpose: "commission", money_account_id: cash, description: "تحصيل عمولة", ...patch });
    await t.test("receipt vouchers collect the commissions into cash, never beyond what is owed", async () => {
      const fromBuyer = await ok("POST", "/api/vouchers", receipt({ amount: "2900000", commission_id: buyerCommission.id }));
      assert.deepEqual([fromBuyer.kind, fromBuyer.party_name, fromBuyer.commission_code, fromBuyer.amount], ["receipt", buyer.full_name, "CM-000001", "2900000.00"]);
      assert.equal(await cashBalance(cash), "2900000.00");
      await refused("/api/vouchers", receipt({ amount: "1000000.01", commission_id: sellerCommission.id }), 409, "VOUCHER_ALLOCATION", /أكبر من المتبقي/);
      await ok("POST", "/api/vouchers", receipt({ amount: "400000", commission_id: sellerCommission.id }));
      assert.equal(await cashBalance(cash), "3300000.00", "cash moved by exactly what was collected");
      const settled = await ok("GET", `/api/commissions/${buyerCommission.id}`);
      assert.deepEqual([settled.collected, settled.outstanding], ["2900000.00", "0.00"]);
      const partly = await ok("GET", `/api/commissions/${sellerCommission.id}`);
      assert.deepEqual([partly.collected, partly.outstanding], ["400000.00", "600000.00"]);
    });

    await t.test("the employee's share is paid out of cash, never beyond it", async () => {
      const share = buyerCommission.splits[0];
      const payout = (amount: string) => ({ kind: "payment", voucher_date: today, currency: "IQD", purpose: "commission", money_account_id: cash, description: "حصة الموظف", commission_split_id: share.id, amount });
      await refused("/api/vouchers", payout("725000.01"), 409, "VOUCHER_ALLOCATION");
      const paid = await ok("POST", "/api/vouchers", payout("725000"));
      assert.deepEqual([paid.kind, paid.party_name, paid.amount], ["payment", "موظف المسار", "725000.00"]);
      assert.equal(await cashBalance(cash), "2575000.00", "3,300,000 collected less the 725,000 share");
      assert.deepEqual(await ok("GET", `/api/commissions/payable?user_id=${employee.id}`), []);
    });

    await t.test("the deal's and each customer's money agree with what happened", async () => {
      const finance = await ok("GET", `/api/finance/deals/${deal.id}`);
      assert.equal(finance.deal_code, "D-0001");
      assert.deepEqual(finance.totals, [
        {
          currency: "IQD",
          expected_commission: "2900000.00",
          commission_recorded: "3900000.00",
          commission_collected: "3300000.00",
          commission_outstanding: "600000.00",
          shares_owed: "725000.00",
          shares_paid: "725000.00",
          shares_outstanding: "0.00",
          client_funds_received: "0.00",
          client_funds_paid_out: "0.00",
          client_funds_held: "0.00",
          receivable: "600000.00",
          commissions_payable: "0.00",
          income: "3900000.00",
          expenses: "725000.00",
          net: "3175000.00",
        },
      ]);
      assert.deepEqual([finance.contract.status, finance.contract.commission, finance.contract.currency], ["issued", "2900000.00", "IQD"]);
      const buyerMoney = await ok("GET", `/api/finance/people/${buyer.id}`);
      assert.deepEqual(buyerMoney.totals, [
        { currency: "IQD", commission_recorded: "2900000.00", commission_collected: "2900000.00", commission_outstanding: "0.00", owed_to_office: "0.00", client_funds_held: "0.00" },
      ]);
      const sellerMoney = await ok("GET", `/api/finance/people/${seller.id}`);
      assert.deepEqual(sellerMoney.totals, [
        { currency: "IQD", commission_recorded: "1000000.00", commission_collected: "400000.00", commission_outstanding: "600000.00", owed_to_office: "600000.00", client_funds_held: "0.00" },
      ]);
    });

    await t.test("the office's revenue is the commission, never the sale price; the journal balances", async () => {
      const tb = await assertJournalBalanced(period);
      const closing = (key: string) => closingOf(tb, keys.get(key));
      assert.deepEqual(
        ["cash.IQD", "receivables.IQD", "brokerage_income.IQD", "commission_expense.IQD", "commissions_payable.IQD", "client_funds.IQD"].map(closing),
        ["2575000.00", "600000.00", "-3900000.00", "725000.00", "0.00", "0.00"],
      );

      const statement = section(await ok("GET", `/api/reports/financial/income-statement?${period}`));
      assert.deepEqual(statement.totals, { revenue: "3900000.00", expenses: "725000.00", net: "3175000.00" });
      assert.deepEqual(
        statement.revenue.map((row: { account_id: number; amount: string }) => [row.account_id, row.amount]),
        [[keys.get("brokerage_income.IQD"), "3900000.00"]],
        "brokerage income is the only revenue",
      );
      assert.notEqual(statement.totals.revenue, salePrice);
      assert.ok(toMinor(statement.totals.revenue) < toMinor(salePrice), "the sale price is not revenue");
      assert.ok(!statement.revenue.some((row: { amount: string }) => toMinor(row.amount) >= toMinor(salePrice)));

      const commissions = section(await ok("GET", `/api/reports/financial/commissions?${period}`));
      assert.deepEqual(
        [
          commissions.totals.count,
          commissions.totals.recorded,
          commissions.totals.collected,
          commissions.totals.outstanding,
          commissions.totals.shares,
          commissions.totals.shares_paid,
          commissions.totals.shares_owed,
          commissions.totals.office_net,
        ],
        [2, "3900000.00", "3300000.00", "600000.00", "725000.00", "725000.00", "0.00", "3175000.00"],
      );
      assert.equal(commissions.totals.recorded, statement.totals.revenue, "the period's revenue is the commissions recorded");
      assert.equal(commissions.totals.office_net, subtractMoney(commissions.totals.recorded, commissions.totals.shares));

      const flow = section(await ok("GET", `/api/reports/financial/cash-flow?${period}`));
      assert.deepEqual([flow.totals.opening, flow.totals.net, flow.totals.closing], ["0.00", "2575000.00", "2575000.00"]);
      const receivables = section(await ok("GET", `/api/reports/financial/receivables?as_of=${today}&currency=IQD`));
      assert.deepEqual(receivables.rows.map((row: { person_id: number; total: string }) => [row.person_id, row.total]), [[seller.id, "600000.00"]]);
    });

    await t.test("the dashboard shows the won deal and the month's money; nothing needs attention", async () => {
      const summary = await ok("GET", "/api/dashboard/business");
      assert.deepEqual(summary.deals.recently_won.items.map((row: { id: number }) => row.id), [deal.id]);
      assert.equal(summary.deals.stalled.total, 0);
      const iqd = summary.money.currencies.find((row: { currency: string }) => row.currency === "IQD");
      assert.deepEqual(
        [iqd.commissions_collected, iqd.commissions_outstanding, iqd.commissions_open, iqd.revenue, iqd.expenses, iqd.net],
        ["3300000.00", "600000.00", 1, "3900000.00", "725000.00", "3175000.00"],
      );
      const alerts = await ok("GET", "/api/dashboard/alerts");
      assert.deepEqual(alerts.alerts, [], "the deal is closed and its customer was contacted: nothing to chase");
    });
  } finally {
    await ctx.close();
  }
});

test("rental: a request becomes an issued lease contract, a lease in force, rent held and paid out", async (t) => {
  const ctx = await removalTestContext("workflowrent");
  try {
    const { ok, refused, accounts, cashBalance, heldFor, section, closingOf, assertJournalBalanced } = client(ctx);
    const today = officeToday();
    const monthStart = `${today.slice(0, 8)}01`;
    const start = addMonths(monthStart, -3);
    const end = addDays(addMonths(start, 12), -1);
    const period = `from=${start}&to=${today}`;
    const keys = await accounts();
    const cash = keys.get("cash.IQD")!;
    const landlord = ctx.people[0]; // the fixture rental's owner
    const rent = "750000.00";
    const rentalStatus = async () => (await ok("GET", `/api/rentals/${ctx.rental.id}`)).status;

    let tenant: { id: number; full_name: string };
    let deal: { id: number };
    await t.test("the tenant's rental request and a rent deal on the listing", async () => {
      tenant = await ok("POST", "/api/people", {
        full_name: "مستأجر المسار",
        phone_primary: "07701110002",
        national_id: "4444444444",
        address: "بغداد الأعظمية",
        roles: ["tenant"],
        source: "phone",
      });
      const request = await ok("POST", "/api/rental-requests", { person_id: tenant.id, property_type: "house", rent_period: "monthly", budget_max: 800000, governorate: "بغداد" });
      await refused("/api/deals", { deal_type: "rent", rental_id: ctx.rental.id, client_person_id: tenant.id, purchase_request_id: request.id }, 400, undefined, /طلب إيجار/);
      deal = await ok("POST", "/api/deals", { deal_type: "rent", rental_id: ctx.rental.id, client_person_id: tenant.id, rental_request_id: request.id });
      const created = deal as unknown as Record<string, unknown>;
      assert.deepEqual(
        [created.stage, created.owner_person_id, created.asking_price, created.rental_id, created.request_code],
        ["new", landlord.id, rent, ctx.rental.id, request.code],
      );
      for (const stage of ["contacted", "viewing_scheduled", "viewing_done", "negotiating"]) await ok("POST", `/api/deals/${deal.id}/stage`, { stage });
      const offer = await ok("POST", `/api/deals/${deal.id}/offers`, { party: "client", amount: "750000" });
      const agreed = await ok("PATCH", `/api/deals/${deal.id}/offers/${offer.id}`, { status: "accepted" });
      assert.deepEqual([agreed.stage, agreed.agreed_price], ["agreed", rent]);
    });

    let agreementId = 0;
    await t.test("the lease contract is prepared from the deal and issued", async () => {
      await refused(`/api/deals/${deal.id}/agreement`, { template_key: "sale" }, 400, undefined, /عقد إيجار/);
      const prepared = await ok("POST", `/api/deals/${deal.id}/agreement`, { template_key: "residential_rent" });
      agreementId = prepared.agreement_id;
      assert.equal(prepared.deal.stage, "contract_preparation");
      const draft = await ok("GET", `/api/agreements/${agreementId}`);
      assert.deepEqual([draft.status, draft.rental_id, draft.terms.rent_amount, draft.terms.currency], ["draft", ctx.rental.id, 750000, "IQD"]);
      assert.deepEqual(
        draft.parties.map((party: { role: string; person_id: number }) => [party.role, party.person_id]).sort(),
        [["landlord", landlord.id], ["tenant", tenant.id]],
      );
      // Not yet issued: no lease can be put in force from it.
      assert.match((await ok("GET", `/api/leases/agreement/${agreementId}`)).problem, /أصدر العقد أولاً/);
      await ok("PUT", "/api/office", { company_name: "مكتب المسار", phone_primary: "07700000009" });
      const saved = await ok("PUT", `/api/agreements/${agreementId}`, {
        base_rev: draft.draft_rev,
        terms: { ...draft.terms, contract_place: "بغداد", rent_period: "monthly", start_date: start, end_date: end, deposit: 750000 },
      });
      const issued = await ok("POST", `/api/agreements/${agreementId}/issue`, { base_rev: saved.draft_rev });
      assert.equal(issued.status, "issued");
      assert.deepEqual([(await ok("GET", `/api/deals/${deal.id}`)).stage], ["contract_issued"]);
    });

    let lease: { id: number; code: string; installments: Array<{ id: number; seq: number; due_date: string; amount: string }> };
    let dueBefore = 0;
    let dueToDate = 0;
    await t.test("the lease is put in force from the issued contract with its installments", async () => {
      const preview = await ok("GET", `/api/leases/agreement/${agreementId}`);
      assert.equal(preview.problem, null);
      assert.deepEqual(preview.lease, {
        rental_id: ctx.rental.id, landlord_person_id: landlord.id, tenant_person_id: tenant.id, currency: "IQD",
        rent_amount: rent, frequency: "monthly", start_date: start, end_date: end, deposit: "750000.00",
      });
      assert.deepEqual([preview.installments.length, preview.total_rent], [12, "9000000.00"]);

      lease = await ok("POST", "/api/leases/activate", { agreement_id: agreementId, office_collects: true });
      const shown = lease as unknown as Record<string, unknown>;
      assert.deepEqual(
        [shown.code, shown.status, shown.state, shown.agreement_id, shown.installment_count, shown.total_rent, shown.deposit, shown.office_collects],
        ["LS-000001", "active", "current", agreementId, 12, "9000000.00", "750000.00", true],
      );
      assert.deepEqual(lease.installments.map((row) => row.due_date), Array.from({ length: 12 }, (_, i) => addMonths(start, i)));
      assert.ok(lease.installments.every((row) => row.amount === rent));
      await refused("/api/leases/activate", { agreement_id: agreementId }, 409, "LEASE_EXISTS");
      assert.equal(await rentalStatus(), "rented");
      assert.equal((await ok("POST", `/api/deals/${deal.id}/stage`, { stage: "won" })).stage, "won");
      dueBefore = lease.installments.filter((row) => row.due_date < today).length;
      dueToDate = lease.installments.filter((row) => row.due_date <= today).length;
      assert.ok(dueBefore >= 3, "three months of rent are already due");
    });

    let commissionId = 0;
    let revenueBefore: unknown;
    await t.test("the office's commission on the rent deal is its only revenue", async () => {
      const commission = await ok("POST", "/api/commissions", { deal_id: deal.id, payer_role: "client", basis: "fixed", amount: "375000", commission_date: today });
      commissionId = commission.id;
      assert.deepEqual([commission.amount, commission.outstanding], ["375000.00", "375000.00"]);
      revenueBefore = section(await ok("GET", `/api/reports/financial/income-statement?${period}`)).totals;
      assert.deepEqual(revenueBefore, { revenue: "375000.00", expenses: "0.00", net: "375000.00" });
    });

    const receipt = (patch: object) => ({ kind: "receipt", voucher_date: today, currency: "IQD", purpose: "client_funds", money_account_id: cash, description: "إيجار", ...patch });
    await t.test("one installment's rent and the deposit are received and held for their owners", async () => {
      assert.equal(await cashBalance(cash), "0.00");
      const first = lease.installments[0];
      await refused("/api/vouchers", receipt({ lease_installment_id: first.id, amount: "750000.01" }), 409, "VOUCHER_ALLOCATION");
      const paid = await ok("POST", "/api/vouchers", receipt({ lease_installment_id: first.id, amount: "750000" }));
      const voucher = await ok("GET", `/api/vouchers/${paid.id}`);
      assert.deepEqual(
        [voucher.lease_code, voucher.lease_installment_seq, voucher.person_id, voucher.held_for_person_id, voucher.purpose],
        ["LS-000001", 1, tenant.id, landlord.id, "client_funds"],
        "paid by the tenant, held for the landlord",
      );
      await ok("POST", "/api/vouchers", receipt({ lease_id: lease.id, person_id: tenant.id, held_for_person_id: tenant.id, amount: "750000", description: "تأمين" }));
      assert.equal(await cashBalance(cash), "1500000.00");

      const shown = await ok("GET", `/api/leases/${lease.id}`);
      const due = fromMinor(BigInt(dueToDate) * toMinor(rent));
      assert.deepEqual(
        [shown.due_to_date, shown.collected, shown.outstanding, shown.overdue_count, shown.held_for_landlord, shown.deposit_held],
        [due, rent, subtractMoney(due, rent), dueBefore - 1, rent, "750000.00"],
      );
      assert.deepEqual(
        shown.installments.slice(0, 2).map((row: { state: string; paid: string; left: string }) => [row.state, row.paid, row.left]),
        [["paid", rent, "0.00"], ["overdue", "0.00", rent]],
      );
      const overdue = await ok("GET", `/api/leases/installments/overdue?page=1&page_size=50&lease_id=${lease.id}`);
      assert.equal(overdue.total, dueBefore - 1);
      assert.deepEqual(
        [overdue.items[0].seq, overdue.items[0].left, overdue.items[0].tenant_name, overdue.items[0].days_overdue],
        [2, rent, tenant.full_name, daysBetween(lease.installments[1].due_date, today)],
      );
      assert.equal(await heldFor(landlord.id), rent);
      assert.equal(await heldFor(tenant.id), "750000.00", "the deposit is the tenant's");
      assert.deepEqual(section(await ok("GET", `/api/reports/financial/income-statement?${period}`)).totals, revenueBefore, "rent held for the landlord is not revenue");
    });

    await t.test("the landlord is paid out what is held for them, never more", async () => {
      const payout = (amount: string) => receipt({ kind: "payment", lease_id: lease.id, person_id: landlord.id, amount, description: "تسليم المؤجر" });
      await refused("/api/vouchers", payout("750000.01"), 409, "VOUCHER_CLIENT_FUNDS", /750000.00 فقط/);
      const paid = await ok("POST", "/api/vouchers", payout("750000"));
      assert.deepEqual([paid.kind, paid.held_for_person_id], ["payment", landlord.id]);
      assert.equal(await cashBalance(cash), "750000.00", "the deposit is all the cash left");
      const shown = await ok("GET", `/api/leases/${lease.id}`);
      assert.deepEqual([shown.collected, shown.held_for_landlord, shown.deposit_held], [rent, "0.00", "750000.00"]);
      assert.equal(await heldFor(landlord.id), "0.00");
      await refused("/api/vouchers", payout("0.01"), 409, "VOUCHER_CLIENT_FUNDS");
    });

    await t.test("the reports: rent is not income, client funds are owed, the journal balances", async () => {
      assert.deepEqual(section(await ok("GET", `/api/reports/financial/income-statement?${period}`)).totals, revenueBefore);
      const tb = await assertJournalBalanced(period);
      const closing = (key: string) => closingOf(tb, keys.get(key));
      assert.deepEqual(
        ["cash.IQD", "client_funds.IQD", "receivables.IQD", "brokerage_income.IQD"].map(closing),
        ["750000.00", "-750000.00", "375000.00", "-375000.00"],
        "1,500,000 of client funds in, 750,000 paid out; only the commission is income",
      );
      const payables = section(await ok("GET", `/api/reports/financial/payables?as_of=${today}`));
      assert.deepEqual(payables.client_funds.map((row: { person_id: number; amount: string }) => [row.person_id, row.amount]), [[tenant.id, "750000.00"]]);
      assert.equal(payables.totals.client_funds, "750000.00");
      const receivables = section(await ok("GET", `/api/reports/financial/receivables?as_of=${today}&currency=IQD`));
      assert.deepEqual(receivables.rows.map((row: { person_id: number; total: string }) => [row.person_id, row.total]), [[tenant.id, "375000.00"]]);
      assert.equal(receivables.totals.total, "375000.00");

      const report = await ok("GET", `/api/reports/operations/leases?${period}&days=365`);
      assert.deepEqual(report.in_force, [{ currency: "IQD", current: 1, upcoming: 0, monthly_rent: rent }]);
      assert.deepEqual(report.expiring.map((row: { id: number; days_left: number }) => [row.id, row.days_left]), [[lease.id, daysBetween(today, end)]]);
      const dueAmount = fromMinor(BigInt(dueToDate) * toMinor(rent));
      assert.deepEqual(
        report.due.map((row: { currency: string; installments: number; amount: string; paid: string }) => [row.currency, row.installments, row.amount, row.paid]),
        [["IQD", dueToDate, dueAmount, rent]],
      );
      assert.deepEqual(report.overdue, [
        { currency: "IQD", installments: dueBefore - 1, left: fromMinor(BigInt(dueBefore - 1) * toMinor(rent)), oldest_days: daysBetween(lease.installments[1].due_date, today) },
      ]);
      assert.deepEqual(
        [report.brokerage.activated, report.brokerage.renewals, report.brokerage.rent_deals_won, report.brokerage.commissions],
        [1, 0, 1, [{ currency: "IQD", commissions: 1, amount: "375000.00" }]],
      );

      const summary = await ok("GET", "/api/dashboard/business");
      assert.equal(summary.leases.overdue.total, dueBefore - 1);
      const alerts = await ok("GET", "/api/dashboard/alerts");
      assert.equal(alerts.alerts.find((row: { key: string }) => row.key === "installments_overdue")?.count, dueBefore - 1);
      // The commission is still owed; the deal's own money shows it and no rent.
      const finance = (await ok("GET", `/api/finance/deals/${deal.id}`)).totals[0];
      assert.deepEqual(
        [finance.commission_recorded, finance.commission_outstanding, finance.receivable, finance.income, finance.client_funds_held],
        ["375000.00", "375000.00", "375000.00", "375000.00", "0.00"],
      );
      const commission = await ok("GET", `/api/commissions/${commissionId}`);
      assert.deepEqual([commission.collected, commission.outstanding], ["0.00", "375000.00"]);
    });
  } finally {
    await ctx.close();
  }
});
