import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerAuthHook } from "./modules/auth/auth.hooks.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { propertiesRoutes } from "./modules/properties/properties.routes.js";
import { remoteAccessRoutes } from "./modules/remote-access/remote-access.routes.js";
import { statsRoutes } from "./modules/stats/stats.routes.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        message: "بيانات الطلب غير صحيحة.",
        issues: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      message: "حدث خطأ أثناء تنفيذ العملية.",
    });
  });

  registerAuthHook(app);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(propertiesRoutes, { prefix: "/api/properties" });
  await app.register(statsRoutes, { prefix: "/api/stats" });
  await app.register(remoteAccessRoutes, { prefix: "/api/remote-access" });

  return app;
}
