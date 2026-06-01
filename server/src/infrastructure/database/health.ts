import { pool } from "./pool.js";

type DatabaseStartupState = {
  migrationsOk: boolean;
  migrationsFolder: string | null;
  lastMigrationError: string | null;
};

const startupState: DatabaseStartupState = {
  migrationsOk: false,
  migrationsFolder: null,
  lastMigrationError: null
};

export async function validateDatabaseConnection() {
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}

export async function tableExists(tableName: string) {
  const result = await pool.query(
    `
    select exists (
      select from information_schema.tables
      where table_schema = 'public'
      and table_name = $1
    ) as exists
    `,
    [tableName]
  );

  return Boolean(result.rows[0]?.exists);
}

export function markMigrationsSucceeded(migrationsFolder: string) {
  startupState.migrationsOk = true;
  startupState.migrationsFolder = migrationsFolder;
  startupState.lastMigrationError = null;
}

export function markMigrationsFailed(error: unknown, migrationsFolder: string | null) {
  startupState.migrationsOk = false;
  startupState.migrationsFolder = migrationsFolder;
  startupState.lastMigrationError = error instanceof Error ? error.message : String(error);
}

export function getDatabaseStartupState() {
  return { ...startupState };
}
