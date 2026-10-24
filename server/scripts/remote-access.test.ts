import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { config } from "../src/infrastructure/config.js";
import { pool } from "../src/infrastructure/database/pool.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { seedSystemRbac } from "../src/modules/rbac/rbac.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Starting the tunnel opens the office to the internet, so it has its own
// permission instead of riding on settings.update.
test("only remote_access.manage starts or stops the tunnel", async (t) => {
  const ctx = await removalTestContext("remote");
  // With no cloudflared at this path, enable answers with its Arabic
  // "not found" status instead of spawning a tunnel.
  const cloudflaredPath = config.cloudflaredPath;
  config.cloudflaredPath = path.join(ctx.root, "missing", "cloudflared.exe");
  try {
    assert.equal(fs.existsSync(config.cloudflaredPath), false);
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
    const call = (method: "GET" | "POST", action: string, token: string) =>
      ctx.app.inject({ method, url: `/api/remote-access/${action}`, headers: { authorization: `Bearer ${token}` } });

    const settingsEditor = await userWith("settings_editor", ["settings.read", "settings.update"]);
    const remoteManager = await userWith("remote_manager", ["remote_access.manage"]);

    await t.test("settings.update alone can no longer enable or disable it", async () => {
      for (const action of ["enable", "disable"]) {
        const response = await call("POST", action, settingsEditor);
        assert.equal(response.statusCode, 403, action);
        assert.equal(response.json().code, "FORBIDDEN");
      }
      assert.equal((await call("GET", "status", settingsEditor)).statusCode, 200, "status stays on settings.read");
    });

    await t.test("remote_access.manage can", async () => {
      const enabled = await call("POST", "enable", remoteManager);
      assert.equal(enabled.statusCode, 200);
      assert.deepEqual(enabled.json(), {
        running: false,
        url: null,
        message: "cloudflared.exe غير موجود. الاتصال الخارجي غير متاح.",
      });
      const disabled = await call("POST", "disable", remoteManager);
      assert.equal(disabled.statusCode, 200);
      assert.equal(disabled.json().message, "تم إيقاف الاتصال الخارجي.");
    });

    await t.test("Super Admin has it, also on a database seeded before it existed", async () => {
      assert.equal((await call("POST", "enable", ctx.token)).statusCode, 200);
      const holders = async () =>
        (
          await pool.query(
            `SELECT r.name FROM roles r
             JOIN role_permissions rp ON rp.role_id = r.id
             JOIN permissions p ON p.id = rp.permission_id
             WHERE p.key = 'remote_access.manage' AND r.is_system
             ORDER BY r.name`,
          )
        ).rows.map((row) => row.name);
      assert.deepEqual(await holders(), ["Super Admin"], "no other system role");

      // An install from before this permission: startup's seed adds it to Super Admin.
      await pool.query("DELETE FROM permissions WHERE key = 'remote_access.manage'");
      assert.equal((await call("POST", "enable", ctx.token)).statusCode, 403);
      await seedSystemRbac();
      assert.deepEqual(await holders(), ["Super Admin"]);
      assert.equal((await call("POST", "enable", ctx.token)).statusCode, 200);
    });
  } finally {
    config.cloudflaredPath = cloudflaredPath;
    await ctx.close();
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});
