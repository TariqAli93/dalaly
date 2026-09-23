import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  contractDocx,
  createContract,
  generateContract,
  getContract,
  listContracts,
  listTemplates,
  updateContract,
  updateTemplate,
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
    async () => listTemplates(),
  );
  app.put(
    "/templates/:type",
    { preHandler: requirePermission("contract_templates.manage") },
    async (request, reply) => {
      const type = (request.params as { type: string }).type;
      const row = await updateTemplate(
        type,
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
  app.get(
    "/:id/docx",
    { preHandler: requirePermission("contracts.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف العقد غير صحيح." });
      const result = await contractDocx(id);
      return result ?? reply.code(404).send({ message: "العقد غير موجود." });
    },
  );
  app.get(
    "/:id",
    { preHandler: requirePermission("contracts.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف العقد غير صحيح." });
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
      if (!id) return reply.code(400).send({ message: "معرف العقد غير صحيح." });
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
      if (!id) return reply.code(400).send({ message: "معرف العقد غير صحيح." });
      const row = await generateContract(id);
      return row ?? reply.code(404).send({ message: "العقد غير موجود." });
    },
  );
};
