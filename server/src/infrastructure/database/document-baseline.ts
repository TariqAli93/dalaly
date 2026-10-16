import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Pool } from "pg";

// An existing installation can still carry the pre-consolidation Drizzle
// history. Adopt the consolidated baseline only after every original column
// and its PostgreSQL type have been verified. No user table/data is rewritten.
export async function adoptDocumentBaseline(pool: Pool, folder: string) {
  const journal = JSON.parse(
    await fs.readFile(path.join(folder, "meta/_journal.json"), "utf8"),
  );
  const baseline = journal.entries[0];
  if (baseline?.tag !== "0000_fresh_felicia_hardy") return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(192821)");
    const relation = await client.query(
      "SELECT to_regclass('drizzle.__drizzle_migrations') AS relation",
    );
    if (!relation.rows[0].relation) {
      await client.query("COMMIT");
      return;
    }
    const latest = await client.query(
      "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    );
    if (!latest.rows[0] || Number(latest.rows[0].created_at) >= baseline.when) {
      await client.query("COMMIT");
      return;
    }
    const snapshot = JSON.parse(
      await fs.readFile(path.join(folder, "meta/0000_snapshot.json"), "utf8"),
    );
    const current = await client.query(
      "SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema='public'",
    );
    const columns = new Map(
      current.rows.map((row) => [
        `${row.table_name}.${row.column_name}`,
        row.udt_name,
      ]),
    );
    const types: Record<string, string> = {
      bigserial: "int8",
      bigint: "int8",
      serial: "int4",
      integer: "int4",
      boolean: "bool",
      text: "text",
      jsonb: "jsonb",
      date: "date",
      "timestamp with time zone": "timestamptz",
    };
    for (const table of Object.values(snapshot.tables) as Array<{
      name: string;
      columns: Record<string, { name: string; type: string }>;
    }>) {
      for (const column of Object.values(table.columns)) {
        const expected = column.type.startsWith("numeric")
          ? "numeric"
          : (types[column.type] ?? column.type);
        if (columns.get(`${table.name}.${column.name}`) !== expected)
          throw new Error(
            `تعذر ترحيل سجل قاعدة قديمة بأمان: العمود ${table.name}.${column.name} لا يطابق المخطط الحالي. استعد سجل المهاجرات الأصلي قبل التحديث.`,
          );
      }
    }
    const source = await fs.readFile(
      path.join(folder, `${baseline.tag}.sql`),
      "utf8",
    );
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
      [createHash("sha256").update(source).digest("hex"), baseline.when],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
