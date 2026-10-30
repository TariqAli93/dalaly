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
// Leases (Phase 5a): an issued rent contract put in force with the terms of
// its revision (once), a lease entered by hand, schedules, the listing
// marked rented and freed, lists, cancelling, triggers, permissions and
// restores.

async function sqlState(text: string, values: unknown[] = []) {
  try {
    await pool.query(text, values);
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

test("a database at 0013 migrates to leases", async () => {
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
    const previous = journal.entries.filter((entry: { tag: string }) => entry.tag < "0014");
    for (const entry of previous) fs.copyFileSync(`drizzle/${entry.tag}.sql`, path.join(before, `${entry.tag}.sql`));
    fs.writeFileSync(path.join(before, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previous }));
    await runDatabaseMigrations(before);
    assert.equal((await pool.query("SELECT to_regclass('leases') AS name")).rows[0].name, null);

    await runDatabaseMigrations(path.resolve("drizzle"));
    assert.equal((await pool.query("SELECT to_regclass('lease_installments') AS name")).rows[0].name, "lease_installments");
    const triggers = (await pool.query("SELECT tgname FROM pg_trigger WHERE tgname IN ('leases_guard', 'lease_installments_guard') ORDER BY 1")).rows.map((row) => row.tgname);
    assert.deepEqual(triggers, ["lease_installments_guard", "leases_guard"]);
    const keys = (await pool.query("SELECT key FROM permissions WHERE key LIKE 'leases.%' ORDER BY 1")).rows.map((row) => row.key);
    assert.deepEqual(keys, ["leases.manage", "leases.read"]);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("leases: from an issued rent contract or by hand, with a schedule that never changes", async (t) => {
  const ctx = await removalTestContext("leases");
  try {
    const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, body?: unknown, token = ctx.token) =>
      ctx.app.inject({
        method,
        url,
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
      });
    const ok = async (method: "GET" | "POST" | "PUT", url: string, body?: unknown) => {
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
    const [landlord, tenant] = ctx.people;
    const lodger = Number((await pool.query("INSERT INTO people(code, full_name, phone_primary) VALUES('P-L', 'علي المستأجر', '07700000003') RETURNING id")).rows[0].id);
    const rentalStatus = async () => (await pool.query("SELECT status FROM rentals WHERE id = $1", [ctx.rental.id])).rows[0].status;
    await pool.query("INSERT INTO office_profiles(id, company_name, phone_primary) VALUES(1, 'مكتب الاختبار', '07700000009') ON CONFLICT (id) DO UPDATE SET company_name = EXCLUDED.company_name");

    // A residential rent contract for the fixture rental, issued.
    const contract = await ok("POST", "/api/agreements", { template_key: "residential_rent" });
    const saved = await ok("PUT", `/api/agreements/${contract.id}`, {
      base_rev: contract.draft_rev,
      parties: [
        { role: "landlord", person_id: landlord.id },
        { role: "tenant", person_id: tenant.id },
      ],
      rental_id: ctx.rental.id,
      terms: {
        ...contract.terms, contract_place: "بغداد", rent_amount: 750000, rent_period: "monthly",
        start_date: "2090-01-01", end_date: "2090-12-31", deposit: 750000,
      },
    });
    const issued = await call("POST", `/api/agreements/${contract.id}/issue`, { base_rev: saved.draft_rev });
    assert.equal(issued.statusCode, 200, issued.body);

    let fromContract: { id: number; code: string };
    await t.test("an issued rent contract is put in force with its revision's terms, once", async () => {
      const draft = await ok("GET", `/api/leases/agreement/${contract.id}`);
      assert.equal(draft.problem, null);
      assert.equal(draft.agreement_revision, 1);
      assert.deepEqual(draft.lease, {
        rental_id: ctx.rental.id, landlord_person_id: landlord.id, tenant_person_id: tenant.id, currency: "IQD",
        rent_amount: "750000.00", frequency: "monthly", start_date: "2090-01-01", end_date: "2090-12-31", deposit: "750000.00",
      });
      assert.equal(draft.installments.length, 12);
      assert.equal(draft.total_rent, "9000000.00");

      const lease = await ok("POST", "/api/leases/activate", { agreement_id: contract.id, office_collects: true });
      fromContract = lease;
      assert.equal(lease.code, "LS-000001");
      assert.deepEqual(
        [lease.agreement_code, lease.agreement_revision, lease.rental_id, lease.landlord_name, lease.tenant_name],
        [contract.code, 1, ctx.rental.id, landlord.full_name, tenant.full_name],
      );
      assert.deepEqual(
        [lease.rent_amount, lease.frequency, lease.deposit, lease.office_collects, lease.state, lease.installment_count, lease.total_rent, lease.next_due_date],
        ["750000.00", "monthly", "750000.00", true, "upcoming", 12, "9000000.00", "2090-01-01"],
      );
      assert.deepEqual(lease.installments[0], { id: lease.installments[0].id, seq: 1, due_date: "2090-01-01", period_start: "2090-01-01", period_end: "2090-01-31", amount: "750000.00", state: "upcoming" });
      assert.equal(await rentalStatus(), "rented", "the listing is now rented");
      const audits = (await pool.query("SELECT entity_type, action FROM audit_logs WHERE entity_type IN ('lease', 'rental') ORDER BY id")).rows.map((row) => `${row.entity_type}:${row.action}`);
      assert.deepEqual(audits.slice(-2), ["lease:created", "rental:status_changed"]);

      await refused("/api/leases/activate", { agreement_id: contract.id }, 409, "LEASE_EXISTS", /مفعَّل بالإيجار LS-000001/);
      assert.deepEqual((await ok("GET", `/api/leases/agreement/${contract.id}`)).existing_lease, { id: lease.id, code: "LS-000001" });
      // Not yet issued, or not a rent contract.
      const pending = await ok("POST", "/api/agreements", { template_key: "commercial_rent" });
      assert.match((await ok("GET", `/api/leases/agreement/${pending.id}`)).problem, /أصدر العقد أولاً/);
      await refused("/api/leases/activate", { agreement_id: pending.id }, 409, "LEASE_RULE", /أصدر العقد أولاً/);
      const sale = await ok("POST", "/api/agreements", { template_key: "sale" });
      await refused("/api/leases/activate", { agreement_id: sale.id }, 409, "LEASE_RULE", /ليس عقد إيجار/);
      await refused("/api/leases/activate", { agreement_id: 999999 }, 400, "LEASE_RULE", /غير موجود/);
      assert.equal((await call("GET", "/api/leases/agreement/999999")).statusCode, 404);
    });

    let byHand: { id: number; code: string };
    await t.test("a lease entered by hand, quarterly, and its schedule shown first", async () => {
      const terms = { currency: "IQD", rent_amount: "2100000", frequency: "quarterly", start_date: "2020-01-01", end_date: "2020-12-31" };
      const preview = await ok("POST", "/api/leases/schedule", terms);
      assert.deepEqual(preview.installments.map((row: { due_date: string }) => row.due_date), ["2020-01-01", "2020-04-01", "2020-07-01", "2020-10-01"]);
      assert.equal(preview.total, "8400000.00");
      byHand = await ok("POST", "/api/leases", { ...terms, landlord_person_id: landlord.id, tenant_person_id: lodger, notes: "عقد ورقي قديم" });
      assert.deepEqual(
        [byHand.code, (byHand as unknown as { agreement_id: null }).agreement_id, (byHand as unknown as { state: string }).state],
        ["LS-000002", null, "ended"],
      );
      const shown = await ok("GET", `/api/leases/${byHand.id}`);
      assert.ok(shown.installments.every((row: { state: string }) => row.state === "due"));
      // One cut period: 2020-01-01 to 2020-02-15 monthly pays 15 of February's 29 days.
      const cut = await ok("POST", "/api/leases/schedule", { ...terms, frequency: "monthly", end_date: "2020-02-15", rent_amount: "290000" });
      assert.deepEqual(cut.installments.map((row: { amount: string }) => row.amount), ["290000.00", "150000.00"]);

      const base = { ...terms, landlord_person_id: landlord.id, tenant_person_id: lodger };
      await refused("/api/leases", { ...base, tenant_person_id: landlord.id }, 400, "LEASE_RULE", /الشخص نفسه/);
      await refused("/api/leases", { ...base, end_date: "2019-12-31" }, 400, "LEASE_RULE", /بعد تاريخ بدئه/);
      await refused("/api/leases", { ...base, rental_id: 999999 }, 400, "LEASE_RULE", /عرض الإيجار غير موجود/);
      await refused("/api/leases", { ...base, tenant_person_id: 999999 }, 400, "LEASE_RULE", /غير موجود/);
      await refused("/api/leases", { ...base, frequency: "weekly" }, 400);
      await refused("/api/leases", { ...base, rent_amount: "1.234" }, 400);
    });

    await t.test("lists filter by where a lease stands, by customer and by listing", async () => {
      const page = async (query: string) => (await ok("GET", `/api/leases/paged?page=1&page_size=10&sort_by=start_date&sort_order=asc${query}`)).items.map((row: { code: string }) => row.code);
      assert.deepEqual(await page(""), ["LS-000002", "LS-000001"]);
      assert.deepEqual(await page("&state=upcoming"), ["LS-000001"]);
      assert.deepEqual(await page("&state=ended"), ["LS-000002"]);
      assert.deepEqual(await page("&state=current"), []);
      assert.deepEqual(await page(`&person_id=${lodger}`), ["LS-000002"]);
      assert.deepEqual(await page(`&person_id=${landlord.id}`), ["LS-000002", "LS-000001"]);
      assert.deepEqual(await page(`&rental_id=${ctx.rental.id}`), ["LS-000001"]);
      assert.deepEqual(await page("&q=علي"), ["LS-000002"]);
    });

    await t.test("cancelling frees the listing, and the contract can be put in force again", async () => {
      const cancelled = await ok("POST", `/api/leases/${fromContract.id}/cancel`, { reason: "أُدخل بتاريخ خاطئ" });
      assert.deepEqual([cancelled.status, cancelled.state, cancelled.cancel_reason], ["cancelled", "cancelled", "أُدخل بتاريخ خاطئ"]);
      assert.equal(await rentalStatus(), "available");
      await refused(`/api/leases/${fromContract.id}/cancel`, { reason: "x" }, 409, "LEASE_CANCELLED");
      await refused(`/api/leases/${fromContract.id}/cancel`, { reason: "" }, 400);
      assert.equal((await call("POST", "/api/leases/999999/cancel", { reason: "x" })).statusCode, 404);
      const again = await ok("POST", "/api/leases/activate", { agreement_id: contract.id });
      assert.equal(again.code, "LS-000003");
      assert.equal(await rentalStatus(), "rented");
      fromContract = again;
    });

    await t.test("terms and schedules never change in the database", async () => {
      assert.equal(await sqlState("UPDATE leases SET rent_amount = 1 WHERE id = $1", [fromContract.id]), "DL001");
      assert.equal(await sqlState("UPDATE leases SET notes = 'x' WHERE id = $1", [byHand.id]), "DL001");
      assert.equal(await sqlState("DELETE FROM leases WHERE id = $1", [byHand.id]), "DL001");
      assert.equal(await sqlState("UPDATE lease_installments SET amount = 1"), "DL001");
      assert.equal(await sqlState("DELETE FROM lease_installments"), "DL001");
      assert.equal(await sqlState("UPDATE leases SET cancel_reason = 'y' WHERE status = 'cancelled'"), "DL001");
      assert.equal(
        await sqlState("INSERT INTO leases(code, currency, rent_amount, frequency, start_date, end_date, status, cancel_reason, cancelled_at) VALUES('LS-X', 'IQD', 1, 'monthly', '2026-01-01', '2026-02-01', 'cancelled', 'x', now())"),
        "DL001",
      );
      // Whose lease it is, the listing it rents and the contract it came from stay.
      assert.equal(await sqlState("DELETE FROM people WHERE id = $1", [lodger]), "DL001");
      assert.equal(await sqlState("DELETE FROM rentals WHERE id = $1", [ctx.rental.id]), "DL001");
      assert.equal(await sqlState("INSERT INTO leases(code, landlord_person_id, tenant_person_id, currency, rent_amount, frequency, start_date, end_date) VALUES('LS-Y', $1, $1, 'IQD', 1, 'monthly', '2026-01-01', '2026-02-01')", [lodger]), "23514");
    });

    await t.test("reading leases and putting them in force are separate permissions", async () => {
      const reader = await userWith("lease_reader", ["leases.read"]);
      assert.equal((await call("GET", "/api/leases/paged", undefined, reader)).statusCode, 200);
      assert.equal((await call("GET", `/api/leases/${byHand.id}`, undefined, reader)).statusCode, 200);
      assert.equal((await call("POST", "/api/leases/activate", { agreement_id: contract.id }, reader)).statusCode, 403);
      assert.equal((await call("POST", `/api/leases/${byHand.id}/cancel`, { reason: "x" }, reader)).statusCode, 403);
      const stranger = await userWith("lease_stranger", ["deals.read"]);
      assert.equal((await call("GET", "/api/leases/paged", undefined, stranger)).statusCode, 403);
    });

    await t.test("restores keep leases with their links and schedules", async () => {
      const count = async () => (await pool.query("SELECT (SELECT count(*) FROM leases)::int AS l, (SELECT count(*) FROM lease_installments)::int AS i")).rows[0];
      const links = async () => (await pool.query("SELECT landlord_person_id, tenant_person_id, agreement_id, rental_id FROM leases WHERE id = $1", [fromContract.id])).rows[0];
      const before = { count: await count(), links: await links() };
      const archive = path.join(ctx.root, "leases.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      assert.equal((await restoreBackup(archive, "crm", ctx.adminId)).ok, true);
      assert.deepEqual(await links(), before.links, "a customers restore keeps the customers and the contract");
      assert.equal((await restoreBackup(archive, "rentals", ctx.adminId)).ok, true);
      assert.deepEqual(await links(), before.links, "a rentals restore keeps the listing");
      assert.equal((await restoreBackup(archive, "full", ctx.adminId)).ok, true);
      ctx.token = (await login("removal_admin", "1234"))!.token;
      assert.deepEqual(await count(), before.count);
      assert.equal(await sqlState("UPDATE lease_installments SET amount = 1"), "DL001");
      const next = await ok("POST", "/api/leases", { currency: "USD", rent_amount: "500", frequency: "annual", start_date: "2026-01-01", end_date: "2027-12-31", landlord_person_id: landlord.id, tenant_person_id: lodger });
      assert.equal(next.code, "LS-000004", "codes continue after the restore");
    });
  } finally {
    await ctx.close();
  }
});
