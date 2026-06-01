import { type FastifyPluginAsync } from "fastify";
import { getSummaryStats } from "./stats.repository.js";

export const statsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/summary", async () => getSummaryStats());
};
