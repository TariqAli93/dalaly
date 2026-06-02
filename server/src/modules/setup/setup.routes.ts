import { type FastifyPluginAsync } from "fastify";
import { getSetupStatus } from "../../infrastructure/database/health.js";
import { initializeSchema, testPostgresSchema } from "./setup.schema.js";
import { initializeSystem, testPostgresConnection } from "./setup.service.js";

export const setupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status", async () => getSetupStatus());

  app.post("/test-postgres", async (request, reply) => {
    const payload = testPostgresSchema.parse(request.body);
    try {
      const result = await testPostgresConnection(payload);
      return result;
    } catch (error) {
      return reply.code(400).send({
        ok: false,
        message:
          error instanceof Error
            ? `تعذر الاتصال بـ PostgreSQL: ${error.message}`
            : "تعذر الاتصال بـ PostgreSQL.",
      });
    }
  });

  app.post("/initialize", async (request, reply) => {
    const payload = initializeSchema.parse(request.body);
    try {
      const result = await initializeSystem(payload);
      return result;
    } catch (error) {
      return reply.code(400).send({
        ok: false,
        message:
          error instanceof Error
            ? `تعذر تهيئة النظام: ${error.message}`
            : "تعذر تهيئة النظام.",
      });
    }
  });
};
