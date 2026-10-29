import { type FastifyInstance, type FastifyRequest } from "fastify";
import {
  resolveMediaToken,
  resolveSession,
  type AuthUser,
} from "./auth.service.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

const publicPaths = new Set([
  "/api/health",
  "/api/setup/status",
  "/api/setup/test-postgres",
  "/api/setup/initialize",
  "/api/setup/recover",
  "/api/backup/internal-run",
  "/api/backup/internal-email-archive",
  "/api/auth/setup-status",
  "/api/auth/setup-admin",
  "/api/auth/login",
]);

/** مسارات الملفات التي تعرضها الواجهة في <img>: الصور ومصغّراتها والشعار. */
const MEDIA_PATHS = [
  /^\/api\/(?:properties|rentals)\/\d+\/images\/\d+\/(?:file|thumbnail)$/,
  /^\/api\/office\/logo$/,
];

function isMediaRequest(request: FastifyRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const path = request.url.split("?")[0];
  return MEDIA_PATHS.some((pattern) => pattern.test(path));
}

export function registerAuthHook(app: FastifyInstance) {
  // onRequest runs before the body is read, so an anonymous caller cannot
  // make the API buffer and parse an upload-sized body.
  app.addHook("onRequest", async (request, reply) => {
    if (
      request.method === "OPTIONS" ||
      publicPaths.has(request.url.split("?")[0])
    ) {
      return;
    }

    const header = request.headers.authorization ?? "";
    const headerToken = header.startsWith("Bearer ") ? header.slice(7) : "";
    // رمز الجلسة يأتي في الترويسة فقط. روابط الصور (<img> لا يرسل ترويسة)
    // تحمل رمز وسائط مشتقاً منها في ?media=، ولا يُقبل إلا لقراءة ملف.
    const media = (request.query as { media?: unknown } | undefined)?.media;
    const mediaToken =
      !headerToken && typeof media === "string" && isMediaRequest(request)
        ? media
        : "";

    if (!headerToken && !mediaToken) {
      return reply.code(401).send({ message: "يجب تسجيل الدخول أولاً." });
    }

    const user = headerToken
      ? await resolveSession(headerToken)
      : await resolveMediaToken(mediaToken);
    if (!user) {
      return reply
        .code(401)
        .send({ message: "انتهت الجلسة. سجل الدخول مرة أخرى." });
    }

    request.user = user;
  });
}

export function requirePermission(permission: string) {
  return async function permissionGuard(
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) {
    const hasPermission = request.user?.permissions.some(
      (item) => item.key === permission,
    );
    if (!hasPermission) {
      return reply
        .code(403)
        .send({ message: "ليست لديك صلاحية تنفيذ هذه العملية." });
    }
  };
}
