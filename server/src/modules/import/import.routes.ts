import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth/auth.hooks.js";
import { commitImport, validateImport } from "./import.service.js";
import { UPLOAD_BODY_LIMIT } from "../../shared/constants/limits.js";

const rowsSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/properties/validate",
    {
      bodyLimit: UPLOAD_BODY_LIMIT,
      preHandler: requirePermission("properties.create"),
    },
    async (request) => {
      const payload = rowsSchema.parse(request.body);
      return validateImport(payload.rows);
    },
  );

  app.post(
    "/properties/commit",
    {
      bodyLimit: UPLOAD_BODY_LIMIT,
      preHandler: requirePermission("properties.create"),
    },
    async (request) => {
      const payload = rowsSchema.parse(request.body);
      return commitImport(payload.rows, request.user?.id);
    },
  );
};
