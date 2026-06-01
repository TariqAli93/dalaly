import { buildServer } from "./server.js";
import { config } from "./infrastructure/config.js";
import {
  getMigrationsFolder,
  runDatabaseMigrations
} from "./infrastructure/database/run-migrations.js";
import {
  markMigrationsFailed,
  markMigrationsSucceeded,
  validateDatabaseConnection
} from "./infrastructure/database/health.js";

const app = await buildServer();

try {
  const dbConnected = await validateDatabaseConnection();
  if (!dbConnected) {
    app.log.error("PostgreSQL is not connected. API will start for health/setup checks.");
    markMigrationsFailed("PostgreSQL is not connected.", null);
  } else {
    let migrationsFolder: string | null = null;
    try {
      migrationsFolder = getMigrationsFolder();
      app.log.info({ migrationsFolder }, "Running database migrations");
      await runDatabaseMigrations(migrationsFolder);
      markMigrationsSucceeded(migrationsFolder);
      app.log.info("Database migrations completed");
    } catch (error) {
      markMigrationsFailed(error, migrationsFolder);
      app.log.error(error, "Database migrations failed");
    }
  }

  await app.listen({ host: config.apiHost, port: config.apiPort });
  app.log.info(`API listening on http://${config.apiHost}:${config.apiPort}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
