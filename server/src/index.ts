import { buildServer } from "./server.js";
import { config } from "./infrastructure/config.js";
import { prepareDatabase } from "./infrastructure/database/startup.js";

const app = await buildServer();

try {
  await app.listen({ host: config.apiHost, port: config.apiPort });
  app.log.info(`API listening on http://${config.apiHost}:${config.apiPort}`);
  // Health and setup remain available while database preparation is running.
  void prepareDatabase();
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
