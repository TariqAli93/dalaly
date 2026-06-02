import fs from "node:fs";
import path from "node:path";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../../infrastructure/config.js";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  createBackup,
  exportBackup,
  getBackupDir,
  getBackupJob,
  getLastBackupAt,
  listBackupJobs,
  restoreBackup,
  setBackupDir,
  type RestoreScope
} from "./backup.service.js";

const restoreSchema = z.object({
  scope: z.enum(["full", "properties", "images", "users", "settings"]).default("full"),
  file_path: z.string().optional(),
  data: z.string().optional()
});

const dirSchema = z.object({ dir: z.string().trim().min(1) });

const exportSchema = z.object({ outputPath: z.string().trim().min(1) });

export const backupRoutes: FastifyPluginAsync = async (app) => {
  app.get("/history", { preHandler: requirePermission("backups.read") }, async () => {
    const [jobs, lastBackupAt, dir] = await Promise.all([
      listBackupJobs(),
      getLastBackupAt(),
      getBackupDir()
    ]);
    return { jobs, last_backup_at: lastBackupAt, backup_dir: dir };
  });

  app.get("/dir", { preHandler: requirePermission("backups.read") }, async () => {
    return { dir: await getBackupDir() };
  });

  app.put("/dir", { preHandler: requirePermission("backups.create") }, async (request) => {
    const payload = dirSchema.parse(request.body);
    await setBackupDir(payload.dir);
    return { ok: true, dir: payload.dir };
  });

  app.post("/create", { preHandler: requirePermission("backups.create") }, async (request, reply) => {
    try {
      const result = await createBackup("manual", request.user?.id);
      return result;
    } catch (error) {
      return reply.code(500).send({
        ok: false,
        message: error instanceof Error ? error.message : "تعذر إنشاء النسخة الاحتياطية."
      });
    }
  });

  // تصدير يدوي إلى مسار يختاره المستخدم عبر حوار حفظ Electron.
  app.post("/export", { preHandler: requirePermission("backups.create") }, async (request, reply) => {
    const payload = exportSchema.parse(request.body);
    try {
      return await exportBackup(payload.outputPath, request.user?.id);
    } catch (error) {
      return reply.code(500).send({
        ok: false,
        message:
          error instanceof Error ? error.message : "تعذر تصدير النسخة الاحتياطية."
      });
    }
  });

  app.get(
    "/download/:jobId",
    { preHandler: requirePermission("backups.read") },
    async (request, reply) => {
      const jobId = Number((request.params as { jobId: string }).jobId);
      const job = await getBackupJob(jobId);
      if (!job?.filePath || !fs.existsSync(job.filePath)) {
        return reply.code(404).send({ message: "ملف النسخة غير موجود." });
      }
      reply.header(
        "Content-Disposition",
        `attachment; filename="${path.basename(job.filePath)}"`
      );
      reply.type("application/zip");
      return reply.send(fs.createReadStream(job.filePath));
    }
  );

  app.post("/restore", { preHandler: requirePermission("backups.restore") }, async (request, reply) => {
    const payload = restoreSchema.parse(request.body);
    let buffer: Buffer | null = null;

    if (payload.file_path) {
      if (!fs.existsSync(payload.file_path)) {
        return reply.code(400).send({ message: "ملف النسخة غير موجود." });
      }
      buffer = fs.readFileSync(payload.file_path);
    } else if (payload.data) {
      const base64 = payload.data.replace(/^data:[^,]+,/, "");
      buffer = Buffer.from(base64, "base64");
    }

    if (!buffer) {
      return reply.code(400).send({ message: "لم يتم تحديد ملف النسخة." });
    }

    try {
      const result = await restoreBackup(buffer, payload.scope as RestoreScope, request.user?.id);
      return result;
    } catch (error) {
      return reply.code(500).send({
        ok: false,
        message: error instanceof Error ? error.message : "تعذر استرجاع النسخة الاحتياطية."
      });
    }
  });

  // نقاط داخلية للجدولة من عملية Electron الرئيسية (محمية بتوكن داخلي).
  app.post("/internal-run", async (request, reply) => {
    const token = request.headers["x-internal-token"];
    if (!config.internalToken || token !== config.internalToken) {
      return reply.code(401).send({ message: "غير مصرّح." });
    }
    try {
      return await createBackup("email");
    } catch (error) {
      return reply.code(500).send({
        ok: false,
        message: error instanceof Error ? error.message : "فشل النسخ المجدول."
      });
    }
  });
};
