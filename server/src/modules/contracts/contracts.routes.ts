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
} from "./contracts.service.js";
import {
  contractFiltersSchema,
  contractPayloadSchema,
  contractTemplateSchema,
} from "./contracts.schema.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const contractsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/templates",
    { preHandler: requirePermission("contracts.read") },
    async (request) => {
      const query = request.query as { contract_type?: "sale" | "rental" };
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
    { preHandler: requirePermission("contracts.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف العقد غير صحيح." });
      const result = await contractDocx(id);
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
        .send(await createContract(contractPayloadSchema.parse(request.body))),
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
