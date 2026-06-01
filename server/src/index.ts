import { buildServer } from "./server.js";
import { config } from "./infrastructure/config.js";
import { runDatabaseMigrations } from "./infrastructure/database/run-migrations.js";

await runDatabaseMigrations();
const app = await buildServer();

try {
  await app.listen({ host: config.apiHost, port: config.apiPort });
  app.log.info(`API listening on http://${config.apiHost}:${config.apiPort}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
