import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// The dashboard and matching endpoints return data from more than one domain,
// so each part must follow that domain's read permission.
test("dashboard and matching only return what the caller may read", async (t) => {
  const ctx = await removalTestContext("scope");
  try {
    async function userWith(username: string, permissionKeys: string[]) {
      const role = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
      await pool.query(
        "INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)",
        [role.id, permissionKeys],
      );
      const user = (
        await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, $2) RETURNING id", [
          username,
          await hashPin("5678"),
        ])
      ).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      return (await login(username, "5678"))!.token;
    }
    const get = (url: string, token: string) =>
      ctx.app.inject({ url, headers: { authorization: `Bearer ${token}` } });

    const propertiesOnly = await userWith("properties_only", ["properties.read"]);
    const requestsOnly = await userWith("requests_only", ["requests.read"]);
    const requestsAndRentals = await userWith("requests_rentals", ["requests.read", "rentals.read"]);
    const rentalRequest = (
      await pool.query("INSERT INTO rental_requests(code, person_id, property_type) VALUES('SCOPE-RQ', $1, 'بيت') RETURNING id", [
        ctx.people[0].id,
      ])
    ).rows[0];
    await pool.query(
      "INSERT INTO audit_logs(entity_type, entity_id, action, user_id) VALUES('property', $1, 'update', $2)",
      [ctx.property.id, ctx.adminId],
    );

    await t.test("dashboard hides rentals, audit activity and follow-ups without their permissions", async () => {
      const admin = (await get("/api/dashboard/summary", ctx.token)).json();
      assert.equal(admin.rentals.counts.total, 1);
      assert.equal(admin.recent_activity.length, 1);

      const limited = await get("/api/dashboard/summary", propertiesOnly);
      assert.equal(limited.statusCode, 200);
      const body = limited.json();
      assert.equal(body.counts.total, admin.counts.total, "property figures stay visible");
      assert.equal(body.rentals.counts.total, 0);
      assert.deepEqual(body.rentals.by_type, []);
      assert.deepEqual(body.recent_activity, []);
      assert.deepEqual(body.reminders, []);
    });

    await t.test("matching a rental request needs both requests.read and rentals.read", async () => {
      const url = `/api/matching/rental-requests/${rentalRequest.id}/offers`;
      assert.equal((await get(url, requestsOnly)).statusCode, 403);
      assert.equal((await get(url, requestsAndRentals)).statusCode, 200);
      assert.equal((await get(`/api/matching/rentals/${ctx.rental.id}/requests`, propertiesOnly)).statusCode, 403);
      assert.equal(
        (await get(`/api/matching/properties/${ctx.property.id}/purchase-requests`, propertiesOnly)).statusCode,
        403,
      );
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
