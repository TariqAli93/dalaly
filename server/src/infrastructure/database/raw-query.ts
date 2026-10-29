import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { pool } from "./pool.js";

export type RawRow = Record<string, unknown>;

const dialect = new PgDialect();

/**
 * Runs a raw query on the pool itself: unlike db.execute, which keeps
 * timestamps as PostgreSQL text, it returns them as Dates (ISO in JSON).
 */
export async function rawRows(query: SQL): Promise<RawRow[]> {
  const { sql: text, params } = dialect.sqlToQuery(query);
  return (await pool.query(text, params)).rows as RawRow[];
}

/** Start of today in the office's time zone, as a timestamptz. */
export const OFFICE_TODAY = sql`(date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad')`;
