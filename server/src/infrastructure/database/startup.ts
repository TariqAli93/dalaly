import { isDatabaseConfigured, withStartupPool } from "./pool.js";
import {
  installationInitialized,
  markInstallationInitialized,
} from "./setup-marker.js";
import {
  getMigrationsFolder,
  runDatabaseMigrations,
} from "./run-migrations.js";
import {
  markMigrationsFailed,
  markMigrationsSucceeded,
  retryMigrationsWhenConnected,
  setDatabaseChecking,
  validateDatabaseConnection,
} from "./health.js";
import { execSync } from "node:child_process";

let preparation: Promise<void> | null = null;

export function prepareDatabase(): Promise<void> {
  if (preparation) return preparation;
  setDatabaseChecking(true);
  preparation = (async () => {
    let folder: string | null = null;
    try {
      if (!isDatabaseConfigured()) return;
      if (!(await validateDatabaseConnection())) {
        retryMigrationsWhenConnected();
        throw new Error("DATABASE_CONNECTION");
      }
      await withStartupPool(async (startupPool) => {
        if (await installationInitialized(startupPool))
          await markInstallationInitialized(startupPool);
      });
      folder = getMigrationsFolder();
      await runDatabaseMigrations(folder);
      markMigrationsSucceeded(folder);
    } catch (error) {
      markMigrationsFailed(error, folder);
      console.error("Database preparation failed", {
        migrationsFolder: folder,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDatabaseChecking(false);
    }
  })().finally(() => {
    preparation = null;
  });
  return preparation;
}
