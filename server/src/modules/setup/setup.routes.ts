import { type FastifyPluginAsync } from "fastify";
import { getSetupStatus } from "../../infrastructure/database/health.js";
import { initializeSchema, testPostgresSchema } from "./setup.schema.js";
import {
  initializeSystem,
  recoverSystem,
  SetupError,
  testPostgresConnection,
} from "./setup.service.js";
import { requireLocalSetup } from "./setup.security.js";

export const setupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status", async () => getSetupStatus());

  app.post(
    "/test-postgres",
    { preHandler: requireLocalSetup },
    async (request, reply) => {
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
              : "تعذر الاتصال بقاعدة البيانات.",
        });
      }
    },
  );

  app.post(
    "/recover",
    { preHandler: requireLocalSetup },
    async (_request, reply) => {
      try {
        return await recoverSystem();
      } catch (error) {
        return reply
          .code(error instanceof SetupError ? error.statusCode : 400)
          .send({
            message:
              error instanceof Error ? error.message : "تعذر استرداد التهيئة.",
          });
      }
    },
  );

  app.post(
    "/initialize",
    { preHandler: requireLocalSetup },
    async (request, reply) => {
      const payload = initializeSchema.parse(request.body);
      try {
        const result = await initializeSystem(payload);
        return result;
      } catch (error) {
        return reply
          .code(error instanceof SetupError ? error.statusCode : 400)
          .send({
            ok: false,
            message:
              error instanceof Error
                ? `تعذر تهيئة النظام: ${error.message}`
                : "تعذر تهيئة النظام.",
          });
      }
    },
  );
};
