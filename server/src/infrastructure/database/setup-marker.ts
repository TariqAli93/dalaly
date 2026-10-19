import type pg from "pg";
import { pool } from "./pool.js";

type Queryable =
  | Pick<pg.Pool, "query">
  | Pick<pg.PoolClient, "query">
  | Pick<pg.Client, "query">;

// Kept independently of users: deleting accounts must not reopen anonymous setup.
export async function ensureSetupMarker(connection: Queryable = pool) {
  await connection.query(`create table if not exists public.dalaly_setup_state (
    id boolean primary key default true check (id),
    initialized_at timestamptz not null default now()
  )`);
}

export async function installationInitialized(connection: Queryable = pool) {
  const tables = await connection.query(`select
    to_regclass('public.dalaly_setup_state') is not null as marker,
    to_regclass('public.users') is not null as users`);
  if (tables.rows[0].marker) {
    const result = await connection.query(
      "select 1 from public.dalaly_setup_state limit 1",
    );
    if (result.rowCount) return true;
  }
  if (tables.rows[0].users) {
    const result = await connection.query("select 1 from public.users limit 1");
    if (result.rowCount) return true;
  }
  // Also protect legacy databases whose users table was lost before this marker
  // was introduced. Business records establish a previous installation.
  const assets =
    await connection.query(`select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('properties', 'rentals', 'people')`);
  for (const { table_name } of assets.rows) {
    const result = await connection.query(
      `select 1 from public."${table_name}" limit 1`,
    );
    if (result.rowCount) return true;
  }
  return false;
}

export async function markInstallationInitialized(
  connection: Queryable = pool,
) {
  await ensureSetupMarker(connection);
  await connection.query(
    "insert into public.dalaly_setup_state (id) values (true) on conflict do nothing",
  );
}
