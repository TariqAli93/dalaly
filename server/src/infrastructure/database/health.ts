import { config } from "../config.js";
import { isDatabaseConfigured, pool } from "./pool.js";

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

export type SetupStatus = {
  api_running: true;
  app_version: string;
  db_configured: boolean;
  db_connected: boolean;
  database_exists: boolean;
  migrations_ok: boolean;
  users_table_exists: boolean;
  admin_exists: boolean;
};

/**
 * الحالة الموحّدة المستخدمة من /api/health و /api/setup/status.
 * تُستورد adminExists ديناميكياً لتفادي دورة استيراد مع auth.service.
 */
export async function getSetupStatus(): Promise<SetupStatus> {
  const base: SetupStatus = {
    api_running: true,
    app_version: config.appVersion,
    db_configured: isDatabaseConfigured(),
    db_connected: false,
    database_exists: false,
    migrations_ok: false,
    users_table_exists: false,
    admin_exists: false,
  };

  const dbConnected = await validateDatabaseConnection();
  if (!dbConnected) {
    return base;
  }

  base.db_connected = true;
  base.database_exists = true;

  const usersTableExists = await tableExists("users");
  base.users_table_exists = usersTableExists;
  base.migrations_ok = usersTableExists && startupState.migrationsOk;

  if (usersTableExists) {
    const { adminExists } = await import("../../modules/auth/auth.service.js");
    base.admin_exists = await adminExists();
  }

  return base;
}
