import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { buildPoolConfig, config } from "../src/infrastructure/config.js";
import { db } from "../src/infrastructure/database/db.js";
import { pool, reconfigurePool } from "../src/infrastructure/database/pool.js";
import { runDatabaseMigrations } from "../src/infrastructure/database/run-migrations.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { writeEntry } from "../src/modules/accounting/ledger.service.js";
import { exportBackup, restoreBackup } from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* databases.
// The general ledger (Phase 4b): manual entries from draft to posted, the
// database triggers that keep posted history, reversals, account statements,
// idempotent postings, closed months, permissions, audit and restores.

type Line = { account_id: number; debit: string; credit: string; account_code: string; person_id: number | null };
type Entry = {
  id: number;
  code: string;
  status: string;
  total: string;
  currency: string;
  source_type: string;
  reversal_of_id: number | null;
  reversed_by_id: number | null;
  reversed_by_code: string | null;
  posted_at: string | null;
  lines: Line[];
};

/** The SQLSTATE a raw statement fails with. */
async function sqlState(text: string, values: unknown[] = []) {
  try {
    await pool.query(text, values);
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

test("a database at 0008 migrates to the ledger with its data", async () => {
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
    const previous = journal.entries.filter((entry: { tag: string }) => entry.tag < "0009");
    for (const entry of previous) fs.copyFileSync(`drizzle/${entry.tag}.sql`, path.join(before, `${entry.tag}.sql`));
    fs.writeFileSync(path.join(before, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previous }));
    await runDatabaseMigrations(before);
    await pool.query("INSERT INTO accounts(code, name, account_type, currency) VALUES('9001', 'حساب قديم', 'asset', 'IQD')");

    await runDatabaseMigrations(path.resolve("drizzle"));
    assert.equal(Number((await pool.query("SELECT count(*) FROM accounts WHERE code = '9001'")).rows[0].count), 1);
    const triggers = (await pool.query("SELECT tgname FROM pg_trigger WHERE tgname IN ('accounts_ledger_guard', 'journal_entries_guard', 'journal_lines_guard') ORDER BY tgname")).rows.map((row) => row.tgname);
    assert.deepEqual(triggers, ["accounts_ledger_guard", "journal_entries_guard", "journal_lines_guard"]);
    assert.equal(Number((await pool.query("SELECT count(*) FROM permissions WHERE key LIKE 'accounting.%'")).rows[0].count), 6);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the ledger keeps posted history and balances every entry", async (t) => {
  const ctx = await removalTestContext("ledger");
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
    const ok = async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, body?: unknown) => {
      const result = await call(method, url, body);
      assert.ok(result.statusCode < 300, `${method} ${url}: ${result.statusCode} ${result.body}`);
      return result.json();
    };
    const refused = async (method: "POST" | "PUT" | "DELETE", url: string, body: unknown, status: number, message?: RegExp) => {
      const result = await call(method, url, body);
      assert.equal(result.statusCode, status, result.body);
      if (message) assert.match(result.json().message, message);
      return result.json();
    };
    async function userWith(username: string, keys: string[]) {
      const role = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
      await pool.query("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)", [role.id, keys]);
      const user = (await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, $2) RETURNING id", [username, await hashPin("5678")])).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      return (await login(username, "5678"))!.token;
    }
    const keys = new Map(
      (await pool.query("SELECT system_key, id FROM accounts WHERE system_key IS NOT NULL")).rows.map((row) => [row.system_key, Number(row.id)]),
    );
    const id = (key: string) => keys.get(key)!;
    const [client] = ctx.people;
    const deal = Number(
      (await pool.query("INSERT INTO deals(code, deal_type, client_person_id, currency) VALUES('D-0001', 'sale', $1, 'IQD') RETURNING id", [ctx.people[1].id])).rows[0].id,
    );
    const commission = (amount: string, patch: object = {}) => ({
      entry_date: "2026-10-15",
      currency: "IQD",
      description: "عمولة بيع",
      lines: [
        { account_id: id("cash.IQD"), debit: amount, person_id: client.id, deal_id: deal },
        { account_id: id("brokerage_income.IQD"), credit: amount, deal_id: deal },
      ],
      ...patch,
    });

    let posted: Entry;
    await t.test("a draft may be unbalanced; it posts only once it balances", async () => {
      const draft: Entry = await ok("POST", "/api/accounting/journal", {
        ...commission("1500000.50"),
        lines: [
          { account_id: id("cash.IQD"), debit: "1500000.50" },
          { account_id: id("brokerage_income.IQD"), credit: "1500000.00" },
        ],
      });
      assert.equal(draft.status, "draft");
      assert.equal(draft.code, "JE-000001");
      assert.equal(draft.posted_at, null);
      await refused("POST", `/api/accounting/journal/${draft.id}/post`, undefined, 400, /غير متوازن: المدين 1500000.50 والدائن 1500000.00/);
      posted = await ok("PUT", `/api/accounting/journal/${draft.id}`, { ...commission("1500000.50"), post: true });
      assert.equal(posted.status, "posted");
      assert.equal(posted.total, "1500000.50");
      assert.ok(posted.posted_at);
      assert.deepEqual(posted.lines.map((line) => [line.account_code, line.debit, line.credit]), [["1101", "1500000.50", "0.00"], ["4101", "0.00", "1500000.50"]]);
      assert.equal(posted.lines[0].person_id, client.id);
    });

    await t.test("lines stay in posting accounts of the entry's currency", async () => {
      const url = "/api/accounting/journal";
      await refused("POST", url, commission("10.00", { currency: "USD", post: true }), 400, /لا تحويل بين العملات/);
      await refused("POST", url, { ...commission("10.00"), lines: [{ account_id: id("cash"), debit: "10" }, { account_id: id("brokerage_income.IQD"), credit: "10" }] }, 400, /حساب رئيسي/);
      await refused("POST", url, { ...commission("10.00"), lines: [{ account_id: id("cash.IQD"), debit: "10", credit: "10" }, { account_id: id("brokerage_income.IQD"), credit: "10" }] }, 400, /المدين أو في الدائن/);
      await refused("POST", url, { ...commission("10.00"), lines: [{ account_id: id("cash.IQD"), debit: "10.001" }, { account_id: id("brokerage_income.IQD"), credit: "10" }] }, 400);
      const short = await refused("POST", url, { ...commission("10.00"), lines: [{ account_id: id("cash.IQD"), debit: "10" }] }, 400);
      assert.equal(short.issues[0].field, "lines", "fewer than two lines");
    });

    await t.test("a posted entry is changed neither through the API nor in the database", async () => {
      const url = `/api/accounting/journal/${posted.id}`;
      const edit = await refused("PUT", url, commission("1.00"), 409, /مرحَّل/);
      assert.equal(edit.code, "ENTRY_POSTED");
      await refused("DELETE", url, undefined, 409, /مرحَّل/);
      assert.equal(await sqlState("UPDATE journal_entries SET description = 'x' WHERE id = $1", [posted.id]), "DL001");
      assert.equal(await sqlState("DELETE FROM journal_entries WHERE id = $1", [posted.id]), "DL001");
      assert.equal(await sqlState("UPDATE journal_lines SET debit = 1 WHERE entry_id = $1 AND line_no = 1", [posted.id]), "DL001");
      assert.equal(await sqlState("DELETE FROM journal_lines WHERE entry_id = $1", [posted.id]), "DL001");
      assert.equal(await sqlState("INSERT INTO journal_lines(entry_id, line_no, account_id, debit) VALUES($1, 9, $2, 1)", [posted.id, id("cash.IQD")]), "DL001");
      assert.equal(
        await sqlState("INSERT INTO journal_entries(code, entry_date, description, currency, status, posted_at) VALUES('JE-X', '2026-10-01', 'x', 'IQD', 'posted', now())"),
        "DL001",
        "an entry is posted only after its lines",
      );
      const draft = Number((await pool.query("INSERT INTO journal_entries(code, entry_date, description, currency) VALUES('JE-Y', '2026-10-01', 'x', 'IQD') RETURNING id")).rows[0].id);
      await pool.query("INSERT INTO journal_lines(entry_id, line_no, account_id, debit) VALUES($1, 1, $2, 5)", [draft, id("cash.IQD")]);
      await pool.query("INSERT INTO journal_lines(entry_id, line_no, account_id, credit) VALUES($1, 2, $2, 4)", [draft, id("brokerage_income.IQD")]);
      assert.equal(await sqlState("UPDATE journal_entries SET status = 'posted', posted_at = now() WHERE id = $1", [draft]), "DL001", "unbalanced");
      await pool.query("UPDATE journal_lines SET credit = 5 WHERE entry_id = $1 AND line_no = 2", [draft]);
      await pool.query("UPDATE journal_lines SET account_id = $2 WHERE entry_id = $1 AND line_no = 2", [draft, keys.get("cash.USD")]);
      assert.equal(await sqlState("UPDATE journal_entries SET status = 'posted', posted_at = now() WHERE id = $1", [draft]), "DL001", "another currency");
      await pool.query("DELETE FROM journal_entries WHERE id = $1", [draft]);
    });

    await t.test("a customer, deal or account the ledger names keeps its place", async () => {
      const person = await call("DELETE", `/api/people/${client.id}`);
      assert.notEqual(person.statusCode, 200, "a customer with posted lines is not deleted");
      assert.equal(await sqlState("DELETE FROM people WHERE id = $1", [client.id]), "DL001");
      assert.equal(await sqlState("DELETE FROM deals WHERE id = $1", [deal]), "DL001");
      assert.equal(await sqlState("DELETE FROM accounts WHERE id = $1", [id("cash.IQD")]), "23001", "restrict_violation");
      const income = (await ok("GET", "/api/accounting/accounts")).find((row: { system_key: string }) => row.system_key === "brokerage_income.IQD");
      const office = await ok("POST", "/api/accounting/accounts", { code: "4103", name: "عمولات أخرى", account_type: "revenue", parent_id: income.parent_id, currency: "IQD" });
      await ok("POST", "/api/accounting/journal", { ...commission("5.00"), lines: [{ account_id: id("cash.IQD"), debit: "5" }, { account_id: office.id, credit: "5" }], post: true });
      await refused("PUT", `/api/accounting/accounts/${office.id}`, { ...office, currency: "USD" }, 400, /على الحساب قيود/);
      assert.equal(await sqlState("UPDATE accounts SET currency = 'USD' WHERE id = $1", [office.id]), "DL001");
      await ok("PUT", `/api/accounting/accounts/${office.id}`, { ...office, name: "عمولات متفرقة" });
    });

    let reversal: Entry;
    await t.test("a reversing entry undoes a posted one, once", async () => {
      reversal = await ok("POST", `/api/accounting/journal/${posted.id}/reverse`, { entry_date: "2026-10-20", reason: "أُدخل مرتين" });
      assert.equal(reversal.source_type, "reversal");
      assert.equal(reversal.status, "posted");
      assert.equal(reversal.reversal_of_id, posted.id);
      assert.match((await ok("GET", `/api/accounting/journal/${reversal.id}`)).description, /عكس القيد JE-000001: أُدخل مرتين/);
      assert.deepEqual(reversal.lines.map((line) => [line.account_code, line.debit, line.credit]), [["1101", "0.00", "1500000.50"], ["4101", "1500000.50", "0.00"]]);
      const original: Entry = await ok("GET", `/api/accounting/journal/${posted.id}`);
      assert.equal(original.reversed_by_code, reversal.code);
      assert.equal((await refused("POST", `/api/accounting/journal/${posted.id}/reverse`, { reason: "x" }, 409)).code, "ENTRY_REVERSED");
      assert.equal((await refused("POST", `/api/accounting/journal/${reversal.id}/reverse`, { reason: "x" }, 409)).code, "ENTRY_IS_REVERSAL");
      const draft = await ok("POST", "/api/accounting/journal", commission("1.00"));
      assert.equal((await refused("POST", `/api/accounting/journal/${draft.id}/reverse`, { reason: "x" }, 409)).code, "ENTRY_NOT_POSTED");
      await ok("DELETE", `/api/accounting/journal/${draft.id}`);
      const today = await ok("POST", "/api/accounting/journal", { ...commission("2.00"), post: true });
      const undone = await ok("POST", `/api/accounting/journal/${today.id}/reverse`, { reason: "خطأ" });
      assert.match((await ok("GET", `/api/accounting/journal/${undone.id}`)).entry_date, /^\d{4}-\d{2}-\d{2}$/, "dated today by default");
    });

    await t.test("an account statement runs its balance on the account's side", async () => {
      const cash = await ok("GET", `/api/accounting/accounts/${id("cash.IQD")}/statement?from=2026-10-01&to=2026-10-20`);
      assert.equal(cash.account.normal_side, "debit");
      assert.equal(cash.opening_balance, "0.00");
      assert.deepEqual(
        cash.lines.map((line: { debit: string; credit: string; balance: string }) => [line.debit, line.credit, line.balance]),
        [["1500000.50", "0.00", "1500000.50"], ["5.00", "0.00", "1500005.50"], ["2.00", "0.00", "1500007.50"], ["0.00", "1500000.50", "7.00"]],
      );
      assert.equal(cash.closing_balance, "7.00");
      const income = await ok("GET", `/api/accounting/accounts/${id("brokerage_income.IQD")}/statement?from=2026-10-16`);
      assert.equal(income.account.normal_side, "credit");
      assert.equal(income.opening_balance, "1500002.50", "credits before the 16th: the commission and the 2.00 entry");
      assert.ok(income.lines.every((line: { code: string }) => line.code !== "JE-000001"));
      const list = await ok("GET", `/api/accounting/journal/paged?account_id=${id("cash.IQD")}&status=posted&sort_by=code&sort_order=asc`);
      assert.equal(list.items[0].code, "JE-000001");
      assert.equal((await ok("GET", "/api/accounting/journal/paged?q=أُدخل")).total, 1);
    });

    await t.test("an idempotency key posts its entry once", async () => {
      const entry = {
        entryDate: "2026-10-21",
        currency: "IQD" as const,
        description: "سند قبض RC-000001",
        sourceType: "receipt" as const,
        sourceId: 1,
        idempotencyKey: "receipt:1",
        lines: [
          { accountId: id("cash.IQD"), debit: "100.00", credit: "0.00" },
          { accountId: id("receivables.IQD"), debit: "0.00", credit: "100.00" },
        ],
      };
      const first = await db.transaction((tx) => writeEntry(tx, entry, { post: true, userId: ctx.adminId }));
      const again = await db.transaction((tx) => writeEntry(tx, { ...entry, description: "إعادة" }, { post: true, userId: ctx.adminId }));
      assert.equal(again, first);
      assert.equal(Number((await pool.query("SELECT count(*) FROM journal_entries WHERE idempotency_key = 'receipt:1'")).rows[0].count), 1);
    });

    await t.test("a closed month takes no postings until it is reopened", async () => {
      const waiting = await ok("POST", "/api/accounting/journal", { ...commission("3.00"), entry_date: "2026-09-30" });
      const closed = await ok("POST", "/api/accounting/periods", { period: "2026-09", notes: "إقفال أيلول" });
      assert.equal(closed.drafts_left, 1);
      assert.equal((await refused("POST", "/api/accounting/periods", { period: "2026-09" }, 409)).code, "PERIOD_CLOSED");
      await refused("POST", `/api/accounting/journal/${waiting.id}/post`, undefined, 400, /الشهر 2026-09 مقفل/);
      await refused("POST", "/api/accounting/journal", { ...commission("3.00"), entry_date: "2026-09-10", post: true }, 400, /مقفل/);
      await refused("POST", `/api/accounting/journal/${posted.id}/reverse`.replace(String(posted.id), String(reversal.id)), { reason: "x" }, 409);
      assert.equal(await sqlState("UPDATE journal_entries SET status = 'posted', posted_at = now() WHERE id = $1", [waiting.id]), "DL001");
      assert.equal((await ok("GET", "/api/accounting/periods"))[0].period, "2026-09");
      await ok("DELETE", "/api/accounting/periods/2026-09");
      assert.equal((await ok("POST", `/api/accounting/journal/${waiting.id}/post`)).status, "posted");
      assert.equal((await call("DELETE", "/api/accounting/periods/2026-09")).statusCode, 404);
    });

    await t.test("creating, posting, reversing and closing are separate permissions", async () => {
      const clerk = await userWith("ledger_clerk", ["accounting.read", "accounting.journal.create"]);
      const draft = await call("POST", "/api/accounting/journal", commission("4.00"), clerk);
      assert.equal(draft.statusCode, 201);
      assert.equal((await call("POST", "/api/accounting/journal", { ...commission("4.00"), post: true }, clerk)).statusCode, 403);
      assert.equal((await call("POST", `/api/accounting/journal/${draft.json().id}/post`, undefined, clerk)).statusCode, 403);
      assert.equal((await call("POST", `/api/accounting/journal/${posted.id}/reverse`, { reason: "x" }, clerk)).statusCode, 403);
      assert.equal((await call("POST", "/api/accounting/periods", { period: "2026-08" }, clerk)).statusCode, 403);
      const reader = await userWith("ledger_reader2", ["accounting.read"]);
      assert.equal((await call("GET", "/api/accounting/journal/paged", undefined, reader)).statusCode, 200);
      assert.equal((await call("POST", "/api/accounting/journal", commission("4.00"), reader)).statusCode, 403);
      const outsider = await userWith("no_ledger2", ["deals.read"]);
      assert.equal((await call("GET", `/api/accounting/journal/${posted.id}`, undefined, outsider)).statusCode, 403);
    });

    await t.test("postings, deletions and closed months are audited", async () => {
      const rows = (await pool.query("SELECT entity_type, action FROM audit_logs WHERE entity_type IN ('journal_entry', 'accounting_period')")).rows;
      const seen = new Set(rows.map((row) => `${row.entity_type}:${row.action}`));
      for (const key of ["journal_entry:created", "journal_entry:posted", "journal_entry:deleted", "accounting_period:closed", "accounting_period:reopened"])
        assert.ok(seen.has(key), key);
    });

    await t.test("restores bring posted history back whole, and it stays locked", async () => {
      const count = async () => (await pool.query("SELECT count(*)::int AS entries, (SELECT count(*)::int FROM journal_lines) AS lines FROM journal_entries")).rows[0];
      const before = await count();
      const archive = path.join(ctx.root, "ledger.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      await ok("POST", "/api/accounting/journal", { ...commission("6.00"), post: true });

      // A customers restore replaces the people the lines name and keeps the links.
      assert.equal((await restoreBackup(archive, "crm", ctx.adminId)).ok, true);
      const linked = (await pool.query("SELECT person_id, deal_id FROM journal_lines WHERE entry_id = $1 ORDER BY line_no", [posted.id])).rows;
      assert.equal(Number(linked[0].person_id), client.id);
      assert.equal(Number(linked[0].deal_id), deal);

      assert.equal((await restoreBackup(archive, "full", ctx.adminId)).ok, true);
      ctx.token = (await login("removal_admin", "1234"))!.token;
      assert.deepEqual(await count(), before, "the entry posted after the backup is gone");
      const restored: Entry = await ok("GET", `/api/accounting/journal/${posted.id}`);
      assert.equal(restored.reversed_by_code, reversal.code);
      assert.equal(await sqlState("UPDATE journal_entries SET description = 'x' WHERE id = $1", [posted.id]), "DL001", "the restore's pass ended with it");
      const next = await ok("POST", "/api/accounting/journal", commission("1.00"));
      assert.ok(Number(next.code.slice(3)) > before.entries, "codes continue after the restored entries");
    });
  } finally {
    await ctx.close();
  }
});
