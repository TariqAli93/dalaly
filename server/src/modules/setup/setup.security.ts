import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../infrastructure/config.js";

export async function requireLocalSetup(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // The optional Cloudflare tunnel connects from 127.0.0.1, so a request it
  // forwards looks local by address alone; its forwarding headers give it away.
  const forwarded = Boolean(
    request.headers["cf-connecting-ip"] || request.headers["x-forwarded-for"],
  );
  const local =
    !forwarded && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip);
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
