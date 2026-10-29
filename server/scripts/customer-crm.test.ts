import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { phoneKey } from "../src/modules/people/people.repository.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Customers: duplicate warnings by phone and national ID, and an audit trail
// of every change (Phase 2b).

test("phone numbers compare by their last ten digits", () => {
  for (const value of ["07701234567", "+964 770 123 4567", "00964-770-123-4567", "770 1234567"])
    assert.equal(phoneKey(value), "7701234567", value);
  assert.equal(phoneKey("1234"), null, "too short to compare");
  assert.equal(phoneKey(null), null);
});

test("customers: duplicates are flagged, never merged, and every change is audited", async (t) => {
  const ctx = await removalTestContext("customercrm");
  try {
    const call = (method: "GET" | "POST" | "PUT" | "PATCH", url: string, body?: unknown) =>
      ctx.app.inject({
        method,
        url,
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
        headers: {
          authorization: `Bearer ${ctx.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
      });
    const ok = async (method: "GET" | "POST" | "PUT" | "PATCH", url: string, body?: unknown) => {
      const result = await call(method, url, body);
      assert.ok(result.statusCode < 300, `${method} ${url}: ${result.statusCode} ${result.body}`);
      return result.json();
    };
    const [owner] = ctx.people; // phone 07700000001, national id 1111111111
    const duplicates = async (query: string) =>
      (await ok("GET", `/api/people/duplicates?${query}`)) as Array<{ id: number; matched_on: string[] }>;

    await t.test("the same number in another format, or the same ID, is found", async () => {
      const byPhone = await duplicates(`phone=${encodeURIComponent("+964 770 000 0001")}`);
      assert.deepEqual(byPhone.map((row) => [row.id, row.matched_on]), [[owner.id, ["phone"]]]);
      const byId = await duplicates("national_id=%201111111111%20");
      assert.deepEqual(byId.map((row) => [row.id, row.matched_on]), [[owner.id, ["national_id"]]]);
      const both = await duplicates("phone=07700000001&national_id=1111111111");
      assert.deepEqual(both[0].matched_on, ["phone", "national_id"]);
      assert.deepEqual(await duplicates(`phone=07700000001&exclude_id=${owner.id}`), [], "the customer being edited is left out");
      assert.deepEqual(await duplicates("phone=123"), [], "a short number matches nothing");
      assert.deepEqual(await duplicates(""), []);
    });

    await t.test("a second phone matches too, and archived customers are still reported", async () => {
      const other = await ok("POST", "/api/people", { full_name: "زبون برقم ثان", phone_primary: "07811111111", phone_secondary: "0790 222 3333" });
      await ok("PATCH", `/api/people/${other.id}/archive`);
      const found = await duplicates("phone=07902223333");
      assert.deepEqual(found.map((row) => row.id), [other.id]);
    });

    await t.test("creating, editing, archiving and restoring a customer are in its audit", async () => {
      const person = await ok("POST", "/api/people", { full_name: "زبون مدقق", phone_primary: "07733333333" });
      await ok("PUT", `/api/people/${person.id}`, { full_name: "زبون مدقق", phone_primary: "07733333334" });
      await ok("PATCH", `/api/people/${person.id}/archive`);
      await ok("PATCH", `/api/people/${person.id}/restore`);
      const audit = (await ok("GET", `/api/people/${person.id}/audit`)) as Array<{
        action: string;
        user_name: string;
        old_value: { phone_primary?: string } | null;
        new_value: { phone_primary?: string } | null;
      }>;
      assert.deepEqual(audit.map((row) => row.action).reverse(), ["created", "updated", "archived", "restored"]);
      const edit = audit.find((row) => row.action === "updated")!;
      assert.equal(edit.old_value?.phone_primary, "07733333333");
      assert.equal(edit.new_value?.phone_primary, "07733333334");
      assert.ok(audit.every((row) => row.user_name === "removal_admin"));
      const stored = await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE entity_type = 'person' AND entity_id = $1", [person.id]);
      assert.equal(stored.rows[0].n, 4);
    });

    await t.test("roles, source and the assigned employee are saved, filtered and kept by older clients", async () => {
      const person = await ok("POST", "/api/people", {
        full_name: "زبون مستثمر",
        roles: ["buyer", "investor", "buyer"],
        source: "referral",
        assigned_user_id: ctx.adminId,
      });
      assert.deepEqual(person.roles, ["buyer", "investor"], "duplicates dropped");
      assert.equal(person.source, "referral");
      assert.equal(person.assigned_user_name, "removal_admin");
      // An older form sends none of the new fields: they stay.
      const edited = await ok("PUT", `/api/people/${person.id}`, { full_name: "زبون مستثمر كبير" });
      assert.deepEqual([edited.roles, edited.source, edited.assigned_user_id], [["buyer", "investor"], "referral", ctx.adminId]);
      const cleared = await ok("PUT", `/api/people/${person.id}`, { full_name: "زبون مستثمر كبير", roles: [], source: null, assigned_user_id: null });
      assert.deepEqual([cleared.roles, cleared.source, cleared.assigned_user_id], [[], null, null]);
      await ok("PUT", `/api/people/${person.id}`, { full_name: "زبون مستثمر كبير", roles: ["investor"], assigned_user_id: ctx.adminId });

      const page = async (query: string) =>
        ((await ok("GET", `/api/people/paged?page=1&page_size=50&${query}`)).items as Array<{ id: number }>).map((row) => row.id);
      assert.deepEqual(await page("role=investor"), [person.id]);
      assert.deepEqual(await page("assigned=me"), [person.id]);
      assert.ok(!(await page("assigned=unassigned")).includes(person.id));
      assert.ok((await page(`assigned=${ctx.adminId}`)).includes(person.id));

      assert.equal((await call("POST", "/api/people", { full_name: "x", roles: ["king"] })).statusCode, 400);
      assert.equal((await call("POST", "/api/people", { full_name: "x", source: "tv" })).statusCode, 400);
      const missing = await call("POST", "/api/people", { full_name: "x", assigned_user_id: 987654 });
      assert.equal(missing.statusCode, 400);
      assert.equal(missing.json().message, "الموظف المكلَّف غير موجود أو غير نشط.");
    });

    await t.test("a customer's record shows the roles their records imply", async () => {
      // The fixture's first person owns its listing and rental.
      const detail = await ok("GET", `/api/people/${owner.id}`);
      assert.deepEqual(detail.implied_roles, ["owner"]);
      await ok("POST", "/api/purchase-requests", { person_id: owner.id, property_type: "بيت" });
      await ok("POST", "/api/rental-requests", { person_id: owner.id, property_type: "house", rent_period: "monthly" });
      assert.deepEqual((await ok("GET", `/api/people/${owner.id}`)).implied_roles, ["buyer", "owner", "tenant"]);
    });

    await t.test("the audit needs audit.read", async () => {
      const role = (await pool.query("INSERT INTO roles(name) VALUES('people_only') RETURNING id")).rows[0];
      await pool.query("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = 'people.read'", [role.id]);
      const { hashPin } = await import("../src/modules/auth/crypto.js");
      const { login } = await import("../src/modules/auth/auth.service.js");
      const user = (await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES('people_only','p',$1) RETURNING id", [await hashPin("5678")])).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      const token = (await login("people_only", "5678"))!.token;
      const result = await ctx.app.inject({ url: `/api/people/${owner.id}/audit`, headers: { authorization: `Bearer ${token}` } });
      assert.equal(result.statusCode, 403);
    });
  } finally {
    await ctx.close();
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});
