import fs from "node:fs";
import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  getCompanySettings,
  updateCompanyLogo,
  updateCompanySettings,
} from "./company-settings.repository.js";
import {
  companyLogoSchema,
  companySettingsSchema,
} from "./company-settings.schema.js";
import {
  contentTypeForFile,
  resolveManagedFile,
} from "../documents/documents.storage.js";
export const companySettingsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requirePermission("settings.read") }, async () =>
    getCompanySettings(),
  );
  app.put(
    "/",
    { preHandler: requirePermission("settings.update") },
    async (request) =>
      updateCompanySettings(companySettingsSchema.parse(request.body)),
  );
  app.post(
    "/logo",
    { preHandler: requirePermission("settings.update") },
    async (request) => updateCompanyLogo(companyLogoSchema.parse(request.body)),
  );
  app.get("/logo", async (_request, reply) => {
    const settings = await getCompanySettings();
    if (!settings.logo_file_path)
      return reply.code(404).send({ message: "لم يتم إعداد شعار الشركة." });
    const absolute = resolveManagedFile(String(settings.logo_file_path));
    if (!fs.existsSync(absolute))
      return reply.code(404).send({ message: "ملف الشعار غير موجود." });
    reply.type(contentTypeForFile(String(settings.logo_file_path)));
    return reply.send(fs.createReadStream(absolute));
  });
};
