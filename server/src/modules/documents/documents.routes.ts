import fs from "node:fs";
import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { createDocument, createDocumentType, getDocument, getDocumentRequirements, listDocumentTypes, listDocuments, updateDocument } from "./documents.repository.js";
import { contentTypeForFile, resolveManagedFile } from "./documents.storage.js";
import { documentFiltersSchema, documentPayloadSchema, documentTypePayloadSchema, documentUpdateSchema } from "./documents.schema.js";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
export const documentsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/types", { preHandler: requirePermission("documents.read") }, async () => listDocumentTypes());
  app.post("/types", { preHandler: requirePermission("documents.manage") }, async (request, reply) => reply.code(201).send(await createDocumentType(documentTypePayloadSchema.parse(request.body))));
  app.get("/customers/:customerId/requirements", { preHandler: requirePermission("documents.read") }, async (request, reply) => { const id = parseId((request.params as { customerId: string }).customerId); if (!id) return reply.code(400).send({ message: "معرف العميل غير صحيح." }); return getDocumentRequirements(id); });
  app.get("/", { preHandler: requirePermission("documents.read") }, async (request) => listDocuments(documentFiltersSchema.parse(request.query)));
  app.get("/:id/file", { preHandler: requirePermission("documents.read") }, async (request, reply) => { const id = parseId((request.params as { id: string }).id); if (!id) return reply.code(400).send({ message: "معرف المستند غير صحيح." }); const document = await getDocument(id); if (!document) return reply.code(404).send({ message: "المستند غير موجود." }); const filePath = (document as { file_path?: string }).file_path; if (!filePath) return reply.code(404).send({ message: "مسار ملف المستند غير موجود." }); const absolute = resolveManagedFile(filePath); if (!fs.existsSync(absolute)) return reply.code(404).send({ message: "ملف المستند غير موجود." }); reply.type(contentTypeForFile(filePath)); return reply.send(fs.createReadStream(absolute)); });
  app.get("/:id", { preHandler: requirePermission("documents.read") }, async (request, reply) => { const id = parseId((request.params as { id: string }).id); if (!id) return reply.code(400).send({ message: "معرف المستند غير صحيح." }); const row = await getDocument(id); return row ?? reply.code(404).send({ message: "المستند غير موجود." }); });
  app.post("/", { preHandler: requirePermission("documents.manage") }, async (request, reply) => reply.code(201).send(await createDocument(documentPayloadSchema.parse(request.body))));
  app.put("/:id", { preHandler: requirePermission("documents.manage") }, async (request, reply) => { const id = parseId((request.params as { id: string }).id); if (!id) return reply.code(400).send({ message: "معرف المستند غير صحيح." }); const row = await updateDocument(id, documentUpdateSchema.parse(request.body)); return row ?? reply.code(404).send({ message: "المستند غير موجود." }); });
};
