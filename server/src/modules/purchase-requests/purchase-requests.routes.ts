import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  createPurchaseRequest,
  getPurchaseRequest,
  listPurchaseRequests,
  updatePurchaseRequest,
} from "./purchase-requests.repository.js";
import {
  purchaseRequestFiltersSchema,
  purchaseRequestPayloadSchema,
} from "./purchase-requests.schema.js";
import { parseId } from "../../shared/utils/parse-id.js";
export const purchaseRequestsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: requirePermission("requests.read") },
    async (request) =>
      listPurchaseRequests(purchaseRequestFiltersSchema.parse(request.query)),
  );
  app.get(
    "/:id",
    { preHandler: requirePermission("requests.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف الطلب غير صحيح." });
      const row = await getPurchaseRequest(id);
      return row ?? reply.code(404).send({ message: "طلب الشراء غير موجود." });
    },
  );
  app.post(
    "/",
    { preHandler: requirePermission("requests.create") },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await createPurchaseRequest(
            purchaseRequestPayloadSchema.parse(request.body),
          ),
        ),
  );
  app.put(
    "/:id",
    { preHandler: requirePermission("requests.update") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف الطلب غير صحيح." });
      const row = await updatePurchaseRequest(
        id,
        purchaseRequestPayloadSchema.parse(request.body),
      );
      return row ?? reply.code(404).send({ message: "طلب الشراء غير موجود." });
    },
  );
};
