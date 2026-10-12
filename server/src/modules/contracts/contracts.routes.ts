import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  contractDocx,
  createContract,
  createTemplate,
  generateContract,
  getContract,
  listContracts,
  listTemplates,
  previewContract,
  updateContract,
  updateTemplate,
  validateContract,
  reviewContract,
  issueContract,
  cancelContract,
  recordContractPrint,
  contractAttachmentFile,
  recordContractSettlement,
} from "./contracts.service.js";
import { z } from "zod";
import fs from "node:fs";
import {
  getAgreementFollowup,
  updateAgreementProcedure,
  attachAgreementProcedure,
  agreementProcedureFile,
} from "./agreement-followup.service.js";
import { resolveManagedFile } from "../documents/documents.storage.js";
import {
  contractFiltersSchema,
  contractPayloadSchema,
  contractTemplateSchema,
  contractCancellationSchema,
  contractPrintRecordSchema,
  contractSettlementSchema,
} from "./contracts.schema.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const contractsRoutes: FastifyPluginAsync = async (app) => {
  const params = z.object({ id: z.coerce.number().int().positive() });
  app.get(
    "/:id/procedures",
    { preHandler: requirePermission("contracts.read") },
    async (request, reply) =>
      (await getAgreementFollowup(params.parse(request.params).id)) ??
      reply.code(404).send({ message: "الاتفاق غير موجود." }),
  );
  app.put(
    "/:id/procedures",
    { preHandler: requirePermission("contracts.manage") },
    async (request) =>
      updateAgreementProcedure(
        params.parse(request.params).id,
        request.body,
        request.user!.id,
      ),
  );
  app.post(
    "/:id/cancel",
    { preHandler: requirePermission("contracts.cancel") },
    async (request) =>
      cancelContract(
        params.parse(request.params).id,
        contractCancellationSchema.parse(request.body),
        request.user!.id,
      ),
  );
  app.post(
    "/:id/settlements",
    { preHandler: requirePermission("contracts.cancel") },
    async (request) =>
      recordContractSettlement(
        params.parse(request.params).id,
        contractSettlementSchema.parse(request.body),
        request.user!.id,
      ),
  );
  app.post(
    "/:id/print-record",
    { preHandler: requirePermission("contracts.print") },
    async (request) =>
      recordContractPrint(
        params.parse(request.params).id,
        request.user!.id,
        contractPrintRecordSchema.parse(request.body).format,
      ),
  );
  app.post(
    "/:id/procedures/attachments",
    { preHandler: requirePermission("contracts.manage") },
    async (request) =>
      attachAgreementProcedure(
        params.parse(request.params).id,
        request.body,
        request.user!.id,
      ),
  );
  app.get(
    "/:id/attachments/:attachmentId/file",
    { preHandler: requirePermission("contracts.read") },
    async (request, reply) => {
      const input = params
        .extend({ attachmentId: z.coerce.number().int().positive() })
        .parse(request.params);
      const attachment = await contractAttachmentFile(
        input.id,
        input.attachmentId,
      );
      if (!attachment)
        return reply.code(404).send({ message: "مرفق العقد غير موجود." });
      const absolute = resolveManagedFile(attachment.filePath);
      if (!fs.existsSync(absolute))
        return reply.code(404).send({ message: "ملف مرفق العقد غير موجود." });
      reply.header("Content-Disposition", "attachment");
      reply.type(attachment.fileType);
      return reply.send(fs.createReadStream(absolute));
    },
  );
  app.get(
    "/:id/procedures/attachments/:fileId",
    { preHandler: requirePermission("contracts.read") },
    async (request, reply) => {
      const p = params
        .extend({ fileId: z.coerce.number().int().positive() })
        .parse(request.params);
      const file = await agreementProcedureFile(p.id, p.fileId);
      if (!file) return reply.code(404).send({ message: "المرفق غير موجود." });
      const absolute = resolveManagedFile(file.filePath);
      if (!fs.existsSync(absolute))
        return reply.code(404).send({ message: "ملف المرفق غير موجود." });
      reply.header("Content-Disposition", "attachment");
      reply.type(file.fileType);
      return reply.send(fs.createReadStream(absolute));
    },
  );
  app.post(
    "/:id/legal-review",
    { preHandler: requirePermission("legal_content.approve") },
    async (request) => {
      const id = z.coerce
        .number()
        .int()
        .positive()
        .parse((request.params as { id: string }).id);
      const input = z
        .object({
          comment: z.string().trim().min(10).max(5000),
          content_hash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(request.body);
      return reviewContract(
        id,
        request.user!.id,
        input.comment,
        input.content_hash,
      );
    },
  );
  app.post(
    "/:id/issue",
    { preHandler: requirePermission("contracts.issue") },
    async (request) =>
      issueContract(
        z.coerce
          .number()
          .int()
          .positive()
          .parse((request.params as { id: string }).id),
        request.user!.id,
      ),
  );
  app.get(
    "/templates",
    { preHandler: requirePermission("contracts.read") },
    async (request) => {
      const query = request.query as {
        contract_type?: "sale" | "rental" | "purchase";
      };
      return listTemplates(query.contract_type);
    },
  );
  app.post(
    "/templates",
    { preHandler: requirePermission("contract_templates.manage") },
    async (request, reply) =>
      reply
        .code(201)
        .send(await createTemplate(contractTemplateSchema.parse(request.body))),
  );
  app.put(
    "/templates/:id",
    { preHandler: requirePermission("contract_templates.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف القالب غير صحيح." });
      const row = await updateTemplate(
        id,
        contractTemplateSchema.parse(request.body),
      );
      return row ?? reply.code(404).send({ message: "قالب العقد غير موجود." });
    },
  );
  app.get(
    "/",
    { preHandler: requirePermission("contracts.read") },
    async (request) =>
      listContracts(contractFiltersSchema.parse(request.query)),
  );
  app.post(
    "/validate",
    { preHandler: requirePermission("contracts.manage") },
    async (request) =>
      validateContract(contractPayloadSchema.parse(request.body)),
  );
  app.post(
    "/preview",
    { preHandler: requirePermission("contracts.manage") },
    async (request) =>
      previewContract(contractPayloadSchema.parse(request.body)),
  );
  app.get(
    "/:id/docx",
    { preHandler: requirePermission("contracts.print") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف العقد غير صحيح." });
      const result = await contractDocx(id, request.user!.id);
      return result ?? reply.code(404).send({ message: "العقد غير موجود." });
    },
  );
  app.get(
    "/:id",
    { preHandler: requirePermission("contracts.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف العقد غير صحيح." });
      const row = await getContract(id);
      return row ?? reply.code(404).send({ message: "العقد غير موجود." });
    },
  );
  app.post(
    "/",
    { preHandler: requirePermission("contracts.manage") },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await createContract(
            contractPayloadSchema.parse(request.body),
            request.user!.id,
          ),
        ),
  );
  app.put(
    "/:id",
    { preHandler: requirePermission("contracts.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف العقد غير صحيح." });
      const row = await updateContract(
        id,
        contractPayloadSchema.parse(request.body),
        request.user!.id,
      );
      return row ?? reply.code(404).send({ message: "العقد غير موجود." });
    },
  );
  app.post(
    "/:id/generate",
    { preHandler: requirePermission("contracts.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف العقد غير صحيح." });
      const row = await generateContract(id);
      return row ?? reply.code(404).send({ message: "العقد غير موجود." });
    },
  );
};
