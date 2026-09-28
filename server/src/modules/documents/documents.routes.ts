import fs from "node:fs";
import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  createDocumentType,
  createIdentityDocument,
  getIdentityDocument,
  getPersonDocumentRequirements,
  listDocumentTypes,
  listIdentityDocuments,
  updateIdentityDocument,
} from "./documents.repository.js";
import {
  documentFiltersSchema,
  documentTypePayloadSchema,
  identityDocumentPayloadSchema,
  identityDocumentUpdateSchema,
} from "./documents.schema.js";
import { contentTypeForFile, resolveManagedFile } from "./documents.storage.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const documentsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/types", { preHandler: requirePermission("documents.read") }, listDocumentTypes);
  app.post("/types", { preHandler: requirePermission("documents.manage") }, async (request, reply) => reply.code(201).send(await createDocumentType(documentTypePayloadSchema.parse(request.body))));
  app.get("/", { preHandler: requirePermission("documents.read") }, async (request) => listIdentityDocuments(documentFiltersSchema.parse(request.query)));
  app.get("/:id", { preHandler: requirePermission("documents.read") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرّف المستمسك غير صحيح." });
    const row = await getIdentityDocument(id);
    return row ?? reply.code(404).send({ message: "المستمسك غير موجود." });
  });
  app.get("/:id/file", { preHandler: requirePermission("documents.read") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرّف المستمسك غير صحيح." });
    const row = await getIdentityDocument(id);
    if (!row) return reply.code(404).send({ message: "المستمسك غير موجود." });
    const document = row as Record<string, unknown>;
    const absolute = resolveManagedFile(String(document.file_path));
    if (!fs.existsSync(absolute)) return reply.code(404).send({ message: "ملف المستمسك غير موجود." });
    reply.type(contentTypeForFile(String(document.file_path)));
    return reply.send(fs.createReadStream(absolute));
  });
  app.post("/", { preHandler: requirePermission("documents.manage") }, async (request, reply) => reply.code(201).send(await createIdentityDocument(identityDocumentPayloadSchema.parse(request.body))));
  app.put("/:id", { preHandler: requirePermission("documents.manage") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرّف المستمسك غير صحيح." });
    const row = await updateIdentityDocument(id, identityDocumentUpdateSchema.parse(request.body));
    return row ?? reply.code(404).send({ message: "المستمسك غير موجود." });
  });
  app.get("/people/:personId/requirements", { preHandler: requirePermission("documents.read") }, async (request, reply) => {
    const personId = parseId((request.params as { personId: string }).personId);
    if (!personId) return reply.code(400).send({ message: "معرّف الشخص غير صحيح." });
    const scope = ((request.query as { scope?: string }).scope === "rent" ? "rent" : "sale") as "sale" | "rent";
    return getPersonDocumentRequirements(personId, scope);
  });
  app.post("/people/:personId", { preHandler: requirePermission("documents.manage") }, async (request, reply) => {
    const personId = parseId((request.params as { personId: string }).personId);
    if (!personId) return reply.code(400).send({ message: "معرّف الشخص غير صحيح." });
    const payload = identityDocumentPayloadSchema.parse({ ...(request.body as object), person_id: personId });
    return reply.code(201).send(await createIdentityDocument(payload));
  });
};
