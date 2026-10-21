import { config } from "../config.js";
import pg from "pg";
import { getActivePoolConfig, isDatabaseConfigured, pool } from "./pool.js";
import { classifyStartup, type StartupState } from "./startup-state.js";
import { installationInitialized } from "./setup-marker.js";

type DatabaseStartupState = {
  migrationsOk: boolean;
  migrationsFolder: string | null;
  lastMigrationError: string | null;
};

const startupState: DatabaseStartupState = {
  migrationsOk: false,
  migrationsFolder: null,
  lastMigrationError: null,
};
let checking = false;
let retryMigrationsOnConnection = false;
let lastState: StartupState | undefined;

export function setDatabaseChecking(value: boolean) {
  checking = value;
}
export function retryMigrationsWhenConnected() {
  retryMigrationsOnConnection = true;
}

export function databaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? databaseErrorCode(error.cause) : null;
}

export async function validateDatabaseConnection() {
  try {
    const probe = { text: "select 1", query_timeout: 5000 };
    await pool.query(probe);
    return true;
  } catch {
    return false;
  }
}

export function markMigrationsSucceeded(migrationsFolder: string) {
  startupState.migrationsOk = true;
  startupState.migrationsFolder = migrationsFolder;
  startupState.lastMigrationError = null;
}

export function markMigrationsFailed(
  error: unknown,
  migrationsFolder: string | null,
) {
  startupState.migrationsOk = false;
  startupState.migrationsFolder = migrationsFolder;
  startupState.lastMigrationError =
    error instanceof Error ? error.message : String(error);
}

export type SetupStatus = {
  api_running: true;
  app_version: string;
  db_configured: boolean;
  db_connected: boolean;
  database_exists: boolean | null;
  migrations_ok: boolean;
  users_table_exists: boolean;
  admin_exists: boolean;
  startup_state: StartupState;
  startup_reason: string;
  connection_error: string | null;
  admin_setup_allowed: boolean;
};

/**
 * الحالة الموحّدة المستخدمة من /api/health و /api/setup/status.
 * يميّز قاعدة محذوفة عن فشل الاتصال ويؤكد وجود مدير فعال بصلاحية Super Admin.
 */
export async function getSetupStatus(): Promise<SetupStatus> {
  const base: SetupStatus = {
    api_running: true,
    app_version: config.appVersion,
    db_configured: isDatabaseConfigured(),
    db_connected: false,
    database_exists: isDatabaseConfigured() ? null : false,
    migrations_ok: false,
    users_table_exists: false,
    admin_exists: false,
    startup_state: "CHECKING",
    startup_reason: "CHECKING",
    connection_error: null,
    admin_setup_allowed: false,
  };

  // A fresh connection preserves PostgreSQL's error code and avoids stale pool
  // connections after a database/server has been removed or restarted.
  const client = new pg.Client(getActivePoolConfig());
  try {
    if (base.db_configured) {
      await client.connect();
      base.db_connected = true;
      base.database_exists = true;
      if (retryMigrationsOnConnection && !checking) {
        retryMigrationsOnConnection = false;
        checking = true;
        const { prepareDatabase } = await import("./startup.js");
        void prepareDatabase();
      }
      const tables = await client.query(`select
        to_regclass('public.users') is not null as users,
        to_regclass('public.roles') is not null as roles,
        to_regclass('public.user_roles') is not null as user_roles`);
      const present = tables.rows[0];
      base.users_table_exists = present.users;
      base.migrations_ok = present.users && startupState.migrationsOk;
      base.admin_setup_allowed = !(await installationInitialized(client));
      if (present.users && present.roles && present.user_roles) {
        const { SUPER_ADMIN_ROLE } =
          await import("../../modules/rbac/rbac.constants.js");
        const admins = await client.query(
          `select 1 from users u
          join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id
          where u.is_active = true and r.name = $1 limit 1`,
          [SUPER_ADMIN_ROLE],
        );
        base.admin_exists = Boolean(admins.rowCount);
      }
    }
  } catch (error) {
    base.connection_error = databaseErrorCode(error) ?? "DATABASE_CHECK_FAILED";
    // Only invalid_catalog_name establishes that the target database is absent.
    if (base.connection_error === "3D000") base.database_exists = false;
    else base.db_connected = false;
  } finally {
    await client.end().catch(() => undefined);
  }

  Object.assign(base, classifyStartup(base, checking));
  if (lastState !== base.startup_state) {
    console.info("Startup state transition", {
      from: lastState ?? "CHECKING",
      to: base.startup_state,
      reason: base.startup_reason,
    });
    lastState = base.startup_state;
  }
  return base;
}
