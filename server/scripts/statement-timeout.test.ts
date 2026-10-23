import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { config } from "../src/infrastructure/config.js";
import { pool, reconfigurePool } from "../src/infrastructure/database/pool.js";
import { applyMigrations } from "../src/infrastructure/database/run-migrations.js";
import { exportBackup, restoreBackup } from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

const STATEMENT_TIMEOUT_MS = 500;
// How long a lock is kept once a statement waits for it: three timeouts.
const HOLD_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Takes a lock in a transaction of its own session. `released` resolves
 * once a statement of another session has waited HOLD_MS for the lock and
 * the transaction has committed.
 */
async function holdLock(url: string, lock: string) {
  const client = new pg.Client({ connectionString: url });
  // Watches from outside the transaction: inside it, pg_stat_activity keeps
  // the snapshot of its first read.
  const watcher = new pg.Client({ connectionString: url });
  await Promise.all([client.connect(), watcher.connect()]);
  await client.query("BEGIN");
  await client.query(lock);
  const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  const released = (async () => {
    try {
      for (let waited = 0; ; waited += 25) {
        const { rows } = await watcher.query(
          "SELECT count(*)::int AS blocked FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))",
          [pid],
        );
        if (rows[0].blocked) break;
        if (waited > 10_000) throw new Error(`nothing waited for: ${lock}`);
        await sleep(25);
      }
      await sleep(HOLD_MS);
      await client.query("COMMIT");
    } finally {
      await Promise.all([client.end(), watcher.end()]);
    }
  })();
  return { released };
}

/** Runs `operation` while `lock` is held, and how long it took. */
async function whileLocked<T>(url: string, lock: string, operation: () => Promise<T>) {
  const { released } = await holdLock(url, lock);
  const started = performance.now();
  try {
    return { result: await operation(), ms: performance.now() - started };
  } finally {
    await released;
  }
}

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("ordinary statements are cut off; backup, restore and migrations are not", async (t) => {
  const ctx = await removalTestContext("timeouts");
  const headers = { authorization: `Bearer ${ctx.token}` };
  const defaults = { pool: { ...config.pool }, statementTimeoutMillis: config.db.statementTimeoutMillis };
  try {
    // Pools created from here on cancel statements after 500 ms.
    config.db.statementTimeoutMillis = STATEMENT_TIMEOUT_MS;
    await reconfigurePool(ctx.url);
    const archive = path.join(ctx.root, "backups", "before.zip");
    await exportBackup(archive, ctx.adminId);

    await t.test("the pool cancels a statement that runs too long", async () => {
      await assert.rejects(pool.query("SELECT pg_sleep(2)"), { code: "57014" });
    });

    await t.test("a request that waits too long gets the Arabic error", async () => {
      const { result: response, ms } = await whileLocked(
        ctx.url,
        "LOCK TABLE properties IN ACCESS EXCLUSIVE MODE",
        () => ctx.app.inject({ method: "GET", url: "/api/dashboard/summary", headers }),
      );
      assert.equal(response.statusCode, 503, response.body);
      assert.deepEqual(response.json(), {
        code: "QUERY_TIMEOUT",
        message: "استغرقت العملية وقتاً أطول من المسموح فأُوقفت. أعد المحاولة بعد قليل.",
      });
      assert.ok(ms < HOLD_MS, `answered after ${Math.round(ms)} ms, while the lock was still held`);
    });

    await t.test("a backup waits as long as it has to", async () => {
      const { ms } = await whileLocked(ctx.url, "LOCK TABLE people IN ACCESS EXCLUSIVE MODE", () =>
        exportBackup(path.join(ctx.root, "backups", "waited.zip"), ctx.adminId),
      );
      assert.ok(ms >= HOLD_MS, `finished after ${Math.round(ms)} ms`);
    });

    await t.test("a restore waits as long as it has to", async () => {
      await pool.query("UPDATE rentals SET name = 'قبل الاسترجاع' WHERE id = $1", [ctx.rental.id]);
      // SHARE lets the restore's safety backup read rentals but blocks its DELETE.
      const { result, ms } = await whileLocked(ctx.url, "LOCK TABLE rentals IN SHARE MODE", async () =>
        restoreBackup(await fs.readFile(archive), "full", ctx.adminId),
      );
      assert.equal(result.ok, true);
      assert.ok(ms >= HOLD_MS, `finished after ${Math.round(ms)} ms`);
      const { rows } = await pool.query("SELECT name FROM rentals WHERE id = $1", [ctx.rental.id]);
      assert.equal(rows[0].name, "إيجار الاختبار", "the restore applied");
    });

    await t.test("migrations wait as long as they have to", async () => {
      // The migration transaction's advisory lock, as a second app instance would hold it.
      const { ms } = await whileLocked(ctx.url, "SELECT pg_advisory_xact_lock(192822)", () =>
        applyMigrations(path.resolve("drizzle")),
      );
      assert.ok(ms >= HOLD_MS, `finished after ${Math.round(ms)} ms`);
    });

    await t.test("the timeout is back on every pooled connection afterwards", async () => {
      // SET LOCAL ends with the transaction; hold all connections at once to see each one.
      const clients = await Promise.all(Array.from({ length: pool.totalCount }, () => pool.connect()));
      try {
        for (const client of clients)
          assert.equal((await client.query("SHOW statement_timeout")).rows[0].statement_timeout, "500ms");
      } finally {
        for (const client of clients) client.release();
      }
    });

    await t.test("a request that finds no free connection in time gets the Arabic error", async () => {
      Object.assign(config.pool, { max: 1, connectionTimeoutMillis: 300 });
      await reconfigurePool(ctx.url);
      const held = await pool.connect();
      try {
        const response = await ctx.app.inject({ method: "GET", url: "/api/auth/me", headers });
        assert.equal(response.statusCode, 503, response.body);
        assert.deepEqual(response.json(), {
          code: "DATABASE_BUSY",
          message: "قاعدة البيانات مشغولة حالياً. أعد المحاولة بعد قليل.",
        });
      } finally {
        held.release();
      }
    });
  } finally {
    Object.assign(config.pool, defaults.pool);
    config.db.statementTimeoutMillis = defaults.statementTimeoutMillis;
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
