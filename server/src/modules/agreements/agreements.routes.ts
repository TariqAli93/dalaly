import { type FastifyPluginAsync, type FastifyRequest } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { onAgreementIssued } from "../deals/deals.service.js";
import { UPLOAD_BODY_LIMIT } from "../../shared/constants/limits.js";
import { DomainError } from "../../shared/errors.js";
import { parseId } from "../../shared/utils/parse-id.js";
import type {
  ContractDocument,
  TemplateKey,
} from "../../shared/contract-document/index.js";
import {
  getTemplate,
  getTemplateVersion,
  listTemplateVersions,
  listTemplates,
  resetTemplate,
  restoreTemplateVersion,
  saveTemplate,
} from "./agreement-templates.repository.js";
import {
  amendAgreement,
  cancelAgreement,
  createAgreement,
  deleteDraft,
  duplicateAgreement,
  getAgreement,
  getRevision,
  issueAgreement,
  listAgreementsPage,
  recordExport,
  returnToDraft,
  saveDraft,
  submitForReview,
} from "./agreements.repository.js";
import {
  agreementPageQuerySchema,
  createAgreementSchema,
  docxQuerySchema,
  exportRecordSchema,
  issueAgreementSchema,
  reasonSchema,
  resetTemplateSchema,
  restoreVersionSchema,
  saveAgreementSchema,
  saveTemplateSchema,
  statusActionSchema,
  templateKeySchema,
} from "./agreements.schema.js";
import { agreementDocx } from "./agreements.service.js";

function agreementId(request: FastifyRequest) {
  const id = parseId((request.params as { id: string }).id);
  if (!id) throw new DomainError(400, "معرّف العقد غير صحيح.");
  return id;
}

function templateKey(request: FastifyRequest): TemplateKey {
  const parsed = templateKeySchema.safeParse(
    (request.params as { key: string }).key,
  );
  // Only the four built-in templates exist; any other key is not found.
  if (!parsed.success) throw new DomainError(404, "القالب غير موجود.");
  return parsed.data;
}

function versionNumber(request: FastifyRequest) {
  const version = Number((request.params as { version: string }).version);
  if (!Number.isInteger(version) || version < 0)
    throw new DomainError(400, "رقم النسخة غير صحيح.");
  return version;
}

const userId = (request: FastifyRequest) => request.user!.id;

/**
 * Contracts and their four templates. There are no routes that create or
 * delete a template: customising one, resetting it and restoring an older
 * version are the only template writes.
 */
