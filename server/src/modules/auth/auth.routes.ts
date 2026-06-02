import { type FastifyPluginAsync } from "fastify";
import { config } from "../../infrastructure/config.js";
import {
  getDatabaseStartupState,
  tableExists,
  validateDatabaseConnection
} from "../../infrastructure/database/health.js";
import { requirePermission } from "./auth.hooks.js";
import {
  adminExists,
  changePin,
  cleanupExpiredSessions,
  createAdmin,
  login,
  logout
} from "./auth.service.js";
import { changePinSchema, loginSchema, setupAdminSchema } from "./auth.schema.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/setup-status", async () => {
    const dbConnected = await validateDatabaseConnection();
    if (!dbConnected) {
      return {
        api_running: true,
        app_version: config.appVersion,
        db_connected: false,
        migrations_ok: false,
        users_table_exists: false,
        admin_exists: false
      };
    }

    const usersTableExists = await tableExists("users");
    if (!usersTableExists) {
      return {
        api_running: true,
        app_version: config.appVersion,
        db_connected: true,
        migrations_ok: false,
        users_table_exists: false,
        admin_exists: false
      };
    }

    const startupState = getDatabaseStartupState();

    return {
      api_running: true,
      app_version: config.appVersion,
      db_connected: true,
      migrations_ok: startupState.migrationsOk,
      users_table_exists: true,
      admin_exists: await adminExists()
    };
  });

  app.post("/setup-admin", async (request, reply) => {
    if (!(await validateDatabaseConnection())) {
      return reply.code(503).send({ message: "PostgreSQL غير متصل." });
    }

    if (!(await tableExists("users"))) {
      return reply.code(503).send({ message: "قاعدة البيانات غير جاهزة. تعذر العثور على جدول المستخدمين." });
    }

    const exists = await adminExists();
    if (exists) {
      return reply.code(409).send({ message: "تم إنشاء مستخدم المدير مسبقاً." });
    }

    const payload = setupAdminSchema.parse(request.body);
    const user = await createAdmin(payload.username, payload.pin);
    return reply.code(201).send({ user });
  });

  app.post("/login", async (request, reply) => {
    await cleanupExpiredSessions();
    const payload = loginSchema.parse(request.body);
    const result = await login(payload.username, payload.pin);

    if (!result) {
      return reply.code(401).send({ message: "اسم المستخدم أو رمز PIN غير صحيح." });
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
      const result = await changePin(request.user.id, payload.current_pin, payload.new_pin);

      if (!result.ok) {
        const message =
          result.reason === "invalid_pin"
            ? "رمز PIN الحالي غير صحيح."
            : "تعذر تغيير الرمز.";
        return reply.code(400).send({ message });
      }

      return { ok: true };
    }
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
        is_active: request.user.isActive
      },
      roles: request.user.roles,
      permissions: request.user.permissions
    };
  });
};
