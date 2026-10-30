import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { addDays } from "../src/modules/leases/leases.rules.js";
import { officeToday } from "../src/modules/reports/reports.rules.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// The dashboard's business summary (Phase 7b): tasks due today, this week
// and overdue; deals negotiating, stalled and recently won; customers
// needing contact; leases expiring and installments overdue; the month's
// money. And the notification center's counts of the same, each section
// by its permission. Dates are relative to the office's today.

test("the business summary and the notification center count what needs attention", async () => {
  const ctx = await removalTestContext("business");
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
    const ok = async (method: "GET" | "POST", url: string, body?: unknown, token = ctx.token) => {
      const result = await call(method, url, body, token);
      assert.ok(result.statusCode < 300, `${method} ${url}: ${result.statusCode} ${result.body}`);
      return result.json();
    };
    const q = (text: string, values: unknown[] = []) => pool.query(text, values);
    const one = async (text: string, values: unknown[] = []) => Number((await q(text, values)).rows[0].id);
    const today = officeToday();
    const [seller, buyer] = ctx.people;

    // ─── Tasks: one late, one today (before midnight), one in three days.
    const task = (notes: string, at: string) =>
      q("INSERT INTO activities(user_id, type, notes, person_id, scheduled_at, status) VALUES($1, 'phone_call', $2, $3, $4, 'open')", [ctx.adminId, notes, buyer.id, at]);
    await task("متأخرة", `${addDays(today, -1)}T12:00:00+03:00`);
    await task("اليوم", `${today}T23:59:00+03:00`);
    await task("بعد ثلاثة أيام", `${addDays(today, 3)}T12:00:00+03:00`);

    // ─── Deals: negotiating now, stalled, won lately and long ago.
    const deal = (code: string, stage: string, changed: string, closed: string | null, client = buyer.id) =>
      one(
        `INSERT INTO deals(code, deal_type, stage, client_person_id, owner_person_id, currency, stage_changed_at, closed_at)
         VALUES($1, 'sale', $2, $3, $4, 'IQD', now() - $5::interval, $6::timestamptz) RETURNING id`,
        [code, stage, client, client === seller.id ? null : seller.id, changed, closed],
      );
    const negotiating = await deal("D-1", "negotiating", "2 days", null);
    const stalled = await deal("D-2", "viewing_done", "20 days", null);
    const won = await deal("D-3", "won", "5 days", "now()");
    await q("UPDATE deals SET closed_at = now() - interval '5 days' WHERE id = $1", [won]);
    const oldWin = await deal("D-4", "won", "40 days", null);
    await q("UPDATE deals SET closed_at = now() - interval '40 days' WHERE id = $1", [oldWin]);

    // ─── Money: a commission this month, partly collected; an expense.
    const commission = await ok("POST", "/api/commissions", { deal_id: won, payer_role: "client", basis: "fixed", amount: "2000000", commission_date: today });
    const cash = Number((await q("SELECT id FROM accounts WHERE system_key = 'cash.IQD'")).rows[0].id);
    await ok("POST", "/api/vouchers", { kind: "receipt", voucher_date: today, currency: "IQD", purpose: "commission", money_account_id: cash, amount: "1500000", description: "عمولة", commission_id: commission.id });
    await ok("POST", "/api/vouchers", { kind: "payment", voucher_date: today, currency: "IQD", purpose: "expense", money_account_id: cash, amount: "300000", description: "مولدة", party_name: "صاحب المولدة" });

    // ─── Leases: one ending in ten days; one with installments overdue.
    const lease = (patch: object) =>
      ok("POST", "/api/leases", {
        rental_id: null,
        landlord_person_id: seller.id,
        tenant_person_id: buyer.id,
        currency: "IQD",
        rent_amount: "1000000",
        frequency: "monthly",
        deposit: null,
        office_collects: true,
        notes: null,
        ...patch,
      });
    const ending = await lease({ start_date: addDays(today, -355), end_date: addDays(today, 10), office_collects: false });
    const late = await lease({ start_date: addDays(today, -70), end_date: addDays(today, 295) });
    const lateInstallments = late.installments.filter((row: { due_date: string }) => row.due_date < today).length;

    const summary = await ok("GET", "/api/dashboard/business");
    assert.deepEqual(
      [summary.tasks.overdue.total, summary.tasks.today.total, summary.tasks.week.total],
      [1, 1, 2],
      "this week holds today's and the one in three days",
    );
    assert.equal(summary.tasks.overdue.items[0].notes, "متأخرة");
    assert.deepEqual(summary.deals.negotiating.items.map((row: { id: number }) => row.id), [negotiating]);
    assert.deepEqual(summary.deals.stalled.items.map((row: { id: number }) => row.id), [stalled], "open and unmoved for 14 days");
    assert.deepEqual(summary.deals.recently_won.items.map((row: { id: number }) => row.id), [won], "won within 30 days");
    // Both have open deals and no contact made: the buyer's calls are only planned.
    assert.deepEqual(
      summary.customers.needing_contact.rows.map((row: { person_id: number }) => row.person_id).sort((a: number, b: number) => a - b),
      [seller.id, buyer.id].sort((a, b) => a - b),
    );
    assert.deepEqual(summary.leases.expiring.items.map((row: { id: number; days_left: number }) => [row.id, row.days_left]), [[ending.id, 10]]);
    assert.equal(summary.leases.overdue.total, lateInstallments);
    assert.deepEqual(summary.leases.overdue.by_currency, [{ currency: "IQD", installments: lateInstallments, left: `${lateInstallments * 1000000}.00` }]);
    assert.equal(summary.leases.overdue.items[0].lease_id, late.id);
    const iqd = summary.money.currencies.find((row: { currency: string }) => row.currency === "IQD");
    assert.deepEqual(
      [iqd.commissions_collected, iqd.commissions_outstanding, iqd.commissions_open, iqd.revenue, iqd.expenses, iqd.net],
      ["1500000.00", "500000.00", 1, "2000000.00", "300000.00", "1700000.00"],
    );
    // The month's figures are the income statement's for the same days.
    const statement = await ok("GET", `/api/reports/financial/income-statement?from=${summary.money.from}&to=${summary.money.to}&currency=IQD`);
    assert.deepEqual(statement.sections[0].totals, { revenue: iqd.revenue, expenses: iqd.expenses, net: iqd.net });

    const alerts = await ok("GET", "/api/dashboard/alerts");
    const byKey = Object.fromEntries(alerts.alerts.map((row: { key: string; count: number }) => [row.key, row.count]));
    assert.deepEqual(byKey, {
      tasks_overdue: 1,
      installments_overdue: lateInstallments,
      tasks_today: 1,
      deals_stalled: 1,
      leases_expiring: 1,
      customers_needing_contact: 2,
    });

    // ─── Permissions: each section with its domain only.
    async function userWith(username: string, keys: string[]) {
      const role = (await q("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
      await q("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)", [role.id, keys]);
      const created = (await q("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, $2) RETURNING id", [username, await hashPin("5678")])).rows[0];
      await q("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [created.id, role.id]);
      return (await login(username, "5678"))!.token;
    }
    const dealsOnly = await userWith("deals_only", ["deals.read"]);
    const limited = await ok("GET", "/api/dashboard/business", undefined, dealsOnly);
    assert.deepEqual(
      [limited.tasks, limited.customers, limited.leases, limited.money, limited.deals.stalled.total],
      [null, null, null, null, 1],
    );
    const limitedAlerts = await ok("GET", "/api/dashboard/alerts", undefined, dealsOnly);
    assert.deepEqual(limitedAlerts.alerts.map((row: { key: string }) => row.key), ["deals_stalled"]);
    const nobody = await userWith("nobody", []);
    const empty = await ok("GET", "/api/dashboard/business", undefined, nobody);
    assert.deepEqual([empty.tasks, empty.deals, empty.customers, empty.leases, empty.money], [null, null, null, null, null]);
    assert.equal((await call("GET", "/api/dashboard/alerts", undefined, "not-a-token")).statusCode, 401);
  } finally {
    await ctx.close();
  }
});
