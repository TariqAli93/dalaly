import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { buildPoolConfig, config } from "../src/infrastructure/config.js";
import { pool, reconfigurePool } from "../src/infrastructure/database/pool.js";
import { runDatabaseMigrations } from "../src/infrastructure/database/run-migrations.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { exportBackup, restoreBackup } from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* databases.
// Lease payments (Phase 5b): rent collected against installments (partly,
// never beyond what is left, only where the office collects), overdue
// installments, the deposit, the landlord's payouts limited to what the
// lease holds for them, voiding after a payout, ending a lease early,
// renewing it, triggers, permissions and restores.

async function sqlState(text: string, values: unknown[] = []) {
  try {
    await pool.query(text, values);
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

test("a database at 0014 migrates to lease payments", async () => {
  const name = `dalaly_removal_test_${Date.now()}_upgrade`;
  const admin = new pg.Pool(buildPoolConfig());
  await admin.query(`CREATE DATABASE "${name}"`);
  const root = path.resolve(`data/removal-tests/${name}`);
  try {
    const url = new URL(
      `postgresql://${encodeURIComponent(config.db.user)}:${encodeURIComponent(config.db.password)}@${config.db.host}:${config.db.port}/${name}`,
    );
    await reconfigurePool(url.toString());
    const before = path.join(root, "drizzle");
    fs.mkdirSync(path.join(before, "meta"), { recursive: true });
    const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
    const previous = journal.entries.filter((entry: { tag: string }) => entry.tag < "0015");
    for (const entry of previous) fs.copyFileSync(`drizzle/${entry.tag}.sql`, path.join(before, `${entry.tag}.sql`));
    fs.writeFileSync(path.join(before, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previous }));
    await runDatabaseMigrations(before);
    const column = "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'vouchers' AND column_name = 'lease_installment_id'";
    assert.equal((await pool.query(column)).rows[0].n, 0);

    await runDatabaseMigrations(path.resolve("drizzle"));
    assert.equal((await pool.query(column)).rows[0].n, 1);
    const checks = (await pool.query("SELECT conname FROM pg_constraint WHERE conname IN ('vouchers_lease', 'leases_termination', 'leases_renewal', 'leases_status') ORDER BY 1")).rows.map((row) => row.conname);
    assert.deepEqual(checks, ["leases_renewal", "leases_status", "leases_termination", "vouchers_lease"]);
    assert.match((await pool.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'leases_status'")).rows[0].def, /renewed/);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rent collected against a lease, held for its landlord, paid out, ended early and renewed", async (t) => {
  const ctx = await removalTestContext("leasepay");
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
    const refused = async (url: string, body: unknown, status: number, code?: string, message?: RegExp) => {
      const result = await call("POST", url, body);
      assert.equal(result.statusCode, status, result.body);
      if (code) assert.equal(result.json().code, code);
      if (message) assert.match(result.json().message, message);
    };
    async function userWith(username: string, keys: string[]) {
      const role = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
      await pool.query("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)", [role.id, keys]);
      const user = (await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, $2) RETURNING id", [username, await hashPin("5678")])).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      return (await login(username, "5678"))!.token;
    }
    const cash = Number((await pool.query("SELECT id FROM accounts WHERE system_key = 'cash.IQD'")).rows[0].id);
    const [landlord, tenant] = ctx.people;
    const rentalStatus = async () => (await pool.query("SELECT status FROM rentals WHERE id = $1", [ctx.rental.id])).rows[0].status;
    const lease = (patch: object) =>
      ok("POST", "/api/leases", {
        currency: "IQD", rent_amount: "1000000", frequency: "monthly", start_date: "2020-01-01", end_date: "2020-12-31",
        landlord_person_id: landlord.id, tenant_person_id: tenant.id, office_collects: true, ...patch,
      });
    const voucher = (patch: object) => ({
      kind: "receipt", voucher_date: "2026-10-01", currency: "IQD", purpose: "client_funds", money_account_id: cash,
      description: "إيجار", ...patch,
    });
    const issue = (patch: object) => ok("POST", "/api/vouchers", voucher(patch));
    const show = (id: number) => ok("GET", `/api/leases/${id}`);

    // A: a year of 2020, every installment's day long past. E: the same landlord.
    const a = await lease({ rental_id: ctx.rental.id });
    const e = await lease({ rent_amount: "500000" });
    const direct = await lease({ office_collects: false });
    assert.deepEqual([a.code, e.code, direct.code], ["LS-000001", "LS-000002", "LS-000003"]);
    const seq = (n: number) => a.installments[n - 1].id as number;

    let first: { id: number; journal_entry_id: number };
    await t.test("rent is collected against an installment, partly, for the landlord", async () => {
      first = await issue({ lease_installment_id: seq(1), amount: "1000000" });
      const shown = await ok("GET", `/api/vouchers/${first.id}`);
      assert.deepEqual(
        [shown.lease_code, shown.lease_installment_seq, shown.person_id, shown.held_for_person_id, shown.party_name],
        ["LS-000001", 1, tenant.id, landlord.id, tenant.full_name],
        "paid by the tenant, held for the landlord",
      );
      const line = (await pool.query("SELECT l.person_id, l.memo FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = $1 AND a.system_key = 'client_funds.IQD'", [first.journal_entry_id])).rows[0];
      assert.deepEqual([Number(line.person_id), line.memo], [landlord.id, tenant.full_name]);
      await issue({ lease_installment_id: seq(2), amount: "400000" });
      await refused("/api/vouchers", voucher({ lease_installment_id: seq(2), amount: "600000.01" }), 409, "VOUCHER_ALLOCATION", /القسط 2 من الإيجار LS-000001 \(600000.00\)/);
      await refused("/api/vouchers", voucher({ lease_installment_id: seq(1), amount: "1" }), 409, "VOUCHER_ALLOCATION", /مسدد بالكامل/);
      await refused("/api/vouchers", voucher({ lease_installment_id: seq(3), amount: "1", purpose: "commission" }), 400, "VOUCHER_RULE", /أمانات العملاء/);
      await refused("/api/vouchers", voucher({ lease_installment_id: seq(3), amount: "1", currency: "USD", money_account_id: Number((await pool.query("SELECT id FROM accounts WHERE system_key = 'cash.USD'")).rows[0].id) }), 400, "VOUCHER_RULE", /بعملة غير عملة السند/);
      await refused("/api/vouchers", voucher({ lease_installment_id: seq(3), amount: "1", held_for_person_id: tenant.id }), 400, "VOUCHER_RULE", /لحساب المؤجر/);
      await refused("/api/vouchers", voucher({ lease_installment_id: direct.installments[0].id, amount: "1" }), 400, "VOUCHER_RULE", /المكتب لا يقبض/);
      await refused("/api/vouchers", voucher({ lease_installment_id: seq(3), lease_id: e.id, amount: "1" }), 400, "VOUCHER_RULE", /ليس من أقساط/);
      await refused("/api/vouchers", voucher({ kind: "payment", lease_installment_id: seq(3), amount: "1" }), 400, "VOUCHER_RULE", /بسند قبض/);
      await issue({ lease_installment_id: e.installments[0].id, amount: "500000" });

      const shownLease = await show(a.id);
      assert.deepEqual(
        [shownLease.due_to_date, shownLease.collected, shownLease.outstanding, shownLease.overdue_count, shownLease.held_for_landlord, shownLease.deposit_held],
        ["12000000.00", "1400000.00", "10600000.00", 11, "1400000.00", "0.00"],
      );
      assert.deepEqual(
        shownLease.installments.slice(0, 3).map((row: { state: string; paid: string; left: string }) => [row.state, row.paid, row.left]),
        [["paid", "1000000.00", "0.00"], ["overdue", "400000.00", "600000.00"], ["overdue", "0.00", "1000000.00"]],
      );
      assert.ok((await show(direct.id)).installments.every((row: { state: string }) => row.state === "due"), "no payments tracked where the office does not collect");
    });

    await t.test("overdue installments, oldest first, only where the office collects", async () => {
      const overdue = await ok("GET", `/api/leases/installments/overdue?page=1&page_size=50&lease_id=${a.id}`);
      assert.equal(overdue.total, 11);
      assert.deepEqual(
        [overdue.items[0].seq, overdue.items[0].left, overdue.items[0].tenant_name, overdue.items[0].lease_code],
        [2, "600000.00", tenant.full_name, "LS-000001"],
      );
      assert.ok(overdue.items[0].days_overdue > 2000);
      const all = await ok("GET", "/api/leases/installments/overdue?page=1&page_size=100");
      assert.equal(all.total, 11 + 11, "A and E; not the lease paid directly");
      assert.equal((await ok("GET", `/api/leases/installments/overdue?person_id=${tenant.id}`)).total, 22);
    });

    let payout: { id: number };
    await t.test("the deposit and the landlord's payouts are limited to what the lease holds for each", async () => {
      await issue({ lease_id: a.id, held_for_person_id: tenant.id, person_id: tenant.id, amount: "1000000", description: "تأمين" });
      assert.equal((await show(a.id)).deposit_held, "1000000.00");
      // The landlord holds 1,900,000 across A and E; A holds 1,400,000 of it.
      const out = (patch: object) => voucher({ kind: "payment", lease_id: a.id, person_id: landlord.id, description: "تسليم المؤجر", ...patch });
      await refused("/api/vouchers", out({ amount: "1400000.01" }), 409, "VOUCHER_CLIENT_FUNDS", /على الإيجار LS-000001 هو 1400000.00 فقط/);
      payout = await ok("POST", "/api/vouchers", out({ amount: "1000000" }));
      // The deposit goes back to the tenant out of what is held for them.
      await refused("/api/vouchers", out({ person_id: tenant.id, amount: "1000000.01" }), 409, "VOUCHER_CLIENT_FUNDS");
      await ok("POST", "/api/vouchers", out({ person_id: tenant.id, amount: "1000000", description: "إعادة التأمين" }));
      const shown = await show(a.id);
      assert.deepEqual([shown.held_for_landlord, shown.deposit_held], ["400000.00", "0.00"]);
      const stranger = Number((await pool.query("INSERT INTO people(code, full_name, phone_primary) VALUES('P-X', 'غريب', '07700000099') RETURNING id")).rows[0].id);
      await refused("/api/vouchers", voucher({ lease_id: a.id, person_id: tenant.id, held_for_person_id: stranger, amount: "1" }), 400, "VOUCHER_RULE", /أمانة الإيجار تُحفظ لأحد طرفيها/);
      await refused("/api/vouchers", voucher({ lease_id: a.id, amount: "1", deal_id: 1 }), 400, "VOUCHER_RULE", /لا يُربط بصفقة/);
      assert.equal((await ok("GET", `/api/vouchers/paged?lease_id=${a.id}`)).total, 5);
    });

    await t.test("rent handed over is not un-received: the payout is voided first", async () => {
      await refused(`/api/vouchers/${first.id}/void`, { reason: "خطأ" }, 409, "VOUCHER_CLIENT_FUNDS", /والباقي منها 400000.00/);
      await ok("POST", `/api/vouchers/${payout.id}/void`, { reason: "خطأ" });
      await ok("POST", `/api/vouchers/${first.id}/void`, { reason: "خطأ" });
      const shown = await show(a.id);
      assert.deepEqual([shown.collected, shown.installments[0].state], ["400000.00", "overdue"]);
    });

    await t.test("a lease ends early: later installments are released, arrears stay owed", async () => {
      const ninth = await issue({ lease_installment_id: seq(9), amount: "100" });
      await refused(`/api/leases/${a.id}/terminate`, { termination_date: "2020-06-30", reason: "رحيل المستأجر" }, 409, "LEASE_RULE", /قُبض قسط يُستحق بعد تاريخ الإنهاء/);
      await ok("POST", `/api/vouchers/${ninth.id}/void`, { reason: "قبل الإنهاء" });
      await refused(`/api/leases/${a.id}/terminate`, { termination_date: "2021-01-01", reason: "x" }, 409, "LEASE_RULE", /بين بدء الإيجار/);
      await refused(`/api/leases/${a.id}/terminate`, { termination_date: "2020-06-30", reason: "" }, 400);
      assert.equal(await rentalStatus(), "rented");
      const ended = await ok("POST", `/api/leases/${a.id}/terminate`, { termination_date: "2020-06-30", reason: "رحيل المستأجر" });
      assert.deepEqual(
        [ended.status, ended.state, ended.termination_date, ended.due_to_date, ended.outstanding, ended.overdue_count],
        ["terminated", "terminated", "2020-06-30", "6000000.00", "5600000.00", 6],
      );
      assert.deepEqual(ended.installments.slice(5, 7).map((row: { state: string }) => row.state), ["overdue", "released"]);
      assert.equal(await rentalStatus(), "available", "the listing is free again");
      await refused("/api/vouchers", voucher({ lease_installment_id: seq(8), amount: "1" }), 400, "VOUCHER_RULE", /بعد تاريخ إنهاء الإيجار/);
      await issue({ lease_installment_id: seq(3), amount: "1000000", description: "متأخرات" });
      assert.equal((await show(a.id)).outstanding, "4600000.00");
      await refused(`/api/leases/${a.id}/terminate`, { termination_date: "2020-05-31", reason: "x" }, 409, "LEASE_RULE", /الإيجار الساري فقط/);
      await refused(`/api/leases/${a.id}/cancel`, { reason: "x" }, 409, "LEASE_RULE", /يُلغى الإيجار الساري فقط/);
      await refused(`/api/leases/${e.id}/cancel`, { reason: "x" }, 409, "LEASE_HAS_VOUCHERS");
    });

    await t.test("a lease is renewed from the day after it ends; cancelling the renewal puts it back in force", async () => {
      const c = await lease({ start_date: "2090-01-01", end_date: "2090-12-31", rent_amount: "500000", office_collects: false, rental_id: ctx.rental.id, deposit: "500000" });
      assert.equal(await rentalStatus(), "rented");
      await refused(`/api/leases/${c.id}/renew`, { rent_amount: "550000", frequency: "monthly", end_date: "2090-06-01" }, 400, "LEASE_RULE", /بعد تاريخ بدئه/);
      const d = await ok("POST", `/api/leases/${c.id}/renew`, { rent_amount: "550000", frequency: "quarterly", end_date: "2091-12-31" });
      assert.deepEqual(
        [d.start_date, d.end_date, d.rent_amount, d.frequency, d.renewed_from_code, d.deposit, d.office_collects, d.installment_count, d.landlord_person_id, d.rental_id],
        ["2091-01-01", "2091-12-31", "550000.00", "quarterly", c.code, "500000.00", false, 4, landlord.id, ctx.rental.id],
      );
      const old = await show(c.id);
      assert.deepEqual([old.status, old.state, old.renewed_by_code], ["renewed", "renewed", d.code]);
      assert.deepEqual(d.chain.map((row: { code: string }) => row.code), [c.code, d.code], "the lease's history");
      await refused(`/api/leases/${c.id}/renew`, { rent_amount: "1", frequency: "monthly", end_date: "2091-12-31" }, 409, "LEASE_RULE", /مجدَّد أصلاً/);
      await refused(`/api/leases/${c.id}/terminate`, { termination_date: "2090-06-30", reason: "x" }, 409, "LEASE_RULE");
      await ok("POST", `/api/leases/${d.id}/cancel`, { reason: "أُدخل بتاريخ خاطئ" });
      assert.deepEqual([(await show(c.id)).status, await rentalStatus()], ["active", "rented"]);
      const again = await ok("POST", `/api/leases/${c.id}/renew`, { rent_amount: "600000", frequency: "annual", end_date: "2091-12-31" });
      assert.deepEqual([again.renewed_from_id, again.installment_count], [c.id, 1]);
    });

    await t.test("statuses move only forward in the database", async () => {
      assert.equal(await sqlState("UPDATE leases SET status = 'active' WHERE status = 'terminated'"), "DL001");
      assert.equal(await sqlState("UPDATE leases SET rent_amount = 1 WHERE status = 'renewed'"), "DL001");
      assert.equal(await sqlState("UPDATE leases SET status = 'renewed' WHERE status = 'cancelled'"), "DL001");
      assert.equal(await sqlState("UPDATE vouchers SET lease_installment_id = NULL WHERE lease_installment_id IS NOT NULL"), "DL001");
    });

    await t.test("reading payments and managing leases are separate permissions", async () => {
      const reader = await userWith("lease_pay_reader", ["leases.read"]);
      assert.equal((await call("GET", "/api/leases/installments/overdue", undefined, reader)).statusCode, 200);
      assert.equal((await call("POST", `/api/leases/${e.id}/terminate`, { termination_date: "2020-06-30", reason: "x" }, reader)).statusCode, 403);
      assert.equal((await call("POST", `/api/leases/${e.id}/renew`, { rent_amount: "1", frequency: "monthly", end_date: "2021-12-31" }, reader)).statusCode, 403);
      assert.equal((await call("GET", "/api/leases/installments/overdue", undefined, await userWith("lease_pay_none", ["deals.read"]))).statusCode, 403);
    });

    await t.test("restores keep payments, statuses and renewals", async () => {
      const snapshot = async () => (await pool.query("SELECT (SELECT count(*) FROM vouchers WHERE lease_id IS NOT NULL)::int AS v, (SELECT string_agg(code || ':' || status || ':' || coalesce(renewed_from_id::text, '-'), ',' ORDER BY id) FROM leases) AS l")).rows[0];
      const before = await snapshot();
      const archive = path.join(ctx.root, "lease-payments.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      assert.equal((await restoreBackup(archive, "full", ctx.adminId)).ok, true);
      ctx.token = (await login("removal_admin", "1234"))!.token;
      assert.deepEqual(await snapshot(), before);
      assert.equal((await show(a.id)).outstanding, "4600000.00");
    });
  } finally {
    await ctx.close();
  }
});
