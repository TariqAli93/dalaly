import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { DuplicatePlotError } from "./shared/errors.js";
import { getSetupStatus } from "./infrastructure/database/health.js";
import { registerAuthHook } from "./modules/auth/auth.hooks.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { backupRoutes } from "./modules/backup/backup.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { favoritesRoutes } from "./modules/favorites/favorites.routes.js";
import { followupsRoutes } from "./modules/followups/followups.routes.js";
import { imagesRoutes } from "./modules/images/images.routes.js";
import { importRoutes } from "./modules/import/import.routes.js";
import { locationsRoutes } from "./modules/locations/locations.routes.js";
import { permissionsRoutes } from "./modules/permissions/permissions.routes.js";
import { propertiesRoutes } from "./modules/properties/properties.routes.js";
import { remoteAccessRoutes } from "./modules/remote-access/remote-access.routes.js";
import { rolesRoutes } from "./modules/roles/roles.routes.js";
import { setupRoutes } from "./modules/setup/setup.routes.js";
import { statsRoutes } from "./modules/stats/stats.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";

export async function buildServer() {
  // bodyLimit مرفوع لدعم رفع صور العقارات عبر base64.
  const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

  await app.register(cors, {
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  app.get("/api/health", async () => {
    const status = await getSetupStatus();
    return { ok: true, ...status };
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

    if (error instanceof DuplicatePlotError) {
      return reply.code(409).send({ message: error.message });
    }

    app.log.error(error);
    return reply.code(500).send({
      message: "حدث خطأ أثناء تنفيذ العملية.",
    });
  });

  registerAuthHook(app);
  await app.register(setupRoutes, { prefix: "/api/setup" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(propertiesRoutes, { prefix: "/api/properties" });
  await app.register(imagesRoutes, { prefix: "/api/properties" });
  await app.register(followupsRoutes, { prefix: "/api/properties" });
  await app.register(usersRoutes, { prefix: "/api/users" });
  await app.register(rolesRoutes, { prefix: "/api/roles" });
  await app.register(permissionsRoutes, { prefix: "/api/permissions" });
  await app.register(statsRoutes, { prefix: "/api/stats" });
  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  await app.register(locationsRoutes, { prefix: "/api/locations" });
  await app.register(favoritesRoutes, { prefix: "/api/favorites" });
  await app.register(backupRoutes, { prefix: "/api/backup" });
  await app.register(importRoutes, { prefix: "/api/import" });
  await app.register(remoteAccessRoutes, { prefix: "/api/remote-access" });

  return app;
}
