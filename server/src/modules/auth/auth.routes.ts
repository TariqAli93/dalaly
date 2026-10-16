import { type FastifyPluginAsync } from "fastify";
import { getSetupStatus } from "../../infrastructure/database/health.js";
import { createFirstAdmin, SetupError } from "../setup/setup.service.js";
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

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/setup-status", async () => getSetupStatus());

  app.post(
    "/setup-admin",
    { preHandler: requireLocalSetup },
    async (request, reply) => {
      const payload = setupAdminSchema.parse(request.body);
      try {
        const user = await createFirstAdmin(payload.username, payload.pin);
        return reply.code(201).send({ user });
      } catch (error) {
        if (error instanceof SetupError)
          return reply.code(error.statusCode).send({ message: error.message });
        throw error;
      }
    },
  );

  app.post("/login", async (request, reply) => {
    await cleanupExpiredSessions();
    const payload = loginSchema.parse(request.body);
    const result = await login(payload.username, payload.pin);

    if (!result) {
      return reply
        .code(401)
        .send({ message: "اسم المستخدم أو الرمز السري غير صحيح." });
    }

    return result;
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
      const result = await changePin(
        request.user.id,
        payload.current_pin,
        payload.new_pin,
      );

      if (!result.ok) {
        const message =
          result.reason === "invalid_pin"
            ? "الرمز السري الحالي غير صحيح."
            : "تعذر تغيير الرمز.";
        return reply.code(400).send({ message });
      }

      return { ok: true };
    },
  );

  app.get("/me", async (request) => {
    if (!request.user) {
      return { user: null, roles: [], permissions: [] };
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
    };
  });
};
