import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { addDays, addMonths } from "../src/modules/leases/leases.rules.js";
import { officeToday } from "../src/modules/reports/reports.rules.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Operational reports (Phase 6b): deals won, lost and open with conversion,
// cycle, lost reasons and employees; customers contacted, uncontacted,
// repeat and converted; listings by status, age, type, price band and
// location with unmatched requests; leases in force, expiring, due and
// collected, overdue, ended and renewed. Every figure against data written
// for it, with each report's permissions.

test("operational reports count what the records say", async () => {
  const ctx = await removalTestContext("operations");
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
    const q = (text: string, values: unknown[] = []) => pool.query(text, values);
    const one = async (text: string, values: unknown[] = []) => Number((await q(text, values)).rows[0].id);
    const user = (name: string) => one("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, 'x') RETURNING id", [name]);
    const agentA = await user("agent_a");
    const agentB = await user("agent_b");
    const [seller, buyer] = ctx.people;
    const person = (code: string, name: string, created: string) =>
      one("INSERT INTO people(code, full_name, phone_primary, created_at) VALUES($1, $2, '0770', $3) RETURNING id", [code, name, created]);
    const fresh = await person("P-3", "زبون جديد", "2026-02-01T09:00:00+03:00");
    const followed = await person("P-4", "زبون متابَع", "2026-03-01T09:00:00+03:00");
    await q("UPDATE people SET created_at = '2025-06-01T09:00:00+03:00' WHERE id = $1", [seller.id]);
    await q("UPDATE people SET created_at = '2026-01-15T09:00:00+03:00' WHERE id = $1", [buyer.id]);

    // ─── Deals ──────────────────────────────────────────────────────────
    const buyerRequest = await one(
      "INSERT INTO purchase_requests(code, person_id, property_type, status, created_at) VALUES('PR-1', $1, 'بيت', 'closed', '2026-02-15T09:00:00+03:00') RETURNING id",
      [buyer.id],
    );
    const deal = (code: string, type: string, stage: string, client: number, owner: number | null, assigned: number, created: string, closed: string | null, extra: Record<string, unknown> = {}) =>
      one(
        `INSERT INTO deals(code, deal_type, stage, client_person_id, owner_person_id, assigned_user_id, currency, created_at, stage_changed_at, closed_at, lost_reason, expected_commission, purchase_request_id)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, coalesce($9::timestamptz, $8::timestamptz), $9::timestamptz, $10, $11, $12) RETURNING id`,
        [code, type, stage, client, owner, assigned, extra.currency ?? "IQD", created, closed, extra.lost_reason ?? null, extra.expected ?? null, extra.request ?? null],
      );
    const d1 = await deal("D-1", "sale", "won", buyer.id, seller.id, agentA, "2026-03-01T10:00:00+03:00", "2026-03-21T10:00:00+03:00", { request: buyerRequest });
    await deal("D-2", "sale", "won", buyer.id, seller.id, agentA, "2026-04-01T10:00:00+03:00", "2026-05-01T10:00:00+03:00");
    await deal("D-3", "sale", "lost", fresh, null, agentB, "2026-05-10T10:00:00+03:00", "2026-05-20T10:00:00+03:00", { lost_reason: "السعر مرتفع" });
    await deal("D-4", "rent", "lost", followed, null, agentB, "2026-06-01T10:00:00+03:00", "2026-06-05T10:00:00+03:00", { lost_reason: " السعر مرتفع " });
    await deal("D-5", "sale", "cancelled", fresh, null, agentA, "2026-06-10T10:00:00+03:00", "2026-06-11T10:00:00+03:00");
    await deal("D-6", "sale", "negotiating", followed, seller.id, agentB, "2026-07-01T10:00:00+03:00", null, { expected: "1000000" });
    await deal("D-7", "rent", "new", buyer.id, null, agentA, "2025-12-01T10:00:00+03:00", null, { currency: "USD" });
    await ok("POST", "/api/commissions", { deal_id: d1, payer_role: "client", basis: "fixed", amount: "2000000", commission_date: "2026-03-21" });

    const year = "from=2026-01-01&to=2026-12-31";
    const deals = await ok("GET", `/api/reports/operations/deals?${year}`);
    assert.deepEqual(deals.totals, {
      created: 6,
      won: 2,
      lost: 2,
      cancelled: 1,
      open_now: 2,
      win_rate: 50,
      cohort_won: 2,
      cohort_conversion: 33.3,
      cycle_days_average: 25,
      cycle_days_median: 25,
    });
    assert.deepEqual(deals.lost_reasons, [{ reason: "السعر مرتفع", deals: 2, share: 100 }], "reasons are trimmed and grouped");
    const byAgent = (userId: number) => deals.employees.find((row: { user_id: number }) => row.user_id === userId);
    assert.deepEqual(
      [byAgent(agentA).created, byAgent(agentA).won, byAgent(agentA).open_now, byAgent(agentA).win_rate, byAgent(agentA).commission_iqd],
      [3, 2, 1, 100, "2000000.00"],
    );
    assert.deepEqual([byAgent(agentB).created, byAgent(agentB).lost, byAgent(agentB).win_rate], [3, 2, 0]);
    assert.deepEqual(deals.commissions, [{ currency: "IQD", deal_type: "sale", commissions: 1, amount: "2000000.00" }]);
    assert.deepEqual(deals.pipeline.map((row: { currency: string; deals: number; expected_commission: string }) => [row.currency, row.deals, row.expected_commission]), [["IQD", 1, "1000000.00"], ["USD", 1, "0.00"]]);
    assert.equal(deals.closed.length, 5);
    assert.deepEqual((await ok("GET", `/api/reports/operations/deals?${year}&user_id=${agentA}`)).totals.won, 2);
    const rent = await ok("GET", `/api/reports/operations/deals?${year}&deal_type=rent`);
    assert.deepEqual([rent.totals.created, rent.totals.lost, rent.totals.open_now], [1, 1, 1]);

    // ─── Customers ──────────────────────────────────────────────────────
    await q("INSERT INTO purchase_requests(code, person_id, property_type, budget_max, governorate, district, status, created_at) VALUES('PR-2', $1, 'أرض', 160000000, 'بغداد', 'الكرادة', 'open', '2026-02-02T09:00:00+03:00')", [fresh]);
    await q("INSERT INTO rental_requests(code, person_id, property_type, status, created_at) VALUES('RR-1', $1, 'شقة', 'open', '2026-03-02T09:00:00+03:00')", [followed]);
    await q("INSERT INTO activities(user_id, type, notes, person_id, status, created_at) VALUES($1, 'phone_call', 'متابعة', $2, 'done', '2026-12-20T09:00:00+03:00')", [agentA, followed]);
    // A call planned (still open) is not a contact.
    await q("INSERT INTO activities(user_id, type, notes, person_id, status, scheduled_at) VALUES($1, 'phone_call', 'اتصال مقرر', $2, 'open', '2026-12-30T09:00:00+03:00')", [agentA, fresh]);
    await q("INSERT INTO rental_followups(rental_id, user_id, type, notes, person_id, status, created_at) VALUES($1, $2, 'visit', 'معاينة', $3, 'done', '2026-03-05T09:00:00+03:00')", [ctx.rental.id, agentA, buyer.id]);
    const customers = await ok("GET", `/api/reports/operations/customers?${year}`);
    assert.deepEqual(customers.totals, { active: 4, new: 3, contacted: 2, uncontacted: 3, repeat: 2, new_converted: 1, new_conversion: 33.3 });
    assert.deepEqual(
      customers.uncontacted.map((row: { person_id: number; last_contact: string | null }) => [row.person_id, row.last_contact]),
      [[seller.id, null], [fresh, null], [buyer.id, "2026-03-05"]],
      "never contacted first, then the longest ago",
    );
    assert.deepEqual(customers.repeat.map((row: { person_id: number; won_deals: number }) => row.won_deals), [2, 2]);
    assert.deepEqual(
      customers.contacts_by_type.map((row: { type: string; contacts: number }) => [row.type, row.contacts]).sort(),
      [["phone_call", 1], ["visit", 1]],
    );
    assert.deepEqual(
      customers.requests.map((row: { kind: string; open: number; created: number; with_deal: number; won: number; conversion: number | null }) => [row.kind, row.open, row.created, row.with_deal, row.won, row.conversion]),
      [["rental", 1, 1, 0, 0, 0], ["sale", 1, 2, 1, 1, 50]],
    );
    // Contacted by agent A: both contacts are theirs; assigned customers none.
    const mineA = await ok("GET", `/api/reports/operations/customers?${year}&user_id=${agentA}`);
    assert.deepEqual([mineA.totals.contacted, mineA.totals.active], [2, 0]);
    // A contact within the last 7 days of the period.
    assert.equal((await ok("GET", `/api/reports/operations/customers?${year}&days=7`)).totals.uncontacted, 4);

    // ─── Listings ───────────────────────────────────────────────────────
    const property = (code: string, type: string, price: number, status: string) =>
      one(
        "INSERT INTO properties(code, name, property_type, legal_type, area_value, area_unit, pricing_method, total_price, owner_name, owner_phone, governorate, address_details, status) VALUES($1, $1, $2, 'طابو', 200, 'متر', 'total', $3, 'مالك', '0770', 'بغداد', 'الكرادة', $4) RETURNING id",
        [code, type, price, status],
      );
    await q("UPDATE properties SET created_at = now() - interval '100 days', updated_at = now() - interval '60 days' WHERE id = $1", [ctx.property.id]);
    const flat = await property("P-FLAT", "شقة", 80000000, "available");
    await q("UPDATE properties SET created_at = now() - interval '10 days' WHERE id = $1", [flat]);
    const sold = await property("P-SOLD", "بيت", 300000000, "sold");
    await q("INSERT INTO audit_logs(entity_type, entity_id, action, old_value, new_value, created_at) VALUES('property', $1, 'status_changed', '{\"status\":\"available\"}', '{\"status\":\"sold\"}', '2026-05-01T10:00:00+03:00')", [sold]);
    const sale = await ok("GET", `/api/reports/operations/listings?kind=sale&${year}`);
    assert.deepEqual(sale.totals, { available: 2, closed: 1, stale: 1, age_median: 55, open_requests: 1, unmatched_requests: 1 });
    assert.deepEqual(sale.closed.map((row: { id: number; closed_on: string }) => [row.id, row.closed_on]), [[sold, "2026-05-01"]]);
    const age = Object.fromEntries(sale.age.map((row: { bucket: string; listings: number }) => [row.bucket, row.listings]));
    assert.deepEqual([age.days_0_30, age.days_91_180], [1, 1]);
    const typeRow = (type: string) => sale.types.find((row: { property_type: string }) => row.property_type === type);
    assert.deepEqual([typeRow("بيت").available, typeRow("شقة").available, typeRow("أرض").requests], [1, 1, 1]);
    assert.deepEqual(
      sale.price_bands.map((row: { from: number; to: number | null; available: number; requests: number }) => [row.from, row.to, row.available, row.requests]),
      [[0, 100000000, 1, 0], [100000000, 200000000, 1, 1]],
      "the listing at 80m, the one at 150m and the request up to 160m",
    );
    assert.deepEqual(sale.demand, [{ governorate: "بغداد", district: "الكرادة", requests: 1, available: 0 }]);
    assert.deepEqual(sale.unmatched.map((row: { person_id: number }) => row.person_id), [fresh]);

    // ─── Leases ─────────────────────────────────────────────────────────
    const today = officeToday();
    const monthStart = `${today.slice(0, 8)}01`;
    const start = addMonths(monthStart, -5);
    const lease = (patch: object) =>
      ok("POST", "/api/leases", {
        rental_id: null,
        landlord_person_id: seller.id,
        tenant_person_id: buyer.id,
        currency: "IQD",
        rent_amount: "1000000",
        frequency: "monthly",
        start_date: start,
        end_date: addDays(addMonths(start, 12), -1),
        deposit: null,
        office_collects: true,
        notes: null,
        ...patch,
      });
    const l1 = await lease({});
    const cash = Number((await q("SELECT id FROM accounts WHERE system_key = 'cash.IQD'")).rows[0].id);
    const collect = (installmentId: number, amount: string) =>
      ok("POST", "/api/vouchers", { kind: "receipt", voucher_date: today, currency: "IQD", purpose: "client_funds", money_account_id: cash, amount, description: "إيجار", lease_installment_id: installmentId });
    await collect(l1.installments[0].id, "1000000");
    await collect(l1.installments[1].id, "500000");
    const l2 = await lease({ currency: "USD", rent_amount: "3000", frequency: "quarterly", start_date: addDays(today, -300), end_date: addDays(today, 20), office_collects: false, tenant_person_id: followed });
    const oldStart = addMonths(monthStart, -14);
    const l3 = await lease({ start_date: oldStart, end_date: addDays(addMonths(oldStart, 12), -1), office_collects: false, tenant_person_id: fresh });
    await ok("POST", `/api/leases/${l3.id}/renew`, { rent_amount: "1200000", frequency: "monthly", end_date: addDays(addMonths(addMonths(oldStart, 12), 12), -1), notes: null });

    const dueBefore = l1.installments.filter((row: { due_date: string }) => row.due_date < today).length;
    const window = `from=${start}&to=${addDays(addMonths(start, 3), -1)}`;
    const leases = await ok("GET", `/api/reports/operations/leases?${window}&days=60`);
    assert.deepEqual(leases.in_force, [
      { currency: "IQD", current: 2, upcoming: 0, monthly_rent: "2200000.00" },
      { currency: "USD", current: 1, upcoming: 0, monthly_rent: "1000.00" },
    ]);
    assert.deepEqual(leases.expiring.map((row: { id: number; days_left: number }) => [row.id, row.days_left]), [[l2.id, 20]]);
    assert.deepEqual(leases.due, [{ currency: "IQD", installments: 3, amount: "3000000.00", paid: "1500000.00", collection_rate: 50 }]);
    assert.deepEqual(leases.overdue, [
      { currency: "IQD", installments: dueBefore - 1, left: `${(dueBefore - 2) * 1000000 + 500000}.00`, oldest_days: Math.round((Date.parse(today) - Date.parse(l1.installments[1].due_date)) / 86400000) },
    ]);
    const sinceRenewal = await ok("GET", `/api/reports/operations/leases?from=${addDays(addMonths(oldStart, 12), -10)}&to=${today}`);
    assert.deepEqual(sinceRenewal.ended, { ended: 1, renewed: 1, terminated: 0, renewal_rate: 100 });
    assert.deepEqual([sinceRenewal.brokerage.activated, sinceRenewal.brokerage.renewals], [3, 1]);

    // ─── Validation and permissions ─────────────────────────────────────
    assert.equal((await call("GET", "/api/reports/operations/deals?from=2026-12-31&to=2026-01-01")).statusCode, 400);
    assert.equal((await call("GET", "/api/reports/operations/customers?days=0")).statusCode, 400);
    async function userWith(username: string, keys: string[]) {
      const role = (await q("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
      await q("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)", [role.id, keys]);
      const created = (await q("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, $2) RETURNING id", [username, await hashPin("5678")])).rows[0];
      await q("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [created.id, role.id]);
      return (await login(username, "5678"))!.token;
    }
    const salesLead = await userWith("sales_lead", ["reports.operations", "deals.read", "people.read", "properties.read"]);
    const dealsOnly = await userWith("deals_only", ["deals.read", "people.read", "properties.read", "rentals.read", "leases.read", "requests.read"]);
    const status = async (url: string, token: string) => (await call("GET", url, undefined, token)).statusCode;
    assert.equal(await status("/api/reports/operations/deals", salesLead), 200);
    assert.equal(await status("/api/reports/operations/listings?kind=sale", salesLead), 200);
    assert.equal(await status("/api/reports/operations/listings?kind=rental", salesLead), 403, "rental listings need rentals.read");
    assert.equal(await status("/api/reports/operations/leases", salesLead), 403);
    for (const report of ["deals", "customers", "listings", "leases"])
      assert.equal(await status(`/api/reports/operations/${report}`, dealsOnly), 403, `${report} needs reports.operations`);
    // Without requests.read, the request figures are left out.
    const blind = (await call("GET", `/api/reports/operations/customers?${year}`, undefined, salesLead)).json();
    assert.equal(blind.requests, null);
    assert.equal(blind.totals.uncontacted, 2, "only customers with an open deal count without requests");
    const blindListings = (await call("GET", `/api/reports/operations/listings?kind=sale&${year}`, undefined, salesLead)).json();
    assert.deepEqual([blindListings.demand, blindListings.unmatched, blindListings.totals.open_requests], [null, null, null]);
  } finally {
    await ctx.close();
  }
});
