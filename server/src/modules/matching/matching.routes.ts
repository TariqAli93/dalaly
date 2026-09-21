import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  findPurchaseOfferMatches,
  findPurchaseRequestMatches,
  findRentalOfferMatches,
  findRentalRequestMatches,
} from "./matching.service.js";
function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
export const matchingRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/rental-requests/:id/offers",
    { preHandler: requirePermission("requests.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف الطلب غير صحيح." });
      const matches = await findRentalOfferMatches(id);
      return { count: matches.length, matches };
    },
  );
  app.get(
    "/rentals/:id/requests",
    { preHandler: requirePermission("rentals.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      const matches = await findRentalRequestMatches(id);
      return { count: matches.length, matches };
    },
  );
  app.get(
    "/purchase-requests/:id/offers",
    { preHandler: requirePermission("requests.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف الطلب غير صحيح." });
      const matches = await findPurchaseOfferMatches(id);
      return { count: matches.length, matches };
    },
  );
  app.get(
    "/properties/:id/purchase-requests",
    { preHandler: requirePermission("properties.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      const matches = await findPurchaseRequestMatches(id);
      return { count: matches.length, matches };
    },
  );
};
