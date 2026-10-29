import { type FastifyPluginAsync, type FastifyReply } from "fastify";
import { getSetupStatus } from "../../infrastructure/database/health.js";
import { createFirstAdmin } from "../setup/setup.service.js";
import { requireLocalSetup } from "../setup/setup.security.js";
import { requirePermission } from "./auth.hooks.js";
import {
  changePin,
  cleanupExpiredSessions,
  login,
  logout,
} from "./auth.service.js";
import {
  changePinSchema,
  loginSchema,
  setupAdminSchema,
} from "./auth.schema.js";
import {
  lockedOutMessage,
  loginThrottle,
  oneAtATime,
} from "./login-throttle.js";

function sendLockedOut(reply: FastifyReply, retryAfterMs: number) {
  return reply
    .code(429)
    .header("Retry-After", String(Math.ceil(retryAfterMs / 1000)))
    .send({
      code: "TOO_MANY_ATTEMPTS",
      message: lockedOutMessage(retryAfterMs),
    });
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/setup-status", async () => getSetupStatus());

  app.post(
    "/setup-admin",
    { preHandler: requireLocalSetup },
    async (request, reply) => {
      const payload = setupAdminSchema.parse(request.body);
      const user = await createFirstAdmin(payload.username, payload.pin);
      return reply.code(201).send({ user });
    },
  );

  app.post("/login", async (request, reply) => {
    const payload = loginSchema.parse(request.body);
    const throttleKey = `login:${payload.username}`;
    // محاولات الحساب الواحد واحدة بعد أخرى: لو فُحص القفل لمحاولات متزامنة
    // قبل تسجيل أول فشل لتجاوزت دفعةٌ متوازية حد المحاولات الخمس.
    return oneAtATime(throttleKey, async () => {
      const retryAfterMs = loginThrottle.retryAfterMs(throttleKey);
      if (retryAfterMs > 0) return sendLockedOut(reply, retryAfterMs);

      await cleanupExpiredSessions();
      const result = await login(payload.username, payload.pin);

      if (!result) {
        loginThrottle.recordFailure(throttleKey);
        return reply
          .code(401)
          .send({ message: "اسم المستخدم أو الرمز السري غير صحيح." });
      }

      loginThrottle.recordSuccess(throttleKey);
      return result;
    });
  });

  app.post("/logout", async (request) => {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token) {
      await logout(token);
    }
    return { ok: true };
  });

  app.post(
    "/change-pin",
    { preHandler: requirePermission("security.change_pin") },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ message: "يجب تسجيل الدخول أولاً." });
      }

      const payload = changePinSchema.parse(request.body);
      const throttleKey = `change-pin:${request.user.id}`;
      const userId = request.user.id;
      return oneAtATime(throttleKey, async () => {
        const retryAfterMs = loginThrottle.retryAfterMs(throttleKey);
        if (retryAfterMs > 0) return sendLockedOut(reply, retryAfterMs);

        const result = await changePin(
          userId,
          payload.current_pin,
          payload.new_pin,
        );

        if (result.ok) loginThrottle.recordSuccess(throttleKey);
        else if (result.reason === "invalid_pin")
          loginThrottle.recordFailure(throttleKey);

        if (!result.ok) {
          const message =
            result.reason === "invalid_pin"
              ? "الرمز السري الحالي غير صحيح."
              : "تعذر تغيير الرمز.";
          return reply.code(400).send({ message });
        }

        return { ok: true };
      });
    },
  );

  app.get("/me", async (request) => {
    if (!request.user) {
      return { user: null, roles: [], permissions: [], media_token: null };
    }

    return {
      user: {
        id: request.user.id,
        username: request.user.username,
        display_name: request.user.displayName,
        is_active: request.user.isActive,
      },
      roles: request.user.roles,
      permissions: request.user.permissions,
      media_token: request.user.mediaToken,
    };
  });
};
