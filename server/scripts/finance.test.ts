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
// Financial integration (Phase 4f): client funds held for the landlord or
// seller apart from who paid them (a buyer's deposit, a refund out of the
// seller's funds, limits per person and per deal, voiding what was already
// handed over), the money of a deal and of a customer agreeing with the
// journal, a deal not lost or cancelled while it earns or holds money,
// triggers, permissions and restores.

async function sqlState(text: string, values: unknown[] = []) {
  try {
    await pool.query(text, values);
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

test("a database at 0012 migrates to client funds held for someone", async () => {
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
    const previous = journal.entries.filter((entry: { tag: string }) => entry.tag < "0013");
    for (const entry of previous) fs.copyFileSync(`drizzle/${entry.tag}.sql`, path.join(before, `${entry.tag}.sql`));
    fs.writeFileSync(path.join(before, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previous }));
    await runDatabaseMigrations(before);
    const column = "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'vouchers' AND column_name = 'held_for_person_id'";
    assert.equal((await pool.query(column)).rows[0].n, 0);

    await runDatabaseMigrations(path.resolve("drizzle"));
    assert.equal((await pool.query(column)).rows[0].n, 1);
    const check = (await pool.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'vouchers_held_for'")).rows[0];
    assert.match(check.def, /client_funds/);
    const guard = (await pool.query("SELECT prosrc FROM pg_proc WHERE proname = 'vouchers_guard'")).rows[0].prosrc;
    assert.match(guard, /held_for_person_id/);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("deals and customers: client funds held for their owner, totals that agree with the journal", async (t) => {
  const ctx = await removalTestContext("finance");
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
    const keys = new Map(
      (await pool.query("SELECT system_key, id FROM accounts WHERE system_key IS NOT NULL")).rows.map((row) => [row.system_key, Number(row.id)]),
    );
    const id = (key: string) => keys.get(key)!;
    const [seller, buyer] = ctx.people;
    const tenant = Number((await pool.query("INSERT INTO people(code, full_name, phone_primary) VALUES('P-T', 'علي المستأجر', '07700000003') RETURNING id")).rows[0].id);
    const stranger = Number((await pool.query("INSERT INTO people(code, full_name, phone_primary) VALUES('P-S', 'زبون آخر', '07700000004') RETURNING id")).rows[0].id);
    const sale = Number(
      (await pool.query(
        "INSERT INTO deals(code, deal_type, stage, client_person_id, owner_person_id, property_id, currency, agreed_price, expected_commission) VALUES('D-0001', 'sale', 'agreed', $1, $2, $3, 'IQD', 100000000, 2000000) RETURNING id",
        [buyer.id, seller.id, ctx.property.id],
      )).rows[0].id,
    );
    const rent = Number(
      (await pool.query(
        "INSERT INTO deals(code, deal_type, stage, client_person_id, owner_person_id, rental_id, currency, agreed_price) VALUES('D-0002', 'rent', 'agreed', $1, $2, $3, 'IQD', 750000) RETURNING id",
        [tenant, seller.id, ctx.rental.id],
      )).rows[0].id,
    );
    const voucher = (patch: object) => ({
      kind: "receipt",
      voucher_date: "2026-10-15",
      currency: "IQD",
      purpose: "client_funds",
      money_account_id: id("cash.IQD"),
      person_id: buyer.id,
      deal_id: sale,
      description: "عربون بيت الكرادة",
      ...patch,
    });
    const fundsLine = async (entryId: number) =>
      (await pool.query(
        "SELECT l.person_id, l.deal_id, l.memo FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = $1 AND a.system_key = 'client_funds.IQD'",
        [entryId],
      )).rows.map((row) => [Number(row.person_id), Number(row.deal_id), row.memo])[0];
    const held = async (personId: number) => (await ok("GET", `/api/vouchers/client-funds?person_id=${personId}`))[0]?.held ?? "0.00";

    let deposit: { id: number; code: string };
    await t.test("a deposit the buyer pays is held for the seller", async () => {
      deposit = await ok("POST", "/api/vouchers", voucher({ amount: "5000000" }));
      const shown = await ok("GET", `/api/vouchers/${deposit.id}`);
      assert.deepEqual([shown.party_name, shown.held_for_person_id, shown.held_for_name], [buyer.full_name, seller.id, seller.full_name]);
      assert.deepEqual(await fundsLine(shown.journal_entry_id), [seller.id, sale, buyer.full_name], "booked to the seller; the memo keeps the payer");
      assert.equal(await held(seller.id), "5000000.00");
      assert.equal(await held(buyer.id), "0.00");
      // A tenant's rent on the rental deal is held for its landlord.
      const rentIn = await ok("POST", "/api/vouchers", voucher({ amount: "750000", person_id: tenant, deal_id: rent, description: "إيجار تشرين الثاني" }));
      assert.equal(rentIn.held_for_person_id, seller.id);
      assert.equal(await held(seller.id), "5750000.00");
      await refused("/api/vouchers", voucher({ amount: "1", held_for_person_id: stranger }), 400, "VOUCHER_RULE", /أحد طرفيها/);
      await refused("/api/vouchers", voucher({ amount: "1", purpose: "commission", held_for_person_id: seller.id }), 400, "VOUCHER_RULE", /أمانات العملاء فقط/);
      await refused("/api/vouchers", voucher({ amount: "1", person_id: null, deal_id: null, party_name: "مراجع" }), 400, "VOUCHER_RULE", /لمن تُحفظ/);
      await refused("/api/vouchers", voucher({ amount: "1", deal_id: null, held_for_person_id: 999999 }), 400, "VOUCHER_RULE", /صاحب الأمانة غير موجود/);
    });

    await t.test("handed to the seller or back to the buyer, never beyond what is held on the deal", async () => {
      const out = (patch: object) => voucher({ kind: "payment", person_id: seller.id, description: "تسليم البائع", ...patch });
      await ok("POST", "/api/vouchers", out({ amount: "3000000" }));
      // A refund to the buyer comes out of what is held for the seller.
      await refused("/api/vouchers", out({ amount: "2000000.01", person_id: buyer.id, held_for_person_id: seller.id }), 409, "VOUCHER_CLIENT_FUNDS", /على هذه الصفقة .* 2000000.00 فقط/);
      const refund = await ok("POST", "/api/vouchers", out({ amount: "1000000", person_id: buyer.id, held_for_person_id: seller.id, description: "إرجاع جزء من العربون" }));
      assert.deepEqual([refund.person_id, refund.held_for_person_id, refund.party_name], [buyer.id, seller.id, buyer.full_name]);
      // The rent held on the other deal is not the deposit's.
      await refused("/api/vouchers", out({ amount: "750001", deal_id: rent }), 409, "VOUCHER_CLIENT_FUNDS", /على هذه الصفقة .* 750000.00 فقط/);
      // Without a buyer's record the refund still names whose funds it is.
      await refused("/api/vouchers", out({ amount: "1", person_id: null, party_name: "شخص" }), 400, "VOUCHER_RULE", /لزبون بعينه/);
      assert.equal(await held(seller.id), "1750000.00");
      // The deposit was partly handed over: it is voided only after the payments.
      await refused(`/api/vouchers/${deposit.id}/void`, { reason: "خطأ" }, 409, "VOUCHER_CLIENT_FUNDS", /ألغِ سند التسليم أولاً/);
      const seen = await ok("GET", `/api/vouchers/paged?person_id=${seller.id}&purpose=client_funds`);
      assert.equal(seen.total, 4, "the seller's: the deposit, the rent, the handover and the refund out of their funds");
    });

    let commission: { id: number; code: string };
    let collected: { id: number };
    await t.test("a deal's money agrees with the journal; its price is never income", async () => {
      commission = await ok("POST", "/api/commissions", {
        deal_id: sale, payer_role: "client", basis: "fixed", amount: "2000000", commission_date: "2026-10-16",
        splits: [{ user_id: ctx.adminId, basis: "percent", rate: "25" }],
      });
      collected = await ok("POST", "/api/vouchers", voucher({ purpose: "commission", amount: "1500000", commission_id: commission.id, description: "عمولة البيع" }));
      await ok("POST", "/api/vouchers", voucher({ kind: "payment", purpose: "expense", amount: "100000", person_id: null, party_name: "دائرة التسجيل", description: "رسوم نقل الملكية" }));
      await ok("POST", `/api/deals/${sale}/agreement`, { template_key: "sale" });

      const finance = await ok("GET", `/api/finance/deals/${sale}`);
      assert.equal(finance.deal_code, "D-0001");
      assert.deepEqual(finance.totals, [
        {
          currency: "IQD",
          expected_commission: "2000000.00",
          commission_recorded: "2000000.00",
          commission_collected: "1500000.00",
          commission_outstanding: "500000.00",
          shares_owed: "500000.00",
          shares_paid: "0.00",
          shares_outstanding: "500000.00",
          client_funds_received: "5000000.00",
          client_funds_paid_out: "4000000.00",
          client_funds_held: "1000000.00",
          receivable: "500000.00",
          commissions_payable: "500000.00",
          income: "2000000.00",
          expenses: "600000.00",
          net: "1400000.00",
        },
      ]);
      assert.deepEqual(
        [finance.contract.status, finance.contract.commission, finance.contract.currency],
        ["draft", "2000000.00", "IQD"],
        "the prepared contract carries the expected commission",
      );
      // The same figures straight from the posted lines naming the deal.
      const books = (await pool.query(
        `SELECT
           sum(CASE WHEN a.account_type = 'revenue' THEN l.credit - l.debit ELSE 0 END)::numeric(18,2)::text AS income,
           sum(CASE WHEN a.account_type = 'expense' THEN l.debit - l.credit ELSE 0 END)::numeric(18,2)::text AS expenses,
           sum(CASE WHEN a.system_key = 'client_funds.IQD' THEN l.credit - l.debit ELSE 0 END)::numeric(18,2)::text AS held,
           sum(l.debit - l.credit)::numeric(18,2)::text AS balance
         FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
         JOIN accounts a ON a.id = l.account_id WHERE l.deal_id = $1`,
        [sale],
      )).rows[0];
      assert.deepEqual(books, { income: "2000000.00", expenses: "600000.00", held: "1000000.00", balance: "0.00" });

      const buyerMoney = await ok("GET", `/api/finance/people/${buyer.id}`);
      assert.deepEqual(buyerMoney.totals, [
        { currency: "IQD", commission_recorded: "2000000.00", commission_collected: "1500000.00", commission_outstanding: "500000.00", owed_to_office: "500000.00", client_funds_held: "0.00" },
      ]);
      assert.deepEqual(
        buyerMoney.commissions.map((row: { code: string; deal_code: string; outstanding: string }) => [row.code, row.deal_code, row.outstanding]),
        [[commission.code, "D-0001", "500000.00"]],
      );
      const sellerMoney = await ok("GET", `/api/finance/people/${seller.id}`);
      assert.equal(sellerMoney.totals[0].client_funds_held, "1750000.00");
      assert.deepEqual((await ok("GET", `/api/finance/people/${stranger}`)).totals, []);
      assert.equal((await call("GET", "/api/finance/deals/999999")).statusCode, 404);
      assert.equal((await call("GET", "/api/finance/people/abc")).statusCode, 400);
    });

    await t.test("a deal is not lost or cancelled while it earns or holds money", async () => {
      const url = `/api/deals/${sale}/stage`;
      await refused(url, { stage: "cancelled", reason: "تراجع البائع" }, 409, "DEAL_STAGE_REFUSED", new RegExp(`العمولة ${commission.code}؛ ألغها`));
      await refused(url, { stage: "lost", lost_reason: "تراجع البائع" }, 409, "DEAL_STAGE_REFUSED", /ألغها/);
      await ok("POST", `/api/vouchers/${collected.id}/void`, { void_date: "2026-10-20", reason: "أُعيدت العمولة" });
      await ok("POST", `/api/commissions/${commission.id}/cancel`, { cancel_date: "2026-10-20", reason: "تراجع البائع" });
      await refused(url, { stage: "cancelled", reason: "تراجع البائع" }, 409, "DEAL_STAGE_REFUSED", /أمانات محتفظ بها \(1000000.00 دينار\)/);
      await ok("POST", "/api/vouchers", voucher({ kind: "payment", amount: "1000000", held_for_person_id: seller.id, description: "إرجاع باقي العربون" }));
      const cancelled = await ok("POST", url, { stage: "cancelled", reason: "تراجع البائع" });
      assert.equal(cancelled.stage, "cancelled");
      const after = (await ok("GET", `/api/finance/deals/${sale}`)).totals[0];
      assert.deepEqual(
        [after.commission_recorded, after.client_funds_held, after.receivable, after.income, after.expenses, after.net],
        ["0.00", "0.00", "0.00", "0.00", "100000.00", "-100000.00"],
        "the cancelled commission's accrual was reversed; the fee paid stays a cost",
      );
      // Winning does not ask: the rent deal holds rent and still closes as won.
      assert.equal((await ok("POST", `/api/deals/${rent}/stage`, { stage: "won" })).stage, "won");
    });

    await t.test("an older voucher's funds are its payer's; who they are held for never changes", async () => {
      const own = await ok("POST", "/api/vouchers", voucher({ amount: "300", person_id: stranger, deal_id: null, description: "أمانة" }));
      assert.equal(own.held_for_person_id, stranger, "without a deal the payer's own");
      await ok("POST", "/api/vouchers", voucher({ kind: "payment", amount: "100", person_id: stranger, deal_id: null, description: "تسليم" }));
      // As written before 0013: no one named, the line booked to the payer.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('dalaly.ledger_restore', 'on', true)");
        await client.query("UPDATE vouchers SET held_for_person_id = NULL WHERE id = $1", [own.id]);
        await client.query("COMMIT");
      } finally {
        client.release();
      }
      await refused(`/api/vouchers/${own.id}/void`, { reason: "خطأ" }, 409, "VOUCHER_CLIENT_FUNDS", /والباقي منها 200.00/);
      assert.equal(await sqlState("UPDATE vouchers SET held_for_person_id = NULL WHERE held_for_person_id IS NOT NULL"), "DL001");
      assert.equal(await sqlState("UPDATE vouchers SET held_for_person_id = $1 WHERE purpose = 'commission'", [seller.id]), "DL001");
      const owner = Number((await pool.query("INSERT INTO people(code, full_name, phone_primary) VALUES('P-W', 'مالك آخر', '07700000005') RETURNING id")).rows[0].id);
      const walkIn = await ok("POST", "/api/vouchers", voucher({ amount: "50", person_id: null, deal_id: null, party_name: "مستأجر", held_for_person_id: owner, description: "أمانة لحساب مالك" }));
      assert.equal(walkIn.held_for_name, "مالك آخر");
      assert.equal(await sqlState("DELETE FROM people WHERE id = $1", [owner]), "DL001", "whose funds are held is not deleted");
    });

    await t.test("reading a deal's or customer's money needs vouchers.read", async () => {
      const dealsOnly = await userWith("deals_reader", ["deals.read", "people.read"]);
      assert.equal((await call("GET", `/api/finance/deals/${sale}`, undefined, dealsOnly)).statusCode, 403);
      assert.equal((await call("GET", `/api/finance/people/${buyer.id}`, undefined, dealsOnly)).statusCode, 403);
      const cashier = await userWith("cashier_f", ["vouchers.read"]);
      assert.equal((await call("GET", `/api/finance/deals/${sale}`, undefined, cashier)).statusCode, 200);
    });

    await t.test("restores keep whose funds are held", async () => {
      const heldFor = async () => (await pool.query("SELECT held_for_person_id FROM vouchers WHERE id = $1", [deposit.id])).rows[0].held_for_person_id;
      const archive = path.join(ctx.root, "finance.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      assert.equal((await restoreBackup(archive, "crm", ctx.adminId)).ok, true);
      assert.equal(Number(await heldFor()), seller.id, "a customers restore keeps the link");
      assert.equal((await restoreBackup(archive, "full", ctx.adminId)).ok, true);
      ctx.token = (await login("removal_admin", "1234"))!.token;
      assert.equal(Number(await heldFor()), seller.id);
      assert.equal(await held(seller.id), "750000.00", "the rent on the won deal");
    });
  } finally {
    await ctx.close();
  }
});
