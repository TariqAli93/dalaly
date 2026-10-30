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
// Commissions (Phase 4d): recorded on a deal as the payer's receivable and
// the office's income, with employees' shares as expense and payable;
// collected by allocated receipts and paid by allocated payments, never
// beyond what is left; cancelled only while nothing is settled; triggers,
// permissions and restores.

type Commission = {
  id: number;
  code: string;
  amount: string;
  collected: string;
  outstanding: string;
  shares_total: string;
  office_share: string;
  status: string;
  journal_entry_id: number;
  cancel_entry_id: number | null;
  splits: Array<{ id: number; user_id: number; amount: string; paid: string; outstanding: string }>;
  vouchers: Array<{ code: string; status: string }>;
};

async function sqlState(text: string, values: unknown[] = []) {
  try {
    await pool.query(text, values);
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

test("a database at 0010 migrates to commissions with its data", async () => {
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
    const previous = journal.entries.filter((entry: { tag: string }) => entry.tag < "0011");
    for (const entry of previous) fs.copyFileSync(`drizzle/${entry.tag}.sql`, path.join(before, `${entry.tag}.sql`));
    fs.writeFileSync(path.join(before, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previous }));
    await runDatabaseMigrations(before);
    const person = (await pool.query("INSERT INTO people(code, full_name, phone_primary) VALUES('UP-1', 'زبون', '07700000009') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO deals(code, deal_type, client_person_id) VALUES('D-0001', 'sale', $1)", [person]);

    await runDatabaseMigrations(path.resolve("drizzle"));
    assert.equal(Number((await pool.query("SELECT count(*) FROM deals")).rows[0].count), 1);
    const columns = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'vouchers' AND column_name LIKE 'commission%' ORDER BY 1")).rows.map((row) => row.column_name);
    assert.deepEqual(columns, ["commission_id", "commission_split_id"]);
    const triggers = (await pool.query("SELECT tgname FROM pg_trigger WHERE tgname IN ('commissions_guard', 'commission_splits_guard') ORDER BY 1")).rows.map((row) => row.tgname);
    assert.deepEqual(triggers, ["commission_splits_guard", "commissions_guard"]);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("commissions are income, shares are payable, and both settle only what is left", async (t) => {
  const ctx = await removalTestContext("commissions");
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
      return { id: Number(user.id), token: (await login(username, "5678"))!.token };
    }
    const keys = new Map(
      (await pool.query("SELECT system_key, id FROM accounts WHERE system_key IS NOT NULL")).rows.map((row) => [row.system_key, Number(row.id)]),
    );
    const key = (name: string) => keys.get(name)!;
    const [seller, buyer] = ctx.people;
    const deal = Number(
      (await pool.query(
        "INSERT INTO deals(code, deal_type, stage, client_person_id, owner_person_id, currency, agreed_price) VALUES('D-0001', 'sale', 'agreed', $1, $2, 'IQD', 150000000) RETURNING id",
        [buyer.id, seller.id],
      )).rows[0].id,
    );
    const agentA = await userWith("agent_a", ["deals.read"]);
    const agentB = await userWith("agent_b", ["deals.read"]);
    const lines = async (entryId: number) =>
      (await pool.query(
        "SELECT a.system_key, l.debit::text, l.credit::text, l.person_id, l.memo FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = $1 ORDER BY l.line_no",
        [entryId],
      )).rows.map((row) => [row.system_key, row.debit, row.credit, row.person_id && Number(row.person_id), row.memo]);
    const balance = async (systemKey: string, personId?: number) =>
      (await pool.query(
        `SELECT coalesce(sum(l.debit - l.credit), 0)::numeric(18,2)::text AS net FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
         WHERE e.status = 'posted' AND a.system_key = $1 AND ($2::bigint IS NULL OR l.person_id = $2)`,
        [systemKey, personId ?? null],
      )).rows[0].net;
    const receipt = (patch: object) => ({
      kind: "receipt",
      voucher_date: "2026-10-20",
      currency: "IQD",
      purpose: "commission",
      money_account_id: key("cash.IQD"),
      description: "تحصيل عمولة",
      ...patch,
    });

    let buyerCommission: Commission;
    await t.test("a percentage commission posts the receivable, the income and the shares in one entry", async () => {
      buyerCommission = await ok("POST", "/api/commissions", {
        deal_id: deal,
        payer_role: "client",
        basis: "percent",
        rate: "2.5",
        commission_date: "2026-10-15",
        splits: [
          { user_id: agentA.id, basis: "percent", rate: "40" },
          { user_id: agentB.id, basis: "fixed", amount: "500000" },
        ],
      });
      assert.equal(buyerCommission.code, "CM-000001");
      assert.deepEqual(
        [buyerCommission.amount, buyerCommission.shares_total, buyerCommission.office_share, buyerCommission.outstanding],
        ["3750000.00", "2000000.00", "1750000.00", "3750000.00"],
      );
      assert.deepEqual(await lines(buyerCommission.journal_entry_id), [
        ["receivables.IQD", "3750000.00", "0.00", buyer.id, buyer.full_name],
        ["brokerage_income.IQD", "0.00", "3750000.00", null, null],
        ["commission_expense.IQD", "2000000.00", "0.00", null, null],
        ["commissions_payable.IQD", "0.00", "1500000.00", null, "agent_a"],
        ["commissions_payable.IQD", "0.00", "500000.00", null, "agent_b"],
      ]);
      assert.equal((await pool.query("SELECT source_type FROM journal_entries WHERE id = $1", [buyerCommission.journal_entry_id])).rows[0].source_type, "commission");
    });

    await t.test("one live commission per payer, on a deal that can bear one", async () => {
      await refused("/api/commissions", { deal_id: deal, payer_role: "client", basis: "fixed", amount: "1", commission_date: "2026-10-15" }, 409, "COMMISSION_EXISTS", /CM-000001/);
      const seller_ = await ok("POST", "/api/commissions", { deal_id: deal, payer_role: "owner", basis: "fixed", amount: "1500", currency: "USD", commission_date: "2026-10-15" });
      assert.equal(seller_.code, "CM-000002");
      await refused("/api/commissions", { deal_id: deal, payer_role: "client", basis: "percent", rate: "2", currency: "USD", commission_date: "2026-10-15" }, 409, "COMMISSION_EXISTS");
      const bare = Number((await pool.query("INSERT INTO deals(code, deal_type, client_person_id) VALUES('D-0002', 'sale', $1) RETURNING id", [buyer.id])).rows[0].id);
      await refused("/api/commissions", { deal_id: bare, payer_role: "client", basis: "percent", rate: "2", commission_date: "2026-10-15" }, 400, "COMMISSION_RULE", /السعر المتفق عليه/);
      await refused("/api/commissions", { deal_id: bare, payer_role: "owner", basis: "fixed", amount: "5", commission_date: "2026-10-15" }, 400, "COMMISSION_RULE", /لا بائع/);
      await refused("/api/commissions", { deal_id: bare, payer_role: "client", basis: "fixed", amount: "100", commission_date: "2026-10-15", splits: [{ user_id: agentA.id, basis: "fixed", amount: "101" }] }, 400, "COMMISSION_RULE", /أكبر من العمولة/);
      await pool.query("UPDATE users SET is_active = false WHERE id = $1", [agentB.id]);
      await refused("/api/commissions", { deal_id: bare, payer_role: "client", basis: "fixed", amount: "100", commission_date: "2026-10-15", splits: [{ user_id: agentB.id, basis: "fixed", amount: "10" }] }, 400, "COMMISSION_RULE", /موقوف/);
      await pool.query("UPDATE users SET is_active = true WHERE id = $1", [agentB.id]);
      await pool.query("UPDATE deals SET stage = 'lost', lost_reason = 'x', closed_at = now() WHERE id = $1", [bare]);
      await refused("/api/commissions", { deal_id: bare, payer_role: "client", basis: "fixed", amount: "100", commission_date: "2026-10-15" }, 409, "COMMISSION_RULE", /خاسرة/);
    });

    await t.test("receipts collect the commission into the payer's receivable, never beyond it", async () => {
      const first = await ok("POST", "/api/vouchers", receipt({ amount: "1000000", commission_id: buyerCommission.id }));
      assert.equal(first.other_account_code, "1301", "the receivable, not income again");
      assert.equal(first.party_name, buyer.full_name);
      assert.equal(first.commission_code, "CM-000001");
      await refused("/api/vouchers", receipt({ amount: "2750000.01", commission_id: buyerCommission.id }), 409, "VOUCHER_ALLOCATION", /أكبر من المتبقي/);
      await refused("/api/vouchers", receipt({ amount: "1", commission_id: buyerCommission.id, purpose: "other_income" }), 400, "VOUCHER_RULE", /عمولة المكتب/);
      await refused("/api/vouchers", receipt({ amount: "1", commission_id: buyerCommission.id, currency: "USD", money_account_id: key("cash.USD") }), 400, "VOUCHER_RULE", /عملة/);
      await refused("/api/vouchers", receipt({ amount: "1", commission_id: buyerCommission.id, person_id: seller.id }), 400, "VOUCHER_RULE", /صاحبها/);
      // Two receipts racing for the rest: one takes it.
      const rest = receipt({ amount: "2750000", commission_id: buyerCommission.id });
      const results = await Promise.all([call("POST", "/api/vouchers", rest), call("POST", "/api/vouchers", rest)]);
      assert.deepEqual(results.map((result) => result.statusCode).sort(), [201, 409]);
      const settled: Commission = await ok("GET", `/api/commissions/${buyerCommission.id}`);
      assert.deepEqual([settled.collected, settled.outstanding], ["3750000.00", "0.00"]);
      await refused("/api/vouchers", receipt({ amount: "1", commission_id: buyerCommission.id }), 409, "VOUCHER_ALLOCATION", /مسدد بالكامل/);
      assert.equal(await balance("receivables.IQD", buyer.id), "0.00", "nothing left owed");
      assert.equal(await balance("brokerage_income.IQD"), "-3750000.00", "income counted once");
      assert.equal((await ok("GET", "/api/commissions/paged?state=settled")).total, 1);
    });

    await t.test("payments pay employees' shares from commissions payable, never beyond them", async () => {
      const [shareA] = buyerCommission.splits.filter((split) => split.user_id === agentA.id);
      const payout = (patch: object) => ({
        kind: "payment",
        voucher_date: "2026-10-21",
        currency: "IQD",
        purpose: "commission",
        money_account_id: key("cash.IQD"),
        description: "حصة من العمولة",
        commission_split_id: shareA.id,
        ...patch,
      });
      await refused("/api/vouchers", payout({ amount: "1500000.01" }), 409, "VOUCHER_ALLOCATION", /agent_a/);
      const paid = await ok("POST", "/api/vouchers", payout({ amount: "1000000" }));
      assert.equal(paid.other_account_code, "2301");
      assert.equal(paid.party_name, "agent_a");
      await refused("/api/vouchers", payout({ amount: "1", purpose: "expense" }), 400, "VOUCHER_RULE", /عمولة موظف/);
      const payable = await ok("GET", "/api/commissions/payable");
      assert.deepEqual(
        payable.map((row: { user_name: string; outstanding: string }) => [row.user_name, row.outstanding]),
        [["agent_a", "500000.00"], ["agent_b", "500000.00"]],
      );
      assert.equal((await ok("GET", `/api/commissions/payable?user_id=${agentB.id}`)).length, 1);
      await ok("POST", `/api/vouchers/${paid.id}/void`, { reason: "دُفع من حساب آخر" });
      const detail: Commission = await ok("GET", `/api/commissions/${buyerCommission.id}`);
      assert.equal(detail.splits.find((split) => split.user_id === agentA.id)!.outstanding, "1500000.00", "a voided payment no longer counts");
    });

    await t.test("a commission is cancelled only while nothing is settled, by reversing its entry", async () => {
      await refused(`/api/commissions/${buyerCommission.id}/cancel`, { reason: "x" }, 409, "COMMISSION_SETTLED", /ألغِ سنداتها/);
      const usd: Commission = (await ok("GET", "/api/commissions/paged?currency=USD")).items[0];
      const cancelled: Commission = await ok("POST", `/api/commissions/${usd.id}/cancel`, { cancel_date: "2026-10-22", reason: "اتفق البائع على عمولة أخرى" });
      assert.equal(cancelled.status, "cancelled");
      assert.ok(cancelled.cancel_entry_id);
      assert.equal(await balance("receivables.USD", seller.id), "0.00");
      await refused(`/api/commissions/${usd.id}/cancel`, { reason: "x" }, 409, "COMMISSION_CANCELLED");
      assert.equal((await call("POST", `/api/accounting/journal/${usd.journal_entry_id}/reverse`, { reason: "x" })).json().code, "ENTRY_FROM_DOCUMENT");
      const again = await ok("POST", "/api/commissions", { deal_id: deal, payer_role: "owner", basis: "percent", rate: "1", commission_date: "2026-10-22" });
      assert.equal(again.amount, "1500000.00", "a cancelled commission makes room for another");
      await refused("/api/vouchers", receipt({ amount: "1", commission_id: usd.id, currency: "USD", money_account_id: key("cash.USD") }), 400, "VOUCHER_RULE", /ملغاة/);
    });

    await t.test("recorded commissions and shares never change in the database", async () => {
      assert.equal(await sqlState("UPDATE commissions SET amount = 1 WHERE id = $1", [buyerCommission.id]), "DL001");
      assert.equal(await sqlState("DELETE FROM commissions WHERE id = $1", [buyerCommission.id]), "DL001");
      assert.equal(await sqlState("UPDATE commission_splits SET amount = 1 WHERE commission_id = $1", [buyerCommission.id]), "DL001");
      assert.equal(await sqlState("DELETE FROM commission_splits WHERE commission_id = $1", [buyerCommission.id]), "DL001");
      assert.equal(await sqlState("UPDATE vouchers SET commission_id = NULL WHERE commission_id = $1", [buyerCommission.id]), "DL001", "a voucher's allocation is fixed too");
      assert.equal(await sqlState("DELETE FROM deals WHERE id = $1", [deal]), "DL001");
      assert.equal(await sqlState("DELETE FROM users WHERE id = $1", [agentA.id]), "23503", "an employee with a share is deactivated, not deleted");
    });

    await t.test("recording and cancelling are separate from reading", async () => {
      const reader = await userWith("commission_reader", ["commissions.read"]);
      assert.equal((await call("GET", "/api/commissions/paged", undefined, reader.token)).statusCode, 200);
      assert.equal((await call("POST", "/api/commissions", { deal_id: deal, payer_role: "client", basis: "fixed", amount: "1", commission_date: "2026-10-15" }, reader.token)).statusCode, 403);
      assert.equal((await call("POST", `/api/commissions/${buyerCommission.id}/cancel`, { reason: "x" }, reader.token)).statusCode, 403);
      assert.equal((await call("GET", "/api/commissions/paged", undefined, agentA.token)).statusCode, 403);
      const audits = (await pool.query("SELECT action FROM audit_logs WHERE entity_type = 'commission'")).rows.map((row) => row.action);
      assert.ok(audits.includes("created") && audits.includes("status_changed"));
    });

    await t.test("restores keep commissions, shares and their links", async () => {
      const count = async () => (await pool.query("SELECT (SELECT count(*) FROM commissions)::int AS commissions, (SELECT count(*) FROM commission_splits)::int AS splits")).rows[0];
      const before = await count();
      const archive = path.join(ctx.root, "commissions.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      assert.equal((await restoreBackup(archive, "crm", ctx.adminId)).ok, true);
      const row = (await pool.query("SELECT deal_id, payer_person_id FROM commissions WHERE id = $1", [buyerCommission.id])).rows[0];
      assert.deepEqual([Number(row.deal_id), Number(row.payer_person_id)], [deal, buyer.id]);
      assert.equal((await restoreBackup(archive, "full", ctx.adminId)).ok, true);
      ctx.token = (await login("removal_admin", "1234"))!.token;
      assert.deepEqual(await count(), before);
      const restored: Commission = await ok("GET", `/api/commissions/${buyerCommission.id}`);
      assert.deepEqual([restored.collected, restored.splits.length], ["3750000.00", 2]);
      assert.equal(await sqlState("UPDATE commissions SET amount = 1 WHERE id = $1", [buyerCommission.id]), "DL001");
    });
  } finally {
    await ctx.close();
  }
});
