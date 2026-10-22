import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { sql } from "drizzle-orm";
import { db } from "../src/infrastructure/database/db.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// db wraps the hot-swappable pool in a Proxy; Drizzle must still recognize it
// as a pool, or every statement of a "transaction" goes to any free connection.
test("db.transaction keeps all its statements on one connection and transaction", async () => {
  const ctx = await removalTestContext("transactions");
  try {
    const rows = (result: unknown) => (result as { rows: Record<string, unknown>[] }).rows;
    const runs = await Promise.all(
      Array.from({ length: 12 }, () =>
        db.transaction(async (tx) => {
          const first = rows(await tx.execute(sql`select pg_backend_pid() as pid, txid_current() as xid`))[0];
          await tx.execute(sql`select pg_sleep(0.05)`);
          const second = rows(await tx.execute(sql`select pg_backend_pid() as pid, txid_current() as xid`))[0];
          return { first, second };
        }),
      ),
    );
    for (const { first, second } of runs) assert.deepEqual(second, first);
    assert.equal(new Set(runs.map((run) => run.first.xid)).size, 12, "each call is its own transaction");

    const leftOpen = rows(
      await db.execute(sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and state = 'idle in transaction'`),
    )[0];
    assert.equal(leftOpen.n, 0, "no connection is left inside an open transaction");
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
