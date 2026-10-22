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

let preparation: Promise<void> | null = null;

/**
 * Resolves when the running database preparation settles (or at once when
 * none is running), but no later than `timeoutMs`. Lets /api/health?wait=1
 * answer the moment the database is ready instead of on the caller's next poll.
 */
export async function waitForDatabasePreparation(timeoutMs: number) {
  if (!preparation) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    preparation,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}

export function prepareDatabase(): Promise<void> {
  if (preparation) return preparation;
  setDatabaseChecking(true);
  preparation = (async () => {
    let folder: string | null = null;
    // Step durations land in main.log once per launch, for diagnosing slow
    // starts on office PCs.
    const started = performance.now();
    const steps: Record<string, number> = {};
    const lap = (name: string) => {
      steps[name] = Math.round(performance.now() - started);
    };
    try {
      if (!isDatabaseConfigured()) return;
      if (!(await validateDatabaseConnection())) {
        retryMigrationsWhenConnected();
        throw new Error("DATABASE_CONNECTION");
      }
      lap("connected");
      await withStartupPool(async (startupPool) => {
        if (await installationInitialized(startupPool))
          await markInstallationInitialized(startupPool);
      });
      lap("marker");
      folder = getMigrationsFolder();
      await runDatabaseMigrations(folder);
      markMigrationsSucceeded(folder);
      lap("migrated");
      console.info("Database prepared", steps);
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
