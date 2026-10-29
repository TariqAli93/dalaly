import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Routes that name a path on this machine refuse requests forwarded by the
// remote-access tunnel, and system permissions and role names cannot be
// changed through the API (Phase 1c).

test("tunneled requests cannot name server paths, and system RBAC stays as seeded", async (t) => {
  const ctx = await removalTestContext("hardening");
  try {
    const send = (
      method: "GET" | "POST" | "PUT" | "DELETE",
      url: string,
      body?: unknown,
      tunneled = false,
    ) =>
      ctx.app.inject({
        method,
        url,
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
        headers: {
          authorization: `Bearer ${ctx.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          // What cloudflared adds to every request it forwards.
          ...(tunneled ? { "cf-connecting-ip": "203.0.113.7" } : {}),
        },
      });

    await t.test("backup folder, export target and restore-from-path are local only", async () => {
      const target = path.join(ctx.root, "exported.zip");
      for (const [method, url, body] of [
        ["PUT", "/api/backup/dir", { dir: ctx.root }],
        ["POST", "/api/backup/export", { outputPath: target }],
        ["POST", "/api/backup/restore", { scope: "full", file_path: target }],
      ] as const) {
        const result = await send(method, url, body, true);
        assert.equal(result.statusCode, 403, `${url}: ${result.body}`);
        assert.equal(result.json().message, "هذه العملية متاحة من الجهاز المحلي فقط.");
      }
      assert.equal(fs.existsSync(target), false, "nothing was written");
      const local = await send("POST", "/api/backup/export", { outputPath: target });
      assert.equal(local.statusCode, 200, local.body);
      assert.equal(fs.existsSync(target), true, "the desktop app itself still exports");
    });

    await t.test("a backup download id is checked", async () => {
      assert.equal((await send("GET", "/api/backup/download/abc")).statusCode, 400);
    });

    await t.test("system permissions cannot be renamed or deleted; custom ones can", async () => {
      const usersRead = Number(
        (await pool.query("SELECT id FROM permissions WHERE key = 'users.read'")).rows[0].id,
      );
      const renamed = await send("PUT", `/api/permissions/${usersRead}`, { key: "users.anything", name: "x", module: "users" });
      assert.equal(renamed.statusCode, 400, renamed.body);
      assert.equal((await send("DELETE", `/api/permissions/${usersRead}`)).statusCode, 400);
      assert.equal(
        (await pool.query("SELECT key FROM permissions WHERE id = $1", [usersRead])).rows[0].key,
        "users.read",
      );

      const created = await send("POST", "/api/permissions", { key: "office.custom", name: "مخصص", module: "office" });
      assert.equal(created.statusCode, 201, created.body);
      const custom = created.json() as { id: number };
      const taken = await send("PUT", `/api/permissions/${custom.id}`, { key: "users.read", name: "x", module: "users" });
      assert.equal(taken.statusCode, 400, "a custom permission cannot take a system key");
      const edited = await send("PUT", `/api/permissions/${custom.id}`, { key: "office.custom2", name: "مخصص ٢", module: "office" });
      assert.equal(edited.statusCode, 200, edited.body);
      assert.equal((await send("DELETE", `/api/permissions/${custom.id}`)).statusCode, 200);
    });

    await t.test("Super Admin keeps its name; its description can change", async () => {
      const superAdmin = Number((await pool.query("SELECT id FROM roles WHERE name = 'Super Admin'")).rows[0].id);
      const renamed = await send("PUT", `/api/roles/${superAdmin}`, { name: "Owner" });
      assert.equal(renamed.statusCode, 400, renamed.body);
      const described = await send("PUT", `/api/roles/${superAdmin}`, { name: "Super Admin", description: "مدير النظام" });
      assert.equal(described.statusCode, 200, described.body);
      const role = (await pool.query("SELECT name, description FROM roles WHERE id = $1", [superAdmin])).rows[0];
      assert.deepEqual(role, { name: "Super Admin", description: "مدير النظام" });

      const custom = (await send("POST", "/api/roles", { name: "موظف استقبال" })).json() as { id: number };
      assert.equal((await send("PUT", `/api/roles/${custom.id}`, { name: "موظف" })).statusCode, 200, "custom roles can be renamed");
    });
  } finally {
    await ctx.close();
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});
