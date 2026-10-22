// PostgreSQL helpers shared by the runtime smoke suites (runtime-smoke*.mjs).
// The admin connection comes from DB_HOST/DB_PORT/DB_USER/DB_PASSWORD (or the
// repository .env), like the other database suites. Each run creates its own
// uniquely named database through the setup wizard and drops only that one.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = fileURLToPath(new URL("../../", import.meta.url));
dotenv.config({ path: path.join(root, ".env"), quiet: true });

export const ADMIN = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD ?? "root",
};

const TEST_DATABASE = /^dalaly_[a-z0-9]+_test_\d+_\d+$/;

/** A database name no other run (or real installation) uses, e.g. dalaly_phase1_test_<pid>_<ms>. */
export function testDatabaseName(label) {
  const name = `dalaly_${label}_test_${process.pid}_${Date.now()}`;
  if (!TEST_DATABASE.test(name)) throw new Error(`Unsafe test database name: ${name}`);
  return name;
}

/** The setup-wizard connection fields for the admin account above. */
export function adminConnection(databaseName) {
  return { host: ADMIN.host, port: ADMIN.port, adminUsername: ADMIN.user, adminPassword: ADMIN.password, databaseName };
}

export async function adminQuery(sql, params) {
  const p = new pg.Pool({ ...ADMIN, database: "postgres", connectionTimeoutMillis: 4000 });
  try { return await p.query(sql, params); } finally { await p.end().catch(() => {}); }
}

/** Drops a database made by testDatabaseName; refuses any other name. */
export async function dropTestDatabase(name) {
  if (!TEST_DATABASE.test(name)) throw new Error(`Refusing to drop ${name}: not a smoke-test database`);
  try {
    await adminQuery(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } catch {
    await adminQuery("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1", [name]).catch(() => {});
    await adminQuery(`DROP DATABASE IF EXISTS "${name}"`).catch((error) => console.log(`WARN could not drop ${name}: ${error.message}`));
  }
}