export const agreementsRoutes: FastifyPluginAsync = async (app) => {
  // ─── Templates ──────────────────────────────────────────────────────
  app.get(
    "/templates",
    { preHandler: requirePermission("agreements.read") },
    async () => listTemplates(),
  );
  app.get(
    "/templates/:key",
    { preHandler: requirePermission("agreements.read") },
    async (request) => getTemplate(templateKey(request)),
  );
  app.put(
    "/templates/:key",
    {
      bodyLimit: UPLOAD_BODY_LIMIT,
      preHandler: requirePermission("agreements.templates"),
    },
    async (request) => {
      const body = saveTemplateSchema.parse(request.body);
      return saveTemplate(
        templateKey(request),
        body.base_version,
        body.definition as ContractDocument,
        body.note,
        userId(request),
      );
    },
  );
  app.post(
    "/templates/:key/reset",
    { preHandler: requirePermission("agreements.templates") },
    async (request) => {
      const body = resetTemplateSchema.parse(request.body);
      return resetTemplate(
        templateKey(request),
        body.mode,
        body.base_version,
        userId(request),
      );
    },
  );
  app.get(
    "/templates/:key/versions",
    { preHandler: requirePermission("agreements.templates") },
    async (request) => listTemplateVersions(templateKey(request)),
  );
  app.get(
    "/templates/:key/versions/:version",
    { preHandler: requirePermission("agreements.templates") },
    async (request) =>
      getTemplateVersion(templateKey(request), versionNumber(request)),
  );
  app.post(
    "/templates/:key/versions/:version/restore",
    { preHandler: requirePermission("agreements.templates") },
    async (request) => {
      const body = restoreVersionSchema.parse(request.body);
      return restoreTemplateVersion(
        templateKey(request),
        versionNumber(request),
        body.base_version,
        userId(request),
      );
    },
  );

  // ─── Contracts ──────────────────────────────────────────────────────
  app.get(
    "/paged",
    { preHandler: requirePermission("agreements.read") },
    async (request) =>
      listAgreementsPage(agreementPageQuerySchema.parse(request.query)),
  );
  app.post(
    "/",
    { preHandler: requirePermission("agreements.manage") },
    async (request, reply) => {
      const body = createAgreementSchema.parse(request.body);
      const created = await createAgreement(body.template_key, userId(request));
      return reply.code(201).send(await getAgreement(created.id));
    },
  );
  app.get(
    "/:id",
    { preHandler: requirePermission("agreements.read") },
    async (request) => getAgreement(agreementId(request)),
  );
  app.put(
    "/:id",
    {
      bodyLimit: UPLOAD_BODY_LIMIT,
      preHandler: requirePermission("agreements.manage"),
    },
    async (request) =>
      saveDraft(
        agreementId(request),
        saveAgreementSchema.parse(request.body),
        userId(request),
      ),
  );
  app.delete(
    "/:id",
    { preHandler: requirePermission("agreements.manage") },
    async (request, reply) => {
      await deleteDraft(agreementId(request), userId(request));
      return reply.code(204).send();
    },
  );
  app.post(
    "/:id/duplicate",
    { preHandler: requirePermission("agreements.manage") },
    async (request, reply) => {
      const created = await duplicateAgreement(
        agreementId(request),
        userId(request),
      );
      return reply.code(201).send(await getAgreement(created.id));
    },
  );
  app.post(
    "/:id/status",
    { preHandler: requirePermission("agreements.manage") },
    async (request) => {
      const id = agreementId(request);
      const body = statusActionSchema.parse(request.body);
      if (body.action === "submit_review")
        await submitForReview(id, body.base_rev, userId(request));
      else await returnToDraft(id, body.base_rev, userId(request));
      return getAgreement(id);
    },
  );
  app.post(
    "/:id/issue",
    { preHandler: requirePermission("agreements.issue") },
    async (request, reply) => {
      const id = agreementId(request);
      const body = issueAgreementSchema.parse(request.body);
      const result = await issueAgreement(id, body.base_rev, userId(request));
      if (!result.ok)
        return reply.code(422).send({
          code: "AGREEMENT_INCOMPLETE",
          message: "لا يمكن إصدار العقد قبل إكمال البيانات الناقصة.",
          issues: result.issues.map((issue) => ({
            field: issue.field ?? issue.code,
            message: issue.message,
          })),
        });
      // A deal waiting for this contract moves to "contract issued".
      await onAgreementIssued(id, userId(request));
      return getAgreement(id);
    },
  );
  app.post(
    "/:id/amend",
    { preHandler: requirePermission("agreements.issue") },
    async (request) => {
      const id = agreementId(request);
      const body = reasonSchema.parse(request.body);
      await amendAgreement(id, body.reason, userId(request));
      return getAgreement(id);
    },
  );
  app.post(
    "/:id/cancel",
    { preHandler: requirePermission("agreements.cancel") },
    async (request) => {
      const id = agreementId(request);
      const body = reasonSchema.parse(request.body);
      await cancelAgreement(id, body.reason, userId(request));
      return getAgreement(id);
    },
  );
  app.get(
    "/:id/revisions/:revision",
    { preHandler: requirePermission("agreements.read") },
    async (request) => {
      const revision = Number(
        (request.params as { revision: string }).revision,
      );
      if (!Number.isInteger(revision) || revision < 1)
        throw new DomainError(400, "رقم المراجعة غير صحيح.");
      return getRevision(agreementId(request), revision);
    },
  );
  app.get(
    "/:id/docx",
    { preHandler: requirePermission("agreements.export") },
    async (request) =>
      agreementDocx(
        agreementId(request),
        docxQuerySchema.parse(request.query).revision,
      ),
  );
  app.post(
    "/:id/exports",
    { preHandler: requirePermission("agreements.export") },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await recordExport(
            agreementId(request),
            exportRecordSchema.parse(request.body),
            userId(request),
          ),
        ),
  );
};
