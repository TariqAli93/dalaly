import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  addFavoriteRental,
  listFavoriteRentalIds,
  listFavoriteRentals,
  removeFavoriteRental,
} from "./rental-favorites.repository.js";
function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
export const rentalFavoritesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: requirePermission("rentals.read") },
    async (request) => listFavoriteRentals(request.user!.id),
  );
  app.get(
    "/ids",
    { preHandler: requirePermission("rentals.read") },
    async (request) => ({ ids: await listFavoriteRentalIds(request.user!.id) }),
  );
  app.post(
    "/:rentalId",
    { preHandler: requirePermission("rentals.read") },
    async (request, reply) => {
      const id = parseId((request.params as { rentalId: string }).rentalId);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      await addFavoriteRental(request.user!.id, id);
      return { ok: true };
    },
  );
  app.delete(
    "/:rentalId",
    { preHandler: requirePermission("rentals.read") },
    async (request, reply) => {
      const id = parseId((request.params as { rentalId: string }).rentalId);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      await removeFavoriteRental(request.user!.id, id);
      return { ok: true };
    },
  );
};
