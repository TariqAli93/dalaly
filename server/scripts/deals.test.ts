import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { exportBackup, restoreBackup } from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Deals: created from a listing, a customer or a request; stages move under
// rules and are recorded; offers settle the price; permissions, the pipeline,
// stalled deals and restores (Phase 3a).

type Deal = {
  id: number;
  code: string;
  stage: string;
  owner_person_id: number | null;
  asking_price: string | null;
  agreed_price: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  property_id: number | null;
  history: Array<{ from_stage: string | null; to_stage: string; reason: string | null }>;
  offers: Array<{ id: number; status: string; amount: string }>;
};

test("deals move from first interest to an outcome under their rules", async (t) => {
  const ctx = await removalTestContext("deals");
  try {
    const call = (method: "GET" | "POST" | "PUT" | "PATCH", url: string, body?: unknown, token = ctx.token) =>
      ctx.app.inject({
        method,
        url,
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
      });
    const ok = async (method: "GET" | "POST" | "PUT" | "PATCH", url: string, body?: unknown, token = ctx.token) => {
      const result = await call(method, url, body, token);
      assert.ok(result.statusCode < 300, `${method} ${url}: ${result.statusCode} ${result.body}`);
      return result.json();
    };
    const refused = async (url: string, body: unknown, status: number, message?: RegExp) => {
      const result = await call("POST", url, body);
      assert.equal(result.statusCode, status, result.body);
      if (message) assert.match(result.json().message, message);
    };
    async function userWith(username: string, keys: string[]) {
      const role = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
      await pool.query("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)", [role.id, keys]);
      const user = (await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, $2) RETURNING id", [username, await hashPin("5678")])).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      return (await login(username, "5678"))!.token;
    }
    const [seller, buyer] = ctx.people; // the fixture's property belongs to the first
    const stage = (id: number, body: unknown, token = ctx.token) => call("POST", `/api/deals/${id}/stage`, body, token);

    let deal: Deal;
    await t.test("a deal on a listing takes its owner and asking price from it", async () => {
      deal = await ok("POST", "/api/deals", { deal_type: "sale", property_id: ctx.property.id, client_person_id: buyer.id });
      assert.equal(deal.code, "D-0001");
      assert.equal(deal.stage, "new");
      assert.equal(deal.owner_person_id, seller.id);
      assert.equal(deal.asking_price, "150000000.00");
      const detail = (await ok("GET", `/api/deals/${deal.id}`)) as Deal;
      assert.deepEqual(detail.history.map((row) => [row.from_stage, row.to_stage]), [[null, "new"]]);
    });

    await t.test("links must fit the deal", async () => {
      await refused("/api/deals", { deal_type: "rent", property_id: ctx.property.id, client_person_id: buyer.id }, 400, /عرض إيجار/);
      await refused("/api/deals", { deal_type: "sale", property_id: ctx.property.id, client_person_id: seller.id }, 400, /الشخص نفسه/);
      const othersRequest = await ok("POST", "/api/purchase-requests", { person_id: seller.id, property_type: "بيت" });
      await refused("/api/deals", { deal_type: "sale", client_person_id: buyer.id, purchase_request_id: othersRequest.id }, 400, /طلبات هذا الزبون/);
      await refused("/api/deals", { deal_type: "sale", client_person_id: buyer.id, asking_price: "-5" }, 400);
      await refused("/api/deals", { deal_type: "sale", client_person_id: buyer.id, asking_price: "1.234" }, 400);
    });

    await t.test("offers settle the price, and accepting one moves the deal to agreed", async () => {
      await ok("POST", `/api/deals/${deal.id}/stage`, { stage: "negotiating" });
      const first = await ok("POST", `/api/deals/${deal.id}/offers`, { party: "client", amount: 140000000 });
      const counter = await ok("POST", `/api/deals/${deal.id}/offers`, { party: "owner", amount: "145000000.50" });
      assert.equal(first.amount, "140000000.00");
      await ok("PATCH", `/api/deals/${deal.id}/offers/${first.id}`, { status: "countered" });
      deal = await ok("PATCH", `/api/deals/${deal.id}/offers/${counter.id}`, { status: "accepted" });
      assert.equal(deal.agreed_price, "145000000.50");
      assert.equal(deal.stage, "agreed");
      assert.equal(deal.history[0].to_stage, "agreed");
      assert.match(deal.history[0].reason!, /145000000\.50/);
    });

    await t.test("contract issued needs an issued contract; won needs the agreement", async () => {
      await refused(`/api/deals/${deal.id}/stage`, { stage: "contract_issued" }, 409, /عقد صادر/);
      deal = await ok("POST", `/api/deals/${deal.id}/stage`, { stage: "won" });
      assert.equal(deal.stage, "won");
      assert.ok(deal.closed_at);
    });

    await t.test("a closed deal is reopened with a reason, then closed another way", async () => {
      await refused(`/api/deals/${deal.id}/stage`, { stage: "lost", lost_reason: "x" }, 409, /أعد فتح/);
      await refused(`/api/deals/${deal.id}/stage`, { stage: "negotiating" }, 409, /سبب إعادة فتح/);
      await refused(`/api/deals/${deal.id}/offers`, { party: "client", amount: 1 }, 409, /مغلقة/);
      deal = await ok("POST", `/api/deals/${deal.id}/stage`, { stage: "negotiating", reason: "تراجع البائع" });
      assert.equal(deal.closed_at, null);
      await refused(`/api/deals/${deal.id}/stage`, { stage: "lost" }, 409, /سبب خسارة/);
      deal = await ok("POST", `/api/deals/${deal.id}/stage`, { stage: "lost", lost_reason: "اشترى عقاراً آخر" });
      assert.equal(deal.lost_reason, "اشترى عقاراً آخر");
      assert.deepEqual(
        deal.history.map((row) => row.to_stage).reverse(),
        ["new", "negotiating", "agreed", "won", "negotiating", "lost"],
      );
      const audit = await pool.query("SELECT action FROM audit_logs WHERE entity_type = 'deal' AND entity_id = $1 ORDER BY id", [deal.id]);
      assert.deepEqual(audit.rows.map((row) => row.action), ["created", "status_changed", "price_changed", "status_changed", "status_changed", "status_changed"]);
    });

    await t.test("closing needs deals.close; reading alone changes nothing", async () => {
      const worker = await userWith("deal_worker", ["deals.read", "deals.create", "deals.update"]);
      const reader = await userWith("deal_reader", ["deals.read"]);
      const own = await ok("POST", "/api/deals", { deal_type: "sale", client_person_id: buyer.id }, worker);
      assert.equal((await stage(own.id, { stage: "contacted" }, worker)).statusCode, 200);
      assert.equal((await stage(own.id, { stage: "cancelled", reason: "x" }, worker)).statusCode, 403);
      assert.equal((await call("POST", "/api/deals", { deal_type: "sale", client_person_id: buyer.id }, reader)).statusCode, 403);
      assert.equal((await stage(own.id, { stage: "qualified" }, reader)).statusCode, 403);
      assert.equal((await call("GET", "/api/deals/paged", undefined, reader)).statusCode, 200);
    });

    await t.test("lists filter, and the pipeline adds amounts per currency exactly", async () => {
      await ok("POST", "/api/deals", { deal_type: "rent", rental_id: ctx.rental.id, client_person_id: buyer.id, currency: "USD", asking_price: "0.10", assigned_user_id: ctx.adminId });
      await ok("POST", "/api/deals", { deal_type: "rent", client_person_id: buyer.id, currency: "USD", asking_price: "0.20" });
      const page = async (query: string) => (await ok("GET", `/api/deals/paged?page=1&page_size=50&${query}`)) as { items: Deal[]; total: number };
      assert.equal((await page("state=open")).total, 3);
      assert.equal((await page("state=closed")).total, 1);
      assert.equal((await page("assigned=me")).total, 1);
      assert.equal((await page(`person_id=${seller.id}`)).total, 2, "the seller's deal and the rental's landlord deal");
      assert.equal((await page("q=D-0001")).total, 1);
      const pipeline = (await ok("GET", "/api/deals/pipeline?state=open")) as { stages: Array<{ stage: string; currency: string; count: number; asking_total: string }> };
      const usd = pipeline.stages.find((row) => row.stage === "new" && row.currency === "USD")!;
      assert.deepEqual([usd.count, usd.asking_total], [2, "0.30"]);
    });

    await t.test("an open deal with no move and no activity for days is stalled", async () => {
      const quiet = await ok("POST", "/api/deals", { deal_type: "sale", client_person_id: buyer.id, title: "صفقة راكدة" });
      await pool.query("UPDATE deals SET stage_changed_at = now() - interval '20 days' WHERE id = $1", [quiet.id]);
      const stalled = async () => ((await ok("GET", "/api/deals/paged?stalled_days=14&page_size=50")).items as Deal[]).map((row) => row.id);
      assert.deepEqual(await stalled(), [quiet.id]);
      await ok("POST", "/api/activities", { person_id: buyer.id, deal_id: quiet.id, type: "phone_call", notes: "اتصال" });
      assert.deepEqual(await stalled(), []);
      const outsider = await call("POST", "/api/activities", { person_id: ctx.people[0].id, deal_id: quiet.id, type: "phone_call" });
      assert.equal(outsider.statusCode, 400, "an activity on a deal belongs to one of its parties");
      const detail = await ok("GET", `/api/deals/${quiet.id}`);
      assert.equal(detail.activities.length, 1);
    });

    await t.test("restores keep a deal's links and never fail on a listing deleted since", async () => {
      const archive = path.join(ctx.root, "deals.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      await restoreBackup(archive, "properties", ctx.adminId);
      const kept = (await pool.query("SELECT property_id FROM deals WHERE id = $1", [deal.id])).rows[0];
      assert.equal(Number(kept.property_id), ctx.property.id, "a listings restore keeps the deal on its listing");
      const extra = (await pool.query(
        "INSERT INTO properties(code,property_type,legal_type,area_value,area_unit,pricing_method,total_price,owner_name,owner_phone) VALUES('DL-X','بيت','طابو',100,'متر','total',1,'م','0770') RETURNING id",
      )).rows[0].id;
      const onExtra = await ok("POST", "/api/deals", { deal_type: "sale", property_id: extra, client_person_id: buyer.id });
      const archive2 = path.join(ctx.root, "deals2.zip");
      assert.equal((await exportBackup(archive2, ctx.adminId)).ok, true);
      await pool.query("DELETE FROM properties WHERE id = $1", [extra]);
      await restoreBackup(archive2, "crm", ctx.adminId);
      const restored = (await pool.query("SELECT property_id FROM deals WHERE id = $1", [onExtra.id])).rows[0];
      assert.equal(restored.property_id, null, "the deleted listing's link is cleared, not a failed restore");
      assert.equal(Number((await pool.query("SELECT count(*) FROM deals")).rows[0].count), 6);
    });
  } finally {
    await ctx.close();
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});
