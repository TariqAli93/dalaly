import { type FastifyInstance } from "fastify";
import { resolveSession, type AuthUser } from "./auth.service.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

const publicPaths = new Set([
  "/api/health",
  "/api/auth/setup-status",
  "/api/auth/setup-admin",
  "/api/auth/login"
]);

export function registerAuthHook(app: FastifyInstance) {
  app.addHook("preHandler", async (request, reply) => {
    if (request.method === "OPTIONS" || publicPaths.has(request.url.split("?")[0])) {
      return;
    }

    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return reply.code(401).send({ message: "يجب تسجيل الدخول أولاً." });
    }

    const user = await resolveSession(token);
    if (!user) {
      return reply.code(401).send({ message: "انتهت الجلسة. سجل الدخول مرة أخرى." });
    }

    request.user = user;
  });
}
