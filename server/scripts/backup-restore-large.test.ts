import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { exportBackup, restoreBackup } from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// A single multi-row INSERT of ~50 property columns exceeds PostgreSQL's 65535
// bind parameters above ~1300 rows, so restore must insert in chunks.
test("a full restore succeeds with more rows than one INSERT can bind", async () => {
  const ctx = await removalTestContext("large");
  try {
    await pool.query(`INSERT INTO properties(code,name,property_type,legal_type,area_value,area_unit,pricing_method,total_price,owner_name,owner_phone,governorate,address_details)
      SELECT 'BULK-' || g, 'عقار ' || g, 'بيت', 'طابو ملك صرف', 200, 'متر', 'total', 1000000 + g, 'مالك', '07700000000', 'بغداد', 'الكرادة'
      FROM generate_series(1, 3000) AS g`);
    const before = await pool.query("SELECT count(*)::int AS rows, sum(total_price)::text AS total FROM properties");

    const output = path.join(ctx.root, "backups", "large.zip");
    assert.equal((await exportBackup(output, ctx.adminId)).ok, true);
    await pool.query("DELETE FROM properties WHERE code LIKE 'BULK-%'");

    const restored = await restoreBackup(await fs.readFile(output), "full", ctx.adminId);
    assert.equal(restored.ok, true);
    const after = await pool.query("SELECT count(*)::int AS rows, sum(total_price)::text AS total FROM properties");
    assert.deepEqual(after.rows[0], before.rows[0]);
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
