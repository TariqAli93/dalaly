import { type FastifyPluginAsync } from "fastify";
import { config } from "../../infrastructure/config.js";
import { pool } from "../../infrastructure/database/pool.js";
import {
  adminExists,
  cleanupExpiredSessions,
  createAdmin,
  login,
  logout
} from "./auth.service.js";
import { loginSchema, setupAdminSchema } from "./auth.schema.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/setup-status", async () => {
    const dbConnected = await validateDatabaseConnection();
    return {
      app_version: config.appVersion,
      db_connected: dbConnected,
      admin_exists: dbConnected ? await adminExists() : false
    };
  });

  app.post("/setup-admin", async (request, reply) => {
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

  app.get("/me", async (request) => ({
    user: request.user
  }));
};

async function validateDatabaseConnection() {
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}
