import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { getSummaryStats } from "./stats.repository.js";

export const statsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/summary", { preHandler: requirePermission("properties.read") }, async () => getSummaryStats());
};
