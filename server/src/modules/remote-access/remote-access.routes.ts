import { type FastifyPluginAsync } from "fastify";
import {
  disableRemoteAccess,
  enableRemoteAccess,
  getRemoteStatus
} from "./remote-access.service.js";

export const remoteAccessRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status", async () => getRemoteStatus());
  app.post("/enable", async () => enableRemoteAccess());
  app.post("/disable", async () => disableRemoteAccess());
};
