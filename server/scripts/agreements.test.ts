import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { createBackup, restoreBackup } from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Contracts end to end through the API: drafts saved against a revision
// number, issuing only when complete, issued revisions that never change,
// amendments, cancellation, the four fixed templates and their history,
// permissions, and a backup round trip with the contract tables.
test("contracts and their templates", async (t) => {
  const ctx = await removalTestContext("agreements");
  const send = async (method: string, url: string, body?: unknown, token = ctx.token) => {
    const response = await ctx.app.inject({
      method: method as "GET",
      url: `/api${url}`,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    });
    return { status: response.statusCode, body: response.body ? response.json() : null };
  };
  const [seller, buyer] = ctx.people;
  try {
    await t.test("exactly four templates exist and none can be added", async () => {
      const list = await send("GET", "/agreements/templates");
      assert.equal(list.status, 200);
      assert.deepEqual(
        list.body.map((item: { key: string }) => item.key),
        ["sale", "installment_sale", "residential_rent", "commercial_rent"],
      );
      assert.equal((await send("POST", "/agreements/templates", { key: "x" })).status, 404);
      assert.equal((await send("GET", "/agreements/templates/lease")).status, 404);
      await assert.rejects(
        pool.query("INSERT INTO agreement_templates(template_key) VALUES('lease')"),
        /agreement_templates_key/,
      );
    });

    let id = 0;
    let rev = 0;
    await t.test("a draft saves against its revision number", async () => {
      const created = await send("POST", "/agreements", { template_key: "sale" });
      assert.equal(created.status, 201);
      assert.match(created.body.code, /^CT-\d{4}$/);
      assert.equal(created.body.status, "draft");
      id = created.body.id;
      rev = created.body.draft_rev;
      const saved = await send("PUT", `/agreements/${id}`, {
        base_rev: rev,
        parties: [
          { role: "seller", person_id: seller.id },
          { role: "buyer", person_id: buyer.id },
        ],
        property_id: ctx.property.id,
        terms: { ...created.body.terms, contract_place: "بغداد", sale_price: 150_000_000, delivery_date: "2026-12-01" },
      });
      assert.equal(saved.status, 200);
      assert.equal(saved.body.draft_rev, rev + 1);
      // A second window still holding the old revision is refused.
      const stale = await send("PUT", `/agreements/${id}`, { base_rev: rev, terms: created.body.terms });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.code, "DRAFT_CONFLICT");
      rev = saved.body.draft_rev;
    });

    await t.test("drafts refuse parties and listings of the wrong kind", async () => {
      const wrongRole = await send("PUT", `/agreements/${id}`, { base_rev: rev, parties: [{ role: "tenant", person_id: buyer.id }] });
      assert.equal(wrongRole.status, 400);
      const samePerson = await send("PUT", `/agreements/${id}`, {
        base_rev: rev,
        parties: [{ role: "seller", person_id: seller.id }, { role: "buyer", person_id: seller.id }],
      });
      assert.equal(samePerson.status, 400);
      const rental = await send("PUT", `/agreements/${id}`, { base_rev: rev, rental_id: ctx.rental.id });
      assert.equal(rental.status, 400);
      const badDocument = await send("PUT", `/agreements/${id}`, { base_rev: rev, document: { schema: 1, blocks: [] } });
      assert.equal(badDocument.status, 400);
    });

    await t.test("issuing waits for every shown field", async () => {
      await pool.query("INSERT INTO office_profiles(id, company_name, phone_primary) VALUES(1, 'مكتب الاختبار', '07700000009') ON CONFLICT (id) DO UPDATE SET company_name = EXCLUDED.company_name");
      // The fixture listing has no plot or district number.
      const blocked = await send("POST", `/agreements/${id}/issue`, { base_rev: rev });
      assert.equal(blocked.status, 422);
      assert.equal(blocked.body.code, "AGREEMENT_INCOMPLETE");
      assert.ok(blocked.body.issues.some((issue: { field: string }) => issue.field === "property.plot"));
      await pool.query("UPDATE properties SET plot_number='415', subdistrict_number='15', subdistrict_name='الداودي' WHERE id=$1", [ctx.property.id]);
      const issued = await send("POST", `/agreements/${id}/issue`, { base_rev: rev });
      assert.equal(issued.status, 200, JSON.stringify(issued.body));
      assert.equal(issued.body.status, "issued");
      assert.equal(issued.body.current_revision, 1);
      rev = issued.body.draft_rev;
    });

    await t.test("an issued revision keeps the data it was issued with", async () => {
      await pool.query("UPDATE people SET full_name='اسم جديد' WHERE id=$1", [buyer.id]);
      await pool.query("UPDATE office_profiles SET company_name='اسم مكتب جديد'");
      const revision = await send("GET", `/agreements/${id}/revisions/1`);
      assert.equal(revision.body.values["buyer.full_name"], "سارة الاختبار");
      const record = await send("GET", `/agreements/${id}`);
      assert.equal(record.body.context.parties.buyer.full_name, "سارة الاختبار");
      assert.equal((await send("PUT", `/agreements/${id}`, { base_rev: rev, terms: record.body.terms })).status, 409);
      assert.equal((await send("DELETE", `/agreements/${id}`)).status, 409);
      assert.equal((await send("POST", `/agreements/${id}/issue`, { base_rev: rev })).status, 409);
      const docx = await send("GET", `/agreements/${id}/docx?revision=1`);
      assert.equal(docx.status, 200);
      assert.ok(Buffer.from(docx.body.data, "base64").subarray(0, 2).equals(Buffer.from("PK")));
      const recorded = await send("POST", `/agreements/${id}/exports`, { format: "pdf", revision: 1, file_name: "عقد.pdf" });
      assert.equal(recorded.status, 201);
    });

    await t.test("a correction is a new revision; the first stays as issued", async () => {
      const amended = await send("POST", `/agreements/${id}/amend`, { reason: "تصحيح الاسم" });
      assert.equal(amended.body.status, "draft");
      assert.equal(amended.body.context.parties.buyer.full_name, "اسم جديد", "a draft reads live data");
      const reissued = await send("POST", `/agreements/${id}/issue`, { base_rev: amended.body.draft_rev });
      assert.equal(reissued.body.current_revision, 2);
      const first = await send("GET", `/agreements/${id}/revisions/1`);
      const second = await send("GET", `/agreements/${id}/revisions/2`);
      assert.equal(first.body.values["buyer.full_name"], "سارة الاختبار");
      assert.equal(second.body.values["buyer.full_name"], "اسم جديد");
      assert.equal(second.body.reason, "تصحيح الاسم");
      const cancelled = await send("POST", `/agreements/${id}/cancel`, { reason: "اتفاق الطرفين" });
      assert.equal(cancelled.body.status, "cancelled");
      assert.equal((await send("POST", `/agreements/${id}/cancel`, { reason: "مرة ثانية" })).status, 409);
      const audit = await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE entity_type='agreement' AND entity_id=$1 AND action='status_changed'", [id]);
      assert.ok(audit.rows[0].n >= 4);
    });

    await t.test("drafts duplicate, list and delete; never-issued drafts only", async () => {
      const copy = await send("POST", `/agreements/${id}/duplicate`);
      assert.equal(copy.status, 201);
      assert.equal(copy.body.status, "draft");
      assert.equal(copy.body.parties.length, 2);
      const page = await send("GET", `/agreements/paged?q=${encodeURIComponent("اسم جديد")}&sort_by=contract_date&sort_order=asc`);
      assert.equal(page.status, 200);
      assert.equal(page.body.total, 2);
      const byStatus = await send("GET", "/agreements/paged?status=cancelled");
      assert.equal(byStatus.body.total, 1);
      assert.equal((await send("DELETE", `/agreements/${copy.body.id}`)).status, 204);
    });

    await t.test("template versions, resets and restores never touch contracts", async () => {
      const template = (await send("GET", "/agreements/templates/sale")).body;
      const definition = structuredClone(template.definition);
      definition.clauses[0].title = [{ type: "text", text: "تمهيد معدّل" }];
      const saved = await send("PUT", "/agreements/templates/sale", { base_version: template.version, definition });
      assert.equal(saved.body.version, template.version + 1);
      assert.equal(saved.body.is_customized, true);
      const contract = await send("POST", "/agreements", { template_key: "sale" });
      assert.equal(contract.body.document.clauses[0].title[0].text, "تمهيد معدّل");
      const stale = await send("POST", "/agreements/templates/sale/reset", { mode: "all", base_version: template.version });
      assert.equal(stale.status, 409);
      const reset = await send("POST", "/agreements/templates/sale/reset", { mode: "all", base_version: saved.body.version });
      assert.equal(reset.body.is_customized, false);
      const after = await send("GET", `/agreements/${contract.body.id}`);
      assert.equal(after.body.document.clauses[0].title[0].text, "تمهيد معدّل", "a contract keeps its copy");
      const versions = (await send("GET", "/agreements/templates/sale/versions")).body;
      assert.ok(versions.length >= 3);
      const restored = await send("POST", `/agreements/templates/sale/versions/${saved.body.version}/restore`, { base_version: reset.body.version });
      assert.equal(restored.body.definition.clauses[0].title[0].text, "تمهيد معدّل");
    });

    await t.test("permissions guard reading, editing, issuing and templates", async () => {
      const role = (await pool.query("INSERT INTO roles(name) VALUES('contracts_reader') RETURNING id")).rows[0];
      await pool.query("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = 'agreements.read'", [role.id]);
      const user = (await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES('reader', 'reader', $1) RETURNING id", [await hashPin("5678")])).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      const reader = (await login("reader", "5678"))!.token;
      assert.equal((await send("GET", "/agreements/paged", undefined, reader)).status, 200);
      assert.equal((await send("POST", "/agreements", { template_key: "sale" }, reader)).status, 403);
      assert.equal((await send("POST", `/agreements/${id}/issue`, { base_rev: 1 }, reader)).status, 403);
      assert.equal((await send("GET", `/agreements/${id}/docx`, undefined, reader)).status, 403);
      assert.equal((await send("GET", "/agreements/templates/sale/versions", undefined, reader)).status, 403);
    });

    await t.test("backups carry the contract tables and restore them", async () => {
      const backup = await createBackup("manual");
      const extra = await send("POST", "/agreements", { template_key: "commercial_rent" });
      assert.equal(extra.status, 201);
      await restoreBackup(backup.file_path, "full");
      // A full restore replaces the users, and with them the sessions.
      const token = (await login("removal_admin", "1234"))!.token;
      assert.equal((await send("GET", `/agreements/${extra.body.id}`, undefined, token)).status, 404);
      const revisions = await pool.query("SELECT count(*)::int AS n FROM agreement_revisions WHERE agreement_id=$1", [id]);
      assert.equal(revisions.rows[0].n, 2);
      assert.equal((await send("GET", "/agreements/templates", undefined, token)).body.length, 4);
    });
  } finally {
    await ctx.close();
  }
});
