import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { createRentalRequest, getRentalRequest, listRentalRequests, updateRentalRequest } from "./rental-requests.repository.js";
import { rentalRequestFiltersSchema, rentalRequestPayloadSchema } from "./rental-requests.schema.js";

function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export const rentalRequestsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requirePermission("requests.read") }, async (request) => listRentalRequests(rentalRequestFiltersSchema.parse(request.query)));
  app.get("/:id", { preHandler: requirePermission("requests.read") }, async (request, reply) => { const id = parseId((request.params as { id: string }).id); if (!id) return reply.code(400).send({ message: "معرف الطلب غير صحيح." }); const row = await getRentalRequest(id); return row ?? reply.code(404).send({ message: "طلب الإيجار غير موجود." }); });
  app.post("/", { preHandler: requirePermission("requests.create") }, async (request, reply) => reply.code(201).send(await createRentalRequest(rentalRequestPayloadSchema.parse(request.body))));
  app.put("/:id", { preHandler: requirePermission("requests.update") }, async (request, reply) => { const id = parseId((request.params as { id: string }).id); if (!id) return reply.code(400).send({ message: "معرف الطلب غير صحيح." }); const row = await updateRentalRequest(id, rentalRequestPayloadSchema.parse(request.body)); return row ?? reply.code(404).send({ message: "طلب الإيجار غير موجود." }); });
};
