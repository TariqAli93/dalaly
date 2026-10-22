import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { config } from "../src/infrastructure/config.js";
import { pool } from "../src/infrastructure/database/pool.js";
import {
  BackupBusyError,
  createBackup,
  exportBackup,
  restoreBackup,
} from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("backups leave out config.json, never overlap, and restore keeps a safety copy", async (t) => {
  const ctx = await removalTestContext("safety");
  try {
    // Electron keeps the database URL (with its password) here.
    await fs.writeFile(
      path.join(config.appDataDir, "config.json"),
      JSON.stringify({ databaseUrl: "postgres://office:secret@127.0.0.1/dalaly" }),
    );
    const exported = path.join(ctx.root, "backups", "export.zip");
    await exportBackup(exported, ctx.adminId);

    await t.test("archives do not contain config.json", async () => {
      const zip = new AdmZip(exported);
      assert.equal(zip.getEntry("config.json"), null);
      assert.ok(zip.getEntry("data.json"));
    });

    await t.test("a second operation while one runs is refused with 409", async () => {
      const results = await Promise.allSettled([createBackup("manual"), createBackup("manual")]);
      const rejected = results.filter((result) => result.status === "rejected");
      assert.equal(rejected.length, 1);
      const reason = (rejected[0] as PromiseRejectedResult).reason;
      assert.ok(reason instanceof BackupBusyError);
      assert.equal(reason.statusCode, 409);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    });

    await t.test("restore first writes a backup of the data it replaces", async () => {
      await pool.query("UPDATE properties SET name = 'قبل الاسترجاع' WHERE id = $1", [ctx.property.id]);
      const restored = await restoreBackup(await fs.readFile(exported), "full", ctx.adminId);
      assert.equal(restored.ok, true);
      const safety = new AdmZip(restored.safety_backup_path);
      const data = JSON.parse(safety.readAsText("data.json"));
      assert.equal(data.properties.find((row: { id: number }) => row.id === ctx.property.id).name, "قبل الاسترجاع");
      const current = await pool.query("SELECT name FROM properties WHERE id = $1", [ctx.property.id]);
      assert.equal(current.rows[0].name, "عقار الاختبار", "the restore itself still applied");
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
