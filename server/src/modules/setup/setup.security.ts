import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../infrastructure/config.js";

/**
 * Whether the request comes from this machine. The optional Cloudflare tunnel
 * connects from 127.0.0.1, so a request it forwards looks local by address
 * alone; its forwarding headers give it away.
 */
export function isLocalRequest(request: FastifyRequest) {
  const forwarded = Boolean(
    request.headers["cf-connecting-ip"] || request.headers["x-forwarded-for"],
  );
  return (
    !forwarded && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip)
  );
}

/**
 * For routes that read or write a path on this machine's disk (backup folder,
 * export target, a backup file to restore): the path comes from a native
 * dialog of the desktop app, so a remote caller has no business naming one.
 */
export async function requireLocalRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!isLocalRequest(request))
    return reply
      .code(403)
      .send({ message: "هذه العملية متاحة من الجهاز المحلي فقط." });
}

export async function requireLocalSetup(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const local = isLocalRequest(request);
  const origin = request.headers.origin;
  const trustedDesktop =
    Boolean(config.internalToken) &&
    request.headers["x-dalaly-internal-token"] === config.internalToken;
  const trustedOrigin =
    !origin || (origin !== "null" && config.corsOrigins.includes(origin));
  if (!local || (!trustedDesktop && !trustedOrigin)) {
    return reply
      .code(403)
      .send({ message: "الإعداد متاح من التطبيق المحلي فقط." });
  }
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    return reply.code(415).send({ message: "تنسيق طلب الإعداد غير صالح." });
  }
}
