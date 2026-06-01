import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  disableRemoteAccess,
  enableRemoteAccess,
  getRemoteStatus
} from "./remote-access.service.js";

export const remoteAccessRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status", { preHandler: requirePermission("settings.read") }, async () => getRemoteStatus());
  app.post("/enable", { preHandler: requirePermission("settings.update") }, async () => enableRemoteAccess());
  app.post("/disable", { preHandler: requirePermission("settings.update") }, async () => disableRemoteAccess());
};
