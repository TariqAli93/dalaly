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
import { DEFAULT_ACCOUNTS, ensureDefaultChart } from "../src/modules/accounting/default-chart.js";
import { exportBackup, restoreBackup } from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* databases.
// The chart of accounts (Phase 4a): the default accounts, the chart's rules
// on create and edit, fixed default accounts, permissions, audit, and
// restores (a full one, and one of an archive from before the chart).

type Account = {
  id: number;
  code: string;
  name: string;
  account_type: string;
  parent_id: number | null;
  currency: string | null;
  is_postable: boolean;
  system_key: string | null;
  is_active: boolean;
};

const FIXTURE = path.resolve("scripts/fixtures/backup-v3-adm-zip.zip");

test("a database of the previous release migrates to 0008 with its data and gets the default chart", async () => {
  const name = `dalaly_removal_test_${Date.now()}_upgrade`;
  const admin = new pg.Pool(buildPoolConfig());
  await admin.query(`CREATE DATABASE "${name}"`);
  const root = path.resolve(`data/removal-tests/${name}`);
  try {
    const url = new URL(
      `postgresql://${encodeURIComponent(config.db.user)}:${encodeURIComponent(config.db.password)}@${config.db.host}:${config.db.port}/${name}`,
    );
    await reconfigurePool(url.toString());
    // The migrations of the release before this one: 0000-0007.
    const before = path.join(root, "drizzle");
    fs.mkdirSync(path.join(before, "meta"), { recursive: true });
    const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
    const previous = journal.entries.filter((entry: { tag: string }) => entry.tag < "0008");
    for (const entry of previous)
      fs.copyFileSync(`drizzle/${entry.tag}.sql`, path.join(before, `${entry.tag}.sql`));
    fs.writeFileSync(path.join(before, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previous }));
    await runDatabaseMigrations(before);
    assert.equal((await pool.query("SELECT to_regclass('accounts') AS name")).rows[0].name, null);
    const person = (await pool.query("INSERT INTO people(code, full_name, phone_primary) VALUES('UP-1', 'زبون قديم', '07700000009') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO deals(code, deal_type, client_person_id) VALUES('D-0001', 'sale', $1)", [person]);

    await runDatabaseMigrations(path.resolve("drizzle"));
    assert.equal(Number((await pool.query("SELECT count(*) FROM accounts")).rows[0].count), DEFAULT_ACCOUNTS.length);
    assert.equal(Number((await pool.query("SELECT count(*) FROM deals")).rows[0].count), 1, "existing data is untouched");
    assert.equal(
      Number((await pool.query("SELECT count(*) FROM permissions WHERE key LIKE 'accounting.%'")).rows[0].count),
      2,
    );
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the chart of accounts keeps its rules and its default accounts", async (t) => {
  const ctx = await removalTestContext("accounting");
  try {
    const call = (method: "GET" | "POST" | "PUT", url: string, body?: unknown, token = ctx.token) =>
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
    const refused = async (method: "POST" | "PUT", url: string, body: unknown, status: number, message?: RegExp) => {
      const result = await call(method, url, body);
      assert.equal(result.statusCode, status, result.body);
      if (message) assert.match(result.json().message, message);
      return result.json();
    };
    const chart = async () => (await ok("GET", "/api/accounting/accounts")) as Account[];
    const byKey = async (key: string) => (await chart()).find((account) => account.system_key === key)!;
    const account = (patch: Partial<Account> & { code: string; name: string }) => ({
      account_type: "expense",
      parent_id: null,
      currency: null,
      is_postable: true,
      is_active: true,
      description: null,
      ...patch,
    });
    async function userWith(username: string, keys: string[]) {
      const role = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
      await pool.query("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)", [role.id, keys]);
      const user = (await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, $2) RETURNING id", [username, await hashPin("5678")])).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      return (await login(username, "5678"))!.token;
    }

    await t.test("migrations leave the default chart, each posting account in one currency", async () => {
      const accounts = await chart();
      assert.equal(accounts.length, DEFAULT_ACCOUNTS.length);
      const ids = new Map(accounts.map((row) => [row.id, row]));
      for (const key of ["cash", "bank", "receivables", "client_funds", "payables", "commissions_payable", "capital", "brokerage_income", "other_income", "commission_expense", "operating_expenses"])
        for (const currency of ["IQD", "USD"]) {
          const row = accounts.find((entry) => entry.system_key === `${key}.${currency}`);
          assert.ok(row, `${key}.${currency}`);
          assert.equal(row.currency, currency);
          assert.equal(row.is_postable, true);
          assert.equal(ids.get(row.parent_id!)?.system_key, key, `${key}.${currency} sits under its heading`);
        }
      for (const row of accounts) {
        if (row.parent_id !== null) assert.equal(ids.get(row.parent_id)!.account_type, row.account_type, row.code);
        if (!row.is_postable) assert.equal(row.currency, null, `heading ${row.code} spans both currencies`);
      }
      assert.equal((await byKey("client_funds.IQD")).account_type, "liability", "money held for clients is not income");
      assert.equal((await byKey("brokerage_income.IQD")).account_type, "revenue");
      assert.equal(await ensureDefaultChart(), 0, "a second run adds nothing");
    });

    await t.test("a missing default account comes back under its heading", async () => {
      await pool.query("DELETE FROM accounts WHERE system_key = 'other_income.USD'");
      assert.equal(await ensureDefaultChart(), 1);
      const restored = await byKey("other_income.USD");
      assert.equal(restored.parent_id, (await byKey("other_income")).id);
      assert.equal((await chart()).length, DEFAULT_ACCOUNTS.length);
    });

    let heading: Account;
    let rent: Account;
    await t.test("headings and posting accounts follow the chart's rules", async () => {
      const expenses = await byKey("expenses");
      heading = await ok("POST", "/api/accounting/accounts", account({ code: "53", name: "مصروفات المكتب", parent_id: expenses.id, is_postable: false }));
      rent = await ok("POST", "/api/accounting/accounts", account({ code: "5301", name: "إيجار المكتب — دينار", parent_id: heading.id, currency: "IQD" }));
      assert.equal(rent.parent_id, heading.id);

      const url = "/api/accounting/accounts";
      await refused("POST", url, account({ code: "5302", name: "x", parent_id: heading.id }), 400, /عملة واحدة/);
      await refused("POST", url, account({ code: "5303", name: "x", parent_id: rent.id, currency: "IQD" }), 400, /حساب ترحيل/);
      await refused("POST", url, account({ code: "5304", name: "x", parent_id: heading.id, currency: "IQD", account_type: "asset" }), 400, /من نوع حسابه الأب/);
      const dollars = await ok("POST", url, account({ code: "54", name: "مصروفات بالدولار", parent_id: expenses.id, currency: "USD", is_postable: false }));
      await refused("POST", url, account({ code: "5401", name: "x", parent_id: dollars.id, currency: "IQD" }), 400, /بعملة حسابه الأب/);
      const taken = await refused("POST", url, account({ code: "5301", name: "x", parent_id: heading.id, currency: "IQD" }), 409, /لحساب آخر/);
      assert.equal(taken.code, "ACCOUNT_CODE_TAKEN");
      await refused("POST", url, account({ code: "53a", name: "x", currency: "IQD" }), 400);
      await refused("POST", url, account({ code: "5305", name: "x", parent_id: 999999, currency: "IQD" }), 400, /غير موجود/);

      // A heading cannot go under its own sub-heading.
      const inner = await ok("POST", url, account({ code: "5310", name: "فرعي", parent_id: heading.id, is_postable: false }));
      await refused("PUT", `${url}/${heading.id}`, account({ ...heading, parent_id: inner.id }), 400, /تحت نفسه/);
      await refused("PUT", `${url}/${heading.id}`, account({ ...heading, is_postable: true, currency: "IQD" }), 400, /يبقى حساباً رئيسياً/);
      await refused("PUT", `${url}/${heading.id}`, account({ ...heading, currency: "USD" }), 400, /عملات الحسابات الفرعية/);

      // Stopping: children first; nothing new under a stopped heading.
      await refused("PUT", `${url}/${heading.id}`, account({ ...heading, is_active: false }), 400, /أوقف الحسابات الفرعية/);
      await ok("PUT", `${url}/${rent.id}`, account({ ...rent, is_active: false }));
      await ok("PUT", `${url}/${inner.id}`, account({ ...inner, is_active: false }));
      const stopped = await ok("PUT", `${url}/${heading.id}`, account({ ...heading, is_active: false }));
      assert.equal(stopped.is_active, false);
      await refused("POST", url, account({ code: "5320", name: "x", parent_id: heading.id, currency: "IQD" }), 400, /موقوف/);
      await refused("PUT", `${url}/${rent.id}`, account({ ...rent, is_active: true }), 400, /موقوف/);
      await ok("PUT", `${url}/${heading.id}`, account({ ...heading, is_active: true }));
      await ok("PUT", `${url}/${rent.id}`, account({ ...rent, is_active: true }));
      const renamed = await ok("PUT", `${url}/${rent.id}`, account({ ...rent, code: "5302", name: "إيجار المكتب" }));
      assert.equal(renamed.code, "5302");
      rent = renamed;
      assert.equal((await call("PUT", `${url}/999999`, account({ code: "5999", name: "x", currency: "IQD" }))).statusCode, 404);
    });

    await t.test("default accounts change only their name and description", async () => {
      const cash = await byKey("cash.IQD");
      const url = `/api/accounting/accounts/${cash.id}`;
      const renamed = await ok("PUT", url, account({ ...cash, name: "صندوق المكتب — دينار", description: "النقد في الخزنة" }));
      assert.equal(renamed.name, "صندوق المكتب — دينار");
      assert.equal(renamed.system_key, "cash.IQD");
      for (const change of [{ currency: "USD" }, { code: "1199" }, { is_active: false }, { account_type: "expense" }, { parent_id: null }])
        await refused("PUT", url, account({ ...cash, ...change }), 400, /الدليل الأساسي/);
    });

    await t.test("reading the chart and changing it are separate permissions", async () => {
      const reader = await userWith("ledger_reader", ["accounting.read"]);
      assert.equal((await call("GET", "/api/accounting/accounts", undefined, reader)).statusCode, 200);
      assert.equal((await call("POST", "/api/accounting/accounts", account({ code: "5390", name: "x", currency: "IQD" }), reader)).statusCode, 403);
      assert.equal((await call("PUT", `/api/accounting/accounts/${rent.id}`, account({ ...rent }), reader)).statusCode, 403);
      const outsider = await userWith("no_ledger", ["deals.read"]);
      assert.equal((await call("GET", "/api/accounting/accounts", undefined, outsider)).statusCode, 403);
    });

    await t.test("chart edits are audited", async () => {
      const rows = (await pool.query("SELECT action, entity_id, old_value, new_value FROM audit_logs WHERE entity_type = 'account' ORDER BY id")).rows;
      assert.ok(rows.some((row) => row.action === "created" && Number(row.entity_id) === heading.id));
      const rename = rows.find((row) => row.action === "updated" && Number(row.entity_id) === rent.id && row.new_value.code === "5302");
      assert.ok(rename, "the code change is recorded");
      assert.equal(rename.old_value.code, "5301");
    });

    await t.test("a full restore brings the chart back; an archive from before it gets the default accounts", async () => {
      const archive = path.join(ctx.root, "chart.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      const before = await chart();
      // Children with lower ids than their heading: the restore puts parents first.
      const late = await ok("POST", "/api/accounting/accounts", account({ code: "55", name: "رئيسي لاحق", parent_id: (await byKey("expenses")).id, is_postable: false }));
      await ok("PUT", `/api/accounting/accounts/${rent.id}`, account({ ...rent, parent_id: late.id }));
      const moved = path.join(ctx.root, "moved.zip");
      assert.equal((await exportBackup(moved, ctx.adminId)).ok, true);
      await ok("POST", "/api/accounting/accounts", account({ code: "56", name: "بعد النسخة", parent_id: (await byKey("expenses")).id, is_postable: false }));

      // A full restore ends every session: sign in again after each.
      const signIn = async () => (ctx.token = (await login("removal_admin", "1234"))!.token);
      assert.equal((await restoreBackup(moved, "full", ctx.adminId)).ok, true);
      await signIn();
      const afterMoved = await chart();
      assert.equal(afterMoved.find((row) => row.id === rent.id)!.parent_id, late.id);
      assert.ok(!afterMoved.some((row) => row.code === "56"), "an account added after the backup is gone");

      assert.equal((await restoreBackup(archive, "full", ctx.adminId)).ok, true);
      await signIn();
      assert.deepEqual(
        (await chart()).map((row) => [row.id, row.code, row.name, row.parent_id, row.is_active]),
        before.map((row) => [row.id, row.code, row.name, row.parent_id, row.is_active]),
      );
      const next = await ok("POST", "/api/accounting/accounts", account({ code: "57", name: "بعد الاسترجاع", parent_id: (await byKey("expenses")).id, is_postable: false }));
      assert.ok(next.id > Math.max(...before.map((row) => row.id)), "the id sequence follows the restored rows");

      // The fixture replaces the users too, so the chart is read directly.
      assert.equal((await restoreBackup(FIXTURE, "full")).ok, true);
      const fresh = (await pool.query("SELECT system_key, parent_id FROM accounts")).rows;
      assert.equal(fresh.length, DEFAULT_ACCOUNTS.length, "the default chart, and nothing else");
      assert.ok(fresh.every((row) => row.system_key));
    });
  } finally {
    await ctx.close();
  }
});
