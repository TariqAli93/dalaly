import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { config } from "./infrastructure/config.js";
import { DuplicatePlotError, DocumentError } from "./shared/errors.js";
import { getSetupStatus } from "./infrastructure/database/health.js";
import { registerAuthHook } from "./modules/auth/auth.hooks.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { backupRoutes } from "./modules/backup/backup.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { peopleRoutes } from "./modules/people/people.routes.js";
import { rentalRequestsRoutes } from "./modules/rental-requests/rental-requests.routes.js";
import { purchaseRequestsRoutes } from "./modules/purchase-requests/purchase-requests.routes.js";
import { matchingRoutes } from "./modules/matching/matching.routes.js";
import { documentsRoutes } from "./modules/documents/documents.routes.js";
import { companySettingsRoutes } from "./modules/company-settings/company-settings.routes.js";
import { favoritesRoutes } from "./modules/favorites/favorites.routes.js";
import { followupsRoutes } from "./modules/followups/followups.routes.js";
import { imagesRoutes } from "./modules/images/images.routes.js";
import { importRoutes } from "./modules/import/import.routes.js";
import { locationsRoutes } from "./modules/locations/locations.routes.js";
import { permissionsRoutes } from "./modules/permissions/permissions.routes.js";
import { propertiesRoutes } from "./modules/properties/properties.routes.js";
import { rentalsRoutes } from "./modules/rentals/rentals.routes.js";
import { rentalImagesRoutes } from "./modules/rental-images/rental-images.routes.js";
import { rentalFollowupsRoutes } from "./modules/rental-followups/rental-followups.routes.js";
import { rentalFavoritesRoutes } from "./modules/rental-favorites/rental-favorites.routes.js";
import { remoteAccessRoutes } from "./modules/remote-access/remote-access.routes.js";
import { rolesRoutes } from "./modules/roles/roles.routes.js";
import { setupRoutes } from "./modules/setup/setup.routes.js";
import { statsRoutes } from "./modules/stats/stats.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";

function localizedValidationMessage(issue: ZodError["issues"][number]) {
  if (issue.code === "invalid_type") return "نوع القيمة المدخلة غير صحيح.";
  if (issue.code === "too_small")
    return "القيمة المدخلة أقصر أو أصغر من الحد المطلوب.";
  if (issue.code === "too_big") return "القيمة المدخلة أكبر من الحد المسموح.";
  if (issue.code === "invalid_format") return "تنسيق القيمة المدخلة غير صالح.";
  return "القيمة المدخلة غير صالحة.";
}

export async function buildServer(options: { logger?: boolean } = {}) {
  // bodyLimit مرفوع لدعم رفع صور العقارات عبر base64.
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 50 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // file:// renderers have a null origin. Only an Electron-managed backend
      // (identified by its per-launch internal token) enables that origin.
      callback(
        null,
        !origin ||
          config.corsOrigins.includes(origin) ||
          (origin === "null" && Boolean(config.internalToken)),
      );
    },
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
        code: "VALIDATION_ERROR",
        messageKey: "validation.invalid",
        message: "بيانات الطلب غير صحيحة.",
        issues: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: localizedValidationMessage(issue),
        })),
      });
    }

    if (error instanceof DuplicatePlotError) {
      return reply.code(409).send({
        code: "DUPLICATE_PLOT",
        messageKey: "error.duplicatePlot",
        message: error.message,
      });
    }

    if (error instanceof DocumentError)
      return reply.code(error.statusCode).send({ message: error.message });
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23503"
    )
      return reply.code(409).send({
        message: "لا يمكن تنفيذ العملية بسبب ارتباط السجل ببيانات أخرى.",
      });
    if (
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 403
    ) {
      return reply.code(403).send({ message: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      messageKey: "error.generic",
      message: "حدث خطأ أثناء تنفيذ العملية.",
    });
  });

  registerAuthHook(app);
  await app.register(setupRoutes, { prefix: "/api/setup" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(propertiesRoutes, { prefix: "/api/properties" });
  await app.register(rentalsRoutes, { prefix: "/api/rentals" });
  await app.register(rentalImagesRoutes, { prefix: "/api/rentals" });
  await app.register(rentalFollowupsRoutes, { prefix: "/api/rentals" });
  await app.register(rentalFavoritesRoutes, {
    prefix: "/api/rental-favorites",
  });
  await app.register(imagesRoutes, { prefix: "/api/properties" });
  await app.register(followupsRoutes, { prefix: "/api/properties" });
  await app.register(usersRoutes, { prefix: "/api/users" });
  await app.register(rolesRoutes, { prefix: "/api/roles" });
  await app.register(permissionsRoutes, { prefix: "/api/permissions" });
  await app.register(statsRoutes, { prefix: "/api/stats" });
  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  await app.register(peopleRoutes, { prefix: "/api/people" });
  await app.register(rentalRequestsRoutes, { prefix: "/api/rental-requests" });
  await app.register(purchaseRequestsRoutes, {
    prefix: "/api/purchase-requests",
  });
  await app.register(matchingRoutes, { prefix: "/api/matching" });
  await app.register(documentsRoutes, { prefix: "/api/documents" });
  await app.register(companySettingsRoutes, { prefix: "/api/office" });
  await app.register(locationsRoutes, { prefix: "/api/locations" });
  await app.register(favoritesRoutes, { prefix: "/api/favorites" });
  await app.register(backupRoutes, { prefix: "/api/backup" });
  await app.register(importRoutes, { prefix: "/api/import" });
  await app.register(remoteAccessRoutes, { prefix: "/api/remote-access" });

  return app;
}
