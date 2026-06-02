import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { getDashboard } from "./dashboard.repository.js";

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/summary", { preHandler: requirePermission("properties.read") }, async () =>
    getDashboard()
  );
};
