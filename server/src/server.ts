import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { config } from "./infrastructure/config.js";
import {
  getDatabaseStartupState,
  tableExists,
  validateDatabaseConnection
} from "./infrastructure/database/health.js";
import { registerAuthHook } from "./modules/auth/auth.hooks.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { permissionsRoutes } from "./modules/permissions/permissions.routes.js";
import { propertiesRoutes } from "./modules/properties/properties.routes.js";
import { remoteAccessRoutes } from "./modules/remote-access/remote-access.routes.js";
import { rolesRoutes } from "./modules/roles/roles.routes.js";
import { statsRoutes } from "./modules/stats/stats.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  app.get("/api/health", async () => {
    const dbConnected = await validateDatabaseConnection();
    const usersTableExists = dbConnected ? await tableExists("users") : false;
    const startupState = getDatabaseStartupState();

    return {
      ok: true,
      api_running: true,
      app_version: config.appVersion,
      db_connected: dbConnected,
      migrations_ok: dbConnected && usersTableExists && startupState.migrationsOk,
      users_table_exists: usersTableExists
    };
  });

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
  await app.register(usersRoutes, { prefix: "/api/users" });
  await app.register(rolesRoutes, { prefix: "/api/roles" });
  await app.register(permissionsRoutes, { prefix: "/api/permissions" });
  await app.register(statsRoutes, { prefix: "/api/stats" });
  await app.register(remoteAccessRoutes, { prefix: "/api/remote-access" });

  return app;
}
