export type StartupState = "CHECKING" | "SETUP_REQUIRED" | "READY" | "ERROR";

export type StartupHealth = {
  api_running: boolean;
  db_configured: boolean;
  db_connected: boolean;
  // null means existence could not be determined (for example, server offline).
  database_exists: boolean | null;
  migrations_ok: boolean;
  users_table_exists: boolean;
  admin_exists: boolean;
};

export function classifyStartup(health: StartupHealth, checking = false) {
  if (checking)
    return { startup_state: "CHECKING" as const, startup_reason: "CHECKING" };
  if (!health.api_running)
    return {
      startup_state: "ERROR" as const,
      startup_reason: "BACKEND_UNAVAILABLE",
    };
  if (!health.db_configured)
    return {
      startup_state: "SETUP_REQUIRED" as const,
      startup_reason: "DATABASE_NOT_CONFIGURED",
    };
  if (health.database_exists === false)
    return {
      startup_state: "SETUP_REQUIRED" as const,
      startup_reason: "DATABASE_MISSING",
    };
  if (!health.db_connected)
    return {
      startup_state: "ERROR" as const,
      startup_reason: "DATABASE_CONNECTION",
    };
  if (!health.migrations_ok)
    return {
      startup_state: "SETUP_REQUIRED" as const,
      startup_reason: "MIGRATIONS_REQUIRED",
    };
  if (!health.users_table_exists)
    return {
      startup_state: "SETUP_REQUIRED" as const,
      startup_reason: "USERS_TABLE_MISSING",
    };
  if (!health.admin_exists)
    return {
      startup_state: "SETUP_REQUIRED" as const,
      startup_reason: "ADMIN_REQUIRED",
    };
  return { startup_state: "READY" as const, startup_reason: "READY" };
}
