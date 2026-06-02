import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth/auth.hooks.js";
import { commitImport, validateImport } from "./import.service.js";

const rowsSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).default([])
});

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/properties/validate",
    { preHandler: requirePermission("properties.create") },
    async (request) => {
      const payload = rowsSchema.parse(request.body);
      return validateImport(payload.rows);
    }
  );

  app.post(
    "/properties/commit",
    { preHandler: requirePermission("properties.create") },
    async (request) => {
      const payload = rowsSchema.parse(request.body);
      return commitImport(payload.rows, request.user?.id);
    }
  );
};
