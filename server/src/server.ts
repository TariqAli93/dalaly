import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import { ZodError } from "zod";
import { config } from "./infrastructure/config.js";
import { DomainError, errorCodeForStatus } from "./shared/errors.js";
import { DEFAULT_BODY_LIMIT } from "./shared/constants/limits.js";
import { serializeError } from "./shared/utils/log-errors.js";
import {
  isPoolTimeout,
  postgresError,
} from "./shared/utils/postgres-errors.js";
import { getSetupStatus } from "./infrastructure/database/health.js";
import { waitForDatabasePreparation } from "./infrastructure/database/startup.js";
import { registerAuthHook } from "./modules/auth/auth.hooks.js";
import { accountingRoutes } from "./modules/accounting/accounting.routes.js";
import { activitiesRoutes } from "./modules/activities/activities.routes.js";
import { agreementsRoutes } from "./modules/agreements/agreements.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { backupRoutes } from "./modules/backup/backup.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { dealsRoutes } from "./modules/deals/deals.routes.js";
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
import { tasksRoutes } from "./modules/tasks/tasks.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";

function localizedValidationMessage(issue: ZodError["issues"][number]) {
  if (issue.code === "invalid_type") return "نوع القيمة المدخلة غير صحيح.";
  if (issue.code === "too_small")
    return "القيمة المدخلة أقصر أو أصغر من الحد المطلوب.";
  if (issue.code === "too_big") return "القيمة المدخلة أكبر من الحد المسموح.";
  if (issue.code === "invalid_format") return "تنسيق القيمة المدخلة غير صالح.";
  // A schema's own refinement already words its message in Arabic.
  if (issue.code === "custom" && /[\u0600-\u06ff]/.test(issue.message))
    return issue.message;
  return "القيمة المدخلة غير صالحة.";
}

/** Arabic messages for Fastify's own client errors (bad JSON, size, type). */
const clientErrorMessages: Record<number, string> = {
  413: "حجم البيانات المرسلة أكبر من المسموح.",
  415: "نوع المحتوى المرسل غير مدعوم.",
};

/** Requests slower than this are logged even when they succeed. */
const SLOW_REQUEST_MS = 1000;

export async function buildServer(options: { logger?: boolean } = {}) {
  const logger: FastifyServerOptions["logger"] = options.logger !== false && {
    level: process.env.LOG_LEVEL?.trim() || "info",
    serializers: {
      // Image URLs carry a media token in the query string, and production logs
      // end up in electron-log's file.
      req: (request) => ({
        method: request.method,
        url: request.url.split("?")[0],
      }),
      err: serializeError,
    },
  };
  const app = Fastify({
    logger,
    // Per-request lines are written synchronously by electron-log in the
    // main process; only slow or failed requests are logged (onResponse).
    disableRequestLogging: true,
    // Upload routes raise this per route (UPLOAD_BODY_LIMIT).
    bodyLimit: DEFAULT_BODY_LIMIT,
  });

  app.addHook("onResponse", async (request, reply) => {
    const ms = Math.round(reply.elapsedTime);
    if (reply.statusCode < 500 && ms < SLOW_REQUEST_MS) return;
    request.log.warn(
      {
        method: request.method,
        route: request.routeOptions.url ?? request.url.split("?")[0],
        status: reply.statusCode,
        ms,
      },
      reply.statusCode >= 500 ? "request failed" : "slow request",
    );
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

  app.get("/api/health", async (request) => {
    // Electron's startup check sends ?wait=1 once it sees CHECKING, so it
    // learns READY as soon as the database is prepared (capped below its
    // 6 s request timeout) instead of on its next poll.
    if ((request.query as { wait?: string }).wait === "1")
      await waitForDatabasePreparation(4000);
    const status = await getSetupStatus();
    return { ok: true, ...status };
  });

  // Every error response has one shape: { code, message } with an Arabic
  // message, plus `issues` for validation errors. Routes that answer
  // reply.code(404).send({ message }) get their status's code here.
  app.addHook("preSerialization", async (_request, reply, payload) => {
    if (
      reply.statusCode < 400 ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      "code" in payload
    )
      return payload;
    return { code: errorCodeForStatus(reply.statusCode), ...payload };
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ message: "المسار المطلوب غير موجود." }),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        message: "بيانات الطلب غير صحيحة.",
        issues: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: localizedValidationMessage(issue),
        })),
      });
    }

    if (error instanceof DomainError)
      return reply
        .code(error.statusCode)
        .send({ code: error.code, message: error.message });

    // Drizzle wraps PostgreSQL errors, so read the SQLSTATE through `cause`.
    const sqlState = postgresError(error)?.code;
    if (sqlState === "23503")
      return reply.code(409).send({
        code: "RECORD_IN_USE",
        message: "لا يمكن تنفيذ العملية بسبب ارتباط السجل ببيانات أخرى.",
      });
    if (sqlState === "23505")
      return reply.code(409).send({
        code: "DUPLICATE_VALUE",
        message: "القيمة مستخدمة مسبقاً في سجل آخر.",
      });
    // A statement ran past the statement timeout (or was cancelled), or no
    // connection was free in time: worth retrying, not a fault in the request.
    if (sqlState === "57014") {
      request.log.warn({ err: error }, "statement cancelled");
      return reply.code(503).send({
        code: "QUERY_TIMEOUT",
        message:
          "استغرقت العملية وقتاً أطول من المسموح فأُوقفت. أعد المحاولة بعد قليل.",
      });
    }
    if (isPoolTimeout(error)) {
      request.log.warn({ err: error }, "no database connection in time");
      return reply.code(503).send({
        code: "DATABASE_BUSY",
        message: "قاعدة البيانات مشغولة حالياً. أعد المحاولة بعد قليل.",
      });
    }

    // Fastify's own client errors (malformed JSON, body too large, wrong
    // content type) keep their status. Their messages are English, and only
    // a DomainError's message is meant for the user.
    const statusCode =
      error instanceof Error && "statusCode" in error
        ? Number(error.statusCode)
        : 0;
    if (statusCode >= 400 && statusCode < 500)
      return reply.code(statusCode).send({
        message: clientErrorMessages[statusCode] ?? "بيانات الطلب غير صالحة.",
      });

    request.log.error({ err: error }, "unhandled error");
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
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
  await app.register(activitiesRoutes, { prefix: "/api/activities" });
  await app.register(tasksRoutes, { prefix: "/api/tasks" });
  await app.register(dealsRoutes, { prefix: "/api/deals" });
  await app.register(accountingRoutes, { prefix: "/api/accounting" });
  await app.register(rentalRequestsRoutes, { prefix: "/api/rental-requests" });
  await app.register(purchaseRequestsRoutes, {
    prefix: "/api/purchase-requests",
  });
  await app.register(matchingRoutes, { prefix: "/api/matching" });
  await app.register(documentsRoutes, { prefix: "/api/documents" });
  await app.register(agreementsRoutes, { prefix: "/api/agreements" });
  await app.register(companySettingsRoutes, { prefix: "/api/office" });
  await app.register(locationsRoutes, { prefix: "/api/locations" });
  await app.register(favoritesRoutes, { prefix: "/api/favorites" });
  await app.register(backupRoutes, { prefix: "/api/backup" });
  await app.register(importRoutes, { prefix: "/api/import" });
  await app.register(remoteAccessRoutes, { prefix: "/api/remote-access" });

  return app;
}
