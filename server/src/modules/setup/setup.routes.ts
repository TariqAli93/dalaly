import { type FastifyPluginAsync } from "fastify";
import { getSetupStatus } from "../../infrastructure/database/health.js";
import { initializeSchema, testPostgresSchema } from "./setup.schema.js";
import {
  initializeSystem,
  recoverSystem,
  testPostgresConnection,
} from "./setup.service.js";
import { requireLocalSetup } from "./setup.security.js";

export const setupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status", async () => getSetupStatus());

  app.post(
    "/test-postgres",
    { preHandler: requireLocalSetup },
    async (request) => {
      const payload = testPostgresSchema.parse(request.body);
      return testPostgresConnection(payload);
    },
  );

  app.post("/recover", { preHandler: requireLocalSetup }, async () =>
    recoverSystem(),
  );

  app.post(
    "/initialize",
    { preHandler: requireLocalSetup },
    async (request) => {
      const payload = initializeSchema.parse(request.body);
      return initializeSystem(payload);
    },
  );
};
