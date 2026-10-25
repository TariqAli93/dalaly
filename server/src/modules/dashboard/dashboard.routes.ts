import { type FastifyPluginAsync, type FastifyRequest } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { getDashboard } from "./dashboard.repository.js";
import {
  getOperationsMatching,
  getOperationsOverview,
  type OperationsAccess,
} from "./dashboard.operations.repository.js";
import {
  matchingQuerySchema,
  overviewQuerySchema,
} from "./dashboard.schema.js";

function granted(request: FastifyRequest) {
  return new Set(request.user?.permissions.map((permission) => permission.key));
}

/**
 * The operational sections need only a signed-in user; each section follows
 * its domain's read permission and is null without it.
 */
function operationsAccess(request: FastifyRequest): OperationsAccess {
  const keys = granted(request);
  return {
    properties: keys.has("properties.read"),
    rentals: keys.has("rentals.read"),
    requests: keys.has("requests.read"),
    followups: keys.has("followups.read"),
    rentalFollowups: keys.has("rentals.followups.read"),
  };
}

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/summary",
    { preHandler: requirePermission("properties.read") },
    async (request) => {
      const keys = granted(request);
      return getDashboard({
        rentals: keys.has("rentals.read"),
        audit: keys.has("audit.read"),
        followups: keys.has("followups.read"),
      });
    },
  );
  app.get("/overview", async (request) =>
    getOperationsOverview(
      operationsAccess(request),
      overviewQuerySchema.parse(request.query),
    ),
  );
  app.get("/matching", async (request) =>
    getOperationsMatching(
      operationsAccess(request),
      matchingQuerySchema.parse(request.query),
    ),
  );
};
