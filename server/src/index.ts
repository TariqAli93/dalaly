import { buildServer } from "./server.js";
import { config } from "./infrastructure/config.js";
import { prepareDatabase } from "./infrastructure/database/startup.js";
import {
  stopLeftoverTunnel,
  stopRemoteAccess,
} from "./modules/remote-access/remote-access.service.js";

// The tunnel is a child process; on Windows it would outlive the API.
process.on("exit", stopRemoteAccess);
for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"] as const)
  process.on(signal, () => process.exit(0));

const app = await buildServer();

try {
  await app.listen({ host: config.apiHost, port: config.apiPort });
  app.log.info(`API listening on http://${config.apiHost}:${config.apiPort}`);
  if (stopLeftoverTunnel())
    app.log.warn("stopped a remote-access tunnel left by a previous run");
  // Health and setup remain available while database preparation is running.
  void prepareDatabase();
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
