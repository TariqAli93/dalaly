import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { exportBackup, restoreBackup } from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Receipts and payments (Phase 4c): each posted to the ledger with it; the
// purpose decides the other side (a seller's money is client funds, not
// income); payments limited to what cash and client funds hold, also under
// concurrency; voiding; the triggers; permissions; restores.

type Voucher = {
  id: number;
  code: string;
  kind: string;
  status: string;
  amount: string;
  purpose: string;
  other_account_code: string;
  party_name: string;
  journal_entry_id: number;
  journal_entry_code: string;
  void_entry_id: number | null;
  amount_in_words: string;
};

async function sqlState(text: string, values: unknown[] = []) {
  try {
    await pool.query(text, values);
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

test("receipts and payments post with their vouchers and keep to what is held", async (t) => {
  const ctx = await removalTestContext("vouchers");
  try {
    const call = (method: "GET" | "POST" | "DELETE", url: string, body?: unknown, token = ctx.token) =>
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
    const refused = async (body: unknown, status: number, code?: string, message?: RegExp) => {
      const result = await call("POST", "/api/vouchers", body);
      assert.equal(result.statusCode, status, result.body);
      if (code) assert.equal(result.json().code, code);
      if (message) assert.match(result.json().message, message);
    };
    async function userWith(username: string, keys: string[]) {
      const role = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
      await pool.query("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)", [role.id, keys]);
      const user = (await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, $2) RETURNING id", [username, await hashPin("5678")])).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      return { id: Number(user.id), token: (await login(username, "5678"))!.token };
    }
    const keys = new Map(
      (await pool.query("SELECT system_key, id FROM accounts WHERE system_key IS NOT NULL")).rows.map((row) => [row.system_key, Number(row.id)]),
    );
    const id = (key: string) => keys.get(key)!;
    const [seller, buyer] = ctx.people;
    const deal = Number(
      (await pool.query("INSERT INTO deals(code, deal_type, client_person_id, owner_person_id, currency) VALUES('D-0001', 'sale', $1, $2, 'IQD') RETURNING id", [buyer.id, seller.id])).rows[0].id,
    );
    const voucher = (patch: object) => ({
      kind: "receipt",
      voucher_date: "2026-10-15",
      currency: "IQD",
      amount: "1500000.50",
      purpose: "commission",
      money_account_id: id("cash.IQD"),
      person_id: buyer.id,
      deal_id: deal,
      description: "عمولة بيع بيت المنصور",
      ...patch,
    });
    const lines = async (entryId: number) =>
      (await pool.query(
        "SELECT a.system_key, l.debit::text, l.credit::text, l.person_id, l.deal_id FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = $1 ORDER BY l.line_no",
        [entryId],
      )).rows.map((row) => [row.system_key, row.debit, row.credit, row.person_id && Number(row.person_id), row.deal_id && Number(row.deal_id)]);

    let commission: Voucher;
    await t.test("a commission receipt is office income, posted with the voucher", async () => {
      commission = await ok("POST", "/api/vouchers", voucher({}));
      assert.equal(commission.code, "RC-000001");
      assert.equal(commission.status, "posted");
      assert.equal(commission.party_name, buyer.full_name);
      assert.equal(commission.other_account_code, "4101");
      assert.equal(commission.amount_in_words, "فقط مليون وخمسمئة ألف دينار عراقي وخمسون فلساً لا غير");
      assert.deepEqual(await lines(commission.journal_entry_id), [
        ["cash.IQD", "1500000.50", "0.00", null, deal],
        ["brokerage_income.IQD", "0.00", "1500000.50", buyer.id, deal],
      ]);
      const entry = (await pool.query("SELECT status, source_type, source_id, idempotency_key FROM journal_entries WHERE id = $1", [commission.journal_entry_id])).rows[0];
      assert.deepEqual(entry, { status: "posted", source_type: "receipt", source_id: String(commission.id), idempotency_key: `voucher:${commission.id}` });
    });

    await t.test("money collected for a seller is client funds, paid out only up to what is held", async () => {
      const held = await ok("POST", "/api/vouchers", voucher({ purpose: "client_funds", amount: "100000000", person_id: seller.id, description: "عربون لحساب البائع" }));
      assert.equal(held.other_account_code, "2101");
      await refused(voucher({ purpose: "client_funds", amount: "5", other_account_id: id("brokerage_income.IQD") }), 400, "VOUCHER_RULE", /لا يناسب غرض السند/);
      const payout = voucher({ kind: "payment", purpose: "client_funds", amount: "60000000", person_id: seller.id, description: "تسليم البائع" });
      assert.equal((await ok("POST", "/api/vouchers", payout)).code, "PV-000001");
      await refused({ ...payout, amount: "40000000.01" }, 409, "VOUCHER_CLIENT_FUNDS", /40000000.00 فقط/);
      await refused({ ...payout, person_id: buyer.id, amount: "1" }, 409, "VOUCHER_CLIENT_FUNDS", /0.00 فقط/);
      await refused({ ...payout, person_id: null, party_name: "شخص" }, 400, "VOUCHER_RULE", /لزبون بعينه/);
      assert.deepEqual(await ok("GET", `/api/vouchers/client-funds?person_id=${seller.id}`), [{ currency: "IQD", held: "40000000.00" }]);
    });

    await t.test("a payment is limited to what the cash or bank account holds, also when two race", async () => {
      // Cash IQD now: 1,500,000.50 + 100,000,000 - 60,000,000.
      const accounts = await ok("GET", "/api/vouchers/money-accounts");
      const cash = accounts.find((row: { id: number }) => row.id === id("cash.IQD"));
      assert.deepEqual([cash.kind, cash.balance, cash.currency], ["cash", "41500000.50", "IQD"]);
      const expense = voucher({ kind: "payment", purpose: "expense", amount: "41500000.51", person_id: null, deal_id: null, party_name: "مؤجر المكتب", description: "إيجار المكتب" });
      await refused(expense, 409, "VOUCHER_BALANCE", /41500000.50 لا يكفي/);
      const half = { ...expense, amount: "30000000" };
      const results = await Promise.all([call("POST", "/api/vouchers", half), call("POST", "/api/vouchers", half)]);
      assert.deepEqual(results.map((result) => result.statusCode).sort(), [201, 409], "one of two payments that together overdraw is refused");
      assert.equal((await ok("GET", "/api/vouchers/money-accounts")).find((row: { id: number }) => row.id === id("cash.IQD")).balance, "11500000.50");
    });

    await t.test("accounts, currency and party are checked", async () => {
      await refused(voucher({ currency: "USD" }), 400, "VOUCHER_RULE", /بعملة غير عملة السند/);
      await refused(voucher({ money_account_id: id("brokerage_income.IQD") }), 400, "VOUCHER_RULE", /ليس صندوقاً ولا مصرفاً/);
      await refused(voucher({ purpose: "receivable", other_account_id: id("bank.IQD") }), 400, "VOUCHER_RULE", /تحويل نقدي/);
      await refused(voucher({ kind: "payment", purpose: "other_income" }), 400, "VOUCHER_RULE");
      await refused(voucher({ person_id: null, party_name: null }), 400, "VOUCHER_RULE", /اسمه/);
      await refused(voucher({ amount: "0" }), 400);
      await refused(voucher({ amount: "1.234" }), 400);
      const walkIn = await ok("POST", "/api/vouchers", voucher({ purpose: "other_income", person_id: null, deal_id: null, party_name: "مراجع", amount: "25000", description: "استنساخ" }));
      assert.equal(walkIn.party_name, "مراجع");
      const usd = await ok("POST", "/api/vouchers", voucher({ currency: "USD", money_account_id: id("bank.USD"), amount: "250.05", deal_id: null }));
      assert.equal(usd.amount_in_words, "فقط مئتان وخمسون دولار أمريكي وخمسة سنتات لا غير");
      assert.equal(usd.other_account_code, "4102");
    });

    await t.test("voiding posts the reversing entry; a voucher's entry is undone only by its voucher", async () => {
      const manual = await call("POST", `/api/accounting/journal/${commission.journal_entry_id}/reverse`, { reason: "x" });
      assert.equal(manual.statusCode, 409);
      assert.equal(manual.json().code, "ENTRY_FROM_DOCUMENT");
      const voided: Voucher = await ok("POST", `/api/vouchers/${commission.id}/void`, { void_date: "2026-10-20", reason: "دُفعت العمولة نقداً مرتين" });
      assert.equal(voided.status, "voided");
      assert.ok(voided.void_entry_id);
      assert.deepEqual(await lines(voided.void_entry_id!), [
        ["cash.IQD", "0.00", "1500000.50", null, deal],
        ["brokerage_income.IQD", "1500000.50", "0.00", buyer.id, deal],
      ]);
      const again = await call("POST", `/api/vouchers/${commission.id}/void`, { reason: "x" });
      assert.equal(again.statusCode, 409);
      assert.equal(again.json().code, "VOUCHER_VOIDED");
      assert.equal((await call("POST", `/api/accounting/journal/${voided.void_entry_id}/reverse`, { reason: "x" })).statusCode, 409);
      assert.equal((await call("POST", "/api/vouchers/999999/void", { reason: "x" })).statusCode, 404);
    });

    await t.test("an issued voucher never changes in the database", async () => {
      assert.equal(await sqlState("UPDATE vouchers SET amount = 1 WHERE id = $1", [commission.id]), "DL001", "voided");
      const posted = Number((await pool.query("SELECT id FROM vouchers WHERE status = 'posted' ORDER BY id LIMIT 1")).rows[0].id);
      assert.equal(await sqlState("UPDATE vouchers SET amount = 1 WHERE id = $1", [posted]), "DL001");
      assert.equal(await sqlState("UPDATE vouchers SET description = 'x' WHERE id = $1", [posted]), "DL001");
      assert.equal(await sqlState("DELETE FROM vouchers WHERE id = $1", [posted]), "DL001");
      // A customer named only by a receipt (no deal) is still not deleted.
      const payer = Number((await pool.query("INSERT INTO people(code, full_name, phone_primary) VALUES('VP-1', 'دافع', '07700000099') RETURNING id")).rows[0].id);
      await ok("POST", "/api/vouchers", voucher({ purpose: "other_income", person_id: payer, deal_id: null, amount: "1000" }));
      assert.equal(await sqlState("DELETE FROM people WHERE id = $1", [payer]), "DL001");
    });

    await t.test("receipts, payments and voiding are separate permissions", async () => {
      const cashier = await userWith("cashier", ["vouchers.read", "vouchers.receipt"]);
      assert.equal((await call("POST", "/api/vouchers", voucher({ amount: "10" }), cashier.token)).statusCode, 201);
      assert.equal((await call("POST", "/api/vouchers", voucher({ kind: "payment", purpose: "expense", amount: "1", person_id: null, deal_id: null, party_name: "x" }), cashier.token)).statusCode, 403);
      const latest = (await ok("GET", "/api/vouchers/paged?kind=receipt&sort_by=code&sort_order=desc")).items[0];
      assert.equal((await call("POST", `/api/vouchers/${latest.id}/void`, { reason: "x" }, cashier.token)).statusCode, 403);
      const outsider = await userWith("no_vouchers", ["accounting.read"]);
      assert.equal((await call("GET", "/api/vouchers/paged", undefined, outsider.token)).statusCode, 403);
      // A user with vouchers in their name is deactivated, not deleted.
      const removed = await call("DELETE", `/api/users/${cashier.id}`);
      assert.equal(removed.statusCode, 409);
      assert.match(removed.json().message, /أوقفه بدل حذفه/);
    });

    await t.test("vouchers are listed and filtered, and audited", async () => {
      const page = await ok("GET", `/api/vouchers/paged?person_id=${seller.id}&sort_by=code&sort_order=asc`);
      assert.deepEqual(page.items.map((row: Voucher) => row.code), ["PV-000001", "RC-000002"]);
      assert.equal((await ok("GET", "/api/vouchers/paged?status=voided")).total, 1);
      assert.equal((await ok("GET", "/api/vouchers/paged?q=استنساخ")).total, 1);
      const audits = (await pool.query("SELECT action FROM audit_logs WHERE entity_type = 'voucher'")).rows.map((row) => row.action);
      assert.ok(audits.includes("created") && audits.includes("status_changed"));
    });

    await t.test("restores keep vouchers with their entries and links", async () => {
      const count = async () => Number((await pool.query("SELECT count(*) FROM vouchers")).rows[0].count);
      const before = await count();
      const archive = path.join(ctx.root, "vouchers.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      assert.equal((await restoreBackup(archive, "crm", ctx.adminId)).ok, true);
      const row = (await pool.query("SELECT person_id, deal_id FROM vouchers WHERE id = $1", [commission.id])).rows[0];
      assert.deepEqual([Number(row.person_id), Number(row.deal_id)], [buyer.id, deal], "a customers restore keeps the links");
      await ok("POST", "/api/vouchers", voucher({ amount: "7" }));
      assert.equal((await restoreBackup(archive, "full", ctx.adminId)).ok, true);
      ctx.token = (await login("removal_admin", "1234"))!.token;
      assert.equal(await count(), before);
      assert.equal((await ok("GET", `/api/vouchers/${commission.id}`)).status, "voided");
      const next = await ok("POST", "/api/vouchers", voucher({ amount: "8" }));
      assert.ok(next.id > before && /^RC-\d{6}$/.test(next.code), "ids and codes continue after the restore");
      assert.equal(await sqlState("UPDATE vouchers SET amount = 1 WHERE id = $1", [next.id]), "DL001");
    });
  } finally {
    await ctx.close();
  }
});
