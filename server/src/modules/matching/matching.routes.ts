import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  findPurchaseOfferMatches,
  findPurchaseRequestMatches,
  findRentalOfferMatches,
  findRentalRequestMatches,
} from "./matching.service.js";
import { parseId } from "../../shared/utils/parse-id.js";
// Each match pairs two domains (a request and offers, or an offer and the
// customers' requests), so both read permissions are required.
export const matchingRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/rental-requests/:id/offers",
    {
      preHandler: [
        requirePermission("requests.read"),
        requirePermission("rentals.read"),
      ],
    },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف الطلب غير صحيح." });
      const matches = await findRentalOfferMatches(id);
      return { count: matches.length, matches };
    },
  );
  app.get(
    "/rentals/:id/requests",
    {
      preHandler: [
        requirePermission("rentals.read"),
        requirePermission("requests.read"),
      ],
    },
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
    {
      preHandler: [
        requirePermission("requests.read"),
        requirePermission("properties.read"),
      ],
    },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف الطلب غير صحيح." });
      const matches = await findPurchaseOfferMatches(id);
      return { count: matches.length, matches };
    },
  );
  app.get(
    "/properties/:id/purchase-requests",
    {
      preHandler: [
        requirePermission("properties.read"),
        requirePermission("requests.read"),
      ],
    },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      const matches = await findPurchaseRequestMatches(id);
      return { count: matches.length, matches };
    },
  );
};
