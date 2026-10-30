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
// Expenses and cash (Phase 4e): expense categories and the account they
// pick for an expense payment, transfers between cash and bank (limited to
// what is there, also when racing; voided only while the money is still
// where it went), reconciliations with and without an adjusting entry,
// triggers, permissions and restores.

const FIXTURE = path.resolve("scripts/fixtures/backup-v3-adm-zip.zip");

async function sqlState(text: string, values: unknown[] = []) {
  try {
    await pool.query(text, values);
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

test("a database at 0011 migrates to expenses and cash and gets the default categories", async () => {
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
    const previous = journal.entries.filter((entry: { tag: string }) => entry.tag < "0012");
    for (const entry of previous) fs.copyFileSync(`drizzle/${entry.tag}.sql`, path.join(before, `${entry.tag}.sql`));
    fs.writeFileSync(path.join(before, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previous }));
    await runDatabaseMigrations(before);
    assert.equal((await pool.query("SELECT to_regclass('expense_categories') AS name")).rows[0].name, null);

    await runDatabaseMigrations(path.resolve("drizzle"));
    const categories = (await pool.query("SELECT c.name, a.system_key FROM expense_categories c JOIN accounts a ON a.id = c.iqd_account_id")).rows;
    assert.equal(categories.length, 9);
    assert.ok(categories.every((row) => row.system_key === "operating_expenses.IQD"));
    const triggers = (await pool.query("SELECT tgname FROM pg_trigger WHERE tgname IN ('cash_transfers_guard', 'cash_reconciliations_guard') ORDER BY 1")).rows.map((row) => row.tgname);
    assert.deepEqual(triggers, ["cash_reconciliations_guard", "cash_transfers_guard"]);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("expenses, transfers and reconciliations keep cash and bank exact", async (t) => {
  const ctx = await removalTestContext("cash");
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
    const refused = async (method: "POST" | "PUT", url: string, body: unknown, status: number, code?: string, message?: RegExp) => {
      const result = await call(method, url, body);
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
    const keys = new Map(
      (await pool.query("SELECT system_key, id FROM accounts WHERE system_key IS NOT NULL")).rows.map((row) => [row.system_key, Number(row.id)]),
    );
    const key = (name: string) => keys.get(name)!;
    const balance = async (accountId: number) =>
      (await ok("GET", "/api/cash/balances")).find((row: { id: number }) => row.id === accountId)?.balance;
    const voucher = (patch: object) => ({
      kind: "payment",
      voucher_date: "2026-10-10",
      currency: "IQD",
      purpose: "expense",
      money_account_id: key("cash.IQD"),
      party_name: "مؤجر المكتب",
      description: "إيجار تشرين الأول",
      ...patch,
    });
    // Capital: 10,000,000 into IQD cash, 1,000 into USD bank.
    await ok("POST", "/api/vouchers", { kind: "receipt", voucher_date: "2026-10-01", currency: "IQD", amount: "10000000", purpose: "capital", money_account_id: key("cash.IQD"), party_name: "صاحب المكتب", description: "رأس مال" });
    await ok("POST", "/api/vouchers", { kind: "receipt", voucher_date: "2026-10-01", currency: "USD", amount: "1000", purpose: "capital", money_account_id: key("bank.USD"), party_name: "صاحب المكتب", description: "رأس مال" });

    let rent: { id: number };
    await t.test("expense categories pick the expense account of each currency", async () => {
      const defaults = await ok("GET", "/api/expense-categories");
      assert.equal(defaults.length, 9);
      const operating = (await ok("GET", "/api/accounting/accounts")).find((row: { system_key: string }) => row.system_key === "operating_expenses");
      const rentAccount = await ok("POST", "/api/accounting/accounts", { code: "5203", name: "إيجار المكتب — دينار", account_type: "expense", parent_id: operating.id, currency: "IQD" });
      await refused("POST", "/api/expense-categories", { name: "إيجار المكتب", iqd_account_id: rentAccount.id }, 409, "CATEGORY_EXISTS");
      await refused("POST", "/api/expense-categories", { name: "إيجار", iqd_account_id: key("operating_expenses.USD") }, 400, "CATEGORY_RULE", /بعملة الدينار/);
      await refused("POST", "/api/expense-categories", { name: "إيجار", iqd_account_id: key("cash.IQD") }, 400, "CATEGORY_RULE", /ليس حساب مصروفات/);
      await refused("POST", "/api/expense-categories", { name: "إيجار" }, 400);
      rent = await ok("POST", "/api/expense-categories", { name: "إيجار المقر", iqd_account_id: rentAccount.id });
      const paid = await ok("POST", "/api/vouchers", voucher({ amount: "1500000", expense_category_id: rent.id }));
      assert.equal(paid.other_account_code, "5203", "the category's account");
      assert.equal(paid.expense_category_name, "إيجار المقر");
      await refused("POST", "/api/vouchers", voucher({ amount: "1", currency: "USD", money_account_id: key("bank.USD"), expense_category_id: rent.id }), 400, "VOUCHER_RULE", /لا حساب للتصنيف/);
      await refused("POST", "/api/vouchers", voucher({ amount: "1", expense_category_id: rent.id, other_account_id: key("operating_expenses.IQD") }), 400, "VOUCHER_RULE", /حسابه/);
      await refused("POST", "/api/vouchers", voucher({ amount: "1", purpose: "payable", expense_category_id: rent.id }), 400, "VOUCHER_RULE", /غرضه مصروف/);
      await ok("PUT", `/api/expense-categories/${rent.id}`, { name: "إيجار المقر", iqd_account_id: rentAccount.id, is_active: false });
      await refused("POST", "/api/vouchers", voucher({ amount: "1", expense_category_id: rent.id }), 400, "VOUCHER_RULE", /موقوف/);
      await ok("PUT", `/api/expense-categories/${rent.id}`, { name: "إيجار المقر", iqd_account_id: rentAccount.id, is_active: true });
      assert.equal((await ok("GET", `/api/vouchers/paged?expense_category_id=${rent.id}`)).total, 1);
      assert.equal(await balance(key("cash.IQD")), "8500000.00");
    });

    let transfer: { id: number; code: string; journal_entry_id: number };
    await t.test("a transfer moves money within one currency, never more than is there", async () => {
      transfer = await ok("POST", "/api/cash/transfers", { transfer_date: "2026-10-11", currency: "IQD", from_account_id: key("cash.IQD"), to_account_id: key("bank.IQD"), amount: "4000000", description: "إيداع في المصرف" });
      assert.equal(transfer.code, "TR-000001");
      const lines = (await pool.query("SELECT a.system_key, l.debit::text, l.credit::text FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = $1 ORDER BY l.line_no", [transfer.journal_entry_id])).rows;
      assert.deepEqual(lines.map((row) => [row.system_key, row.debit, row.credit]), [["bank.IQD", "4000000.00", "0.00"], ["cash.IQD", "0.00", "4000000.00"]]);
      assert.equal(await balance(key("cash.IQD")), "4500000.00");
      assert.equal(await balance(key("bank.IQD")), "4000000.00");
      const asOf = (await ok("GET", "/api/cash/balances?as_of=2026-10-10")).find((row: { id: number }) => row.id === key("bank.IQD"));
      assert.equal(asOf.balance, "0.00", "before the transfer's date");
      const url = "/api/cash/transfers";
      await refused("POST", url, { transfer_date: "2026-10-11", currency: "IQD", from_account_id: key("cash.IQD"), to_account_id: key("bank.IQD"), amount: "4500000.01", description: "x" }, 409, "TRANSFER_BALANCE", /لا يكفي/);
      await refused("POST", url, { transfer_date: "2026-10-11", currency: "IQD", from_account_id: key("cash.IQD"), to_account_id: key("bank.USD"), amount: "1", description: "x" }, 400, "TRANSFER_RULE", /لا تحويل بين العملات/);
      await refused("POST", url, { transfer_date: "2026-10-11", currency: "IQD", from_account_id: key("cash.IQD"), to_account_id: key("cash.IQD"), amount: "1", description: "x" }, 400, "TRANSFER_RULE", /مختلفين/);
      await refused("POST", url, { transfer_date: "2026-10-11", currency: "IQD", from_account_id: key("cash.IQD"), to_account_id: key("brokerage_income.IQD"), amount: "1", description: "x" }, 400, "TRANSFER_RULE");
      // Two transfers racing for what is left: one is refused.
      const rest = { transfer_date: "2026-10-12", currency: "IQD", from_account_id: key("cash.IQD"), to_account_id: key("bank.IQD"), amount: "3000000", description: "سباق" };
      const results = await Promise.all([call("POST", url, rest), call("POST", url, rest)]);
      assert.deepEqual(results.map((result) => result.statusCode).sort(), [201, 409]);
    });

    await t.test("a transfer is voided only while its money is still where it went", async () => {
      const voided = await ok("POST", `/api/cash/transfers/${transfer.id}/void`, { void_date: "2026-10-13", reason: "أُدخل خطأً" });
      assert.equal(voided.status, "voided");
      assert.ok(voided.void_entry_code);
      assert.equal(await balance(key("bank.IQD")), "3000000.00", "only the racing transfer is left in the bank");
      await refused("POST", `/api/cash/transfers/${transfer.id}/void`, { reason: "x" }, 409, "TRANSFER_VOIDED");
      const raced = (await ok("GET", "/api/cash/transfers/paged?status=posted")).items[0];
      await ok("POST", "/api/vouchers", voucher({ amount: "2500000", money_account_id: key("bank.IQD"), description: "دفعة من المصرف" }));
      await refused("POST", `/api/cash/transfers/${raced.id}/void`, { reason: "x" }, 409, "TRANSFER_BALANCE", /لا يُلغى/);
      assert.equal((await call("POST", `/api/accounting/journal/${raced.journal_entry_id}/reverse`, { reason: "x" })).json().code, "ENTRY_FROM_DOCUMENT");
    });

    await t.test("a reconciliation records the difference and, when asked, posts it", async () => {
      const cashBook = await balance(key("cash.IQD"));
      assert.equal(cashBook, "5500000.00");
      // Counted 250.50 short, adjusted: the shortage is an expense.
      const short = await ok("POST", "/api/cash/reconciliations", { account_id: key("cash.IQD"), statement_date: "2026-10-31", statement_balance: "5499749.50", adjust: true, notes: "جرد آخر الشهر" });
      assert.deepEqual([short.code, short.book_balance, short.difference], ["RN-000001", "5500000.00", "-250.50"]);
      assert.ok(short.adjustment_entry_code);
      assert.equal(await balance(key("cash.IQD")), "5499749.50", "the books now match the count");
      const lines = (await pool.query("SELECT a.system_key, l.debit::text, l.credit::text FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = $1 ORDER BY l.line_no", [short.adjustment_entry_id])).rows;
      assert.deepEqual(lines.map((row) => [row.system_key, row.debit, row.credit]), [["operating_expenses.IQD", "250.50", "0.00"], ["cash.IQD", "0.00", "250.50"]]);
      // A statement over the books, not adjusted: recorded only.
      const over = await ok("POST", "/api/cash/reconciliations", { account_id: key("bank.IQD"), statement_date: "2026-10-31", statement_balance: "500125", adjust: false });
      assert.deepEqual([over.book_balance, over.difference, over.adjustment_entry_id], ["500000.00", "125.00", null]);
      // Overage adjusted: other income.
      const overAdjusted = await ok("POST", "/api/cash/reconciliations", { account_id: key("bank.IQD"), statement_date: "2026-10-31", statement_balance: "500125", adjust: true });
      assert.ok(overAdjusted.adjustment_entry_id);
      assert.equal(await balance(key("bank.IQD")), "500125.00");
      // The books on an earlier date.
      const earlier = await ok("POST", "/api/cash/reconciliations", { account_id: key("cash.IQD"), statement_date: "2026-10-05", statement_balance: "10000000", adjust: false });
      assert.deepEqual([earlier.book_balance, earlier.difference], ["10000000.00", "0.00"]);
      await refused("POST", "/api/cash/reconciliations", { account_id: key("brokerage_income.IQD"), statement_date: "2026-10-31", statement_balance: "1" }, 400, "RECONCILIATION_RULE");
      await ok("POST", "/api/accounting/periods", { period: "2026-09" });
      await refused("POST", "/api/cash/reconciliations", { account_id: key("cash.IQD"), statement_date: "2026-09-30", statement_balance: "5", adjust: true }, 400, "LEDGER_RULE", /مقفل/);
      assert.equal((await ok("GET", `/api/cash/reconciliations?account_id=${key("cash.IQD")}`)).length, 2, "a refused one leaves nothing");
    });

    await t.test("transfers and reconciliations never change in the database", async () => {
      assert.equal(await sqlState("UPDATE cash_transfers SET amount = 1 WHERE id = $1", [transfer.id]), "DL001");
      assert.equal(await sqlState("DELETE FROM cash_transfers WHERE id = $1", [transfer.id]), "DL001");
      assert.equal(await sqlState("UPDATE cash_reconciliations SET notes = 'x'"), "DL001");
      assert.equal(await sqlState("DELETE FROM cash_reconciliations"), "DL001");
      assert.equal(await sqlState("UPDATE vouchers SET expense_category_id = NULL WHERE expense_category_id IS NOT NULL"), "DL001", "whole rows are compared now");
    });

    await t.test("reading cash and moving it are separate permissions", async () => {
      const reader = await userWith("cash_reader", ["cash.read"]);
      assert.equal((await call("GET", "/api/cash/transfers/paged", undefined, reader)).statusCode, 200);
      assert.equal((await call("POST", "/api/cash/transfers", { transfer_date: "2026-10-20", currency: "IQD", from_account_id: key("cash.IQD"), to_account_id: key("bank.IQD"), amount: "1", description: "x" }, reader)).statusCode, 403);
      assert.equal((await call("POST", "/api/cash/reconciliations", { account_id: key("cash.IQD"), statement_date: "2026-10-31", statement_balance: "1" }, reader)).statusCode, 403);
      const cashier = await userWith("cashier_e", ["vouchers.read"]);
      assert.equal((await call("GET", "/api/expense-categories", undefined, cashier)).statusCode, 200);
      assert.equal((await call("POST", "/api/expense-categories", { name: "x", iqd_account_id: key("operating_expenses.IQD") }, cashier)).statusCode, 403);
      assert.equal((await call("GET", "/api/cash/balances", undefined, cashier)).statusCode, 403);
    });

    await t.test("restores keep transfers, reconciliations and categories; an older archive gets the defaults", async () => {
      const count = async () => (await pool.query("SELECT (SELECT count(*) FROM cash_transfers)::int AS t, (SELECT count(*) FROM cash_reconciliations)::int AS r, (SELECT count(*) FROM expense_categories)::int AS c")).rows[0];
      const before = await count();
      const archive = path.join(ctx.root, "cash.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      assert.equal((await restoreBackup(archive, "full", ctx.adminId)).ok, true);
      ctx.token = (await login("removal_admin", "1234"))!.token;
      assert.deepEqual(await count(), before);
      assert.equal(await sqlState("UPDATE cash_transfers SET amount = 1 WHERE id = $1", [transfer.id]), "DL001");
      assert.equal((await restoreBackup(FIXTURE, "full")).ok, true);
      assert.equal(Number((await pool.query("SELECT count(*) FROM expense_categories")).rows[0].count), 9);
    });
  } finally {
    await ctx.close();
  }
});
