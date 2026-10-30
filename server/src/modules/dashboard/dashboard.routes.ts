import { type FastifyPluginAsync, type FastifyRequest } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { getDashboard } from "./dashboard.repository.js";
import {
  businessAlerts,
  businessSummary,
  type BusinessAccess,
} from "./dashboard.business.repository.js";
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

/** The business summary's sections, each by its domain's read permission. */
function businessAccess(request: FastifyRequest): BusinessAccess {
  const keys = granted(request);
  return {
    tasks: keys.has("followups.read") || keys.has("rentals.followups.read"),
    deals: keys.has("deals.read"),
    people: keys.has("people.read"),
    requests: keys.has("requests.read"),
    leases: keys.has("leases.read"),
    money: keys.has("reports.financial"),
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
  /** Tasks, deals, customers, leases and money needing attention. */
  app.get("/business", async (request) =>
    businessSummary(request.user!, businessAccess(request)),
  );
  /** The notification center: counts of the same, without records. */
  app.get("/alerts", async (request) =>
    businessAlerts(request.user!, businessAccess(request)),
  );
  app.get("/matching", async (request) =>
    getOperationsMatching(
      operationsAccess(request),
      matchingQuerySchema.parse(request.query),
    ),
  );
};
