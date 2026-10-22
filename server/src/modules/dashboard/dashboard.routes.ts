import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { getDashboard } from "./dashboard.repository.js";

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/summary",
    { preHandler: requirePermission("properties.read") },
    async (request) => {
      const granted = new Set(
        request.user?.permissions.map((permission) => permission.key),
      );
      return getDashboard({
        rentals: granted.has("rentals.read"),
        audit: granted.has("audit.read"),
        followups: granted.has("followups.read"),
      });
    },
  );
};
