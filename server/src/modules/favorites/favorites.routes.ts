import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  addFavorite,
  listFavoriteIds,
  listFavoriteProperties,
  removeFavorite,
} from "./favorites.repository.js";
import { parseId } from "../../shared/utils/parse-id.js";
import { primaryImagesOf } from "../images/images.repository.js";
import { withPrimaryImages } from "../images/images.service.js";

export const favoritesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: requirePermission("properties.read") },
    // يعرضها جدول العروض نفسه، فلكل صف صورته الرئيسية.
    async (request) =>
      withPrimaryImages(
        await listFavoriteProperties(request.user!.id),
        primaryImagesOf,
      ),
  );

  app.get(
    "/ids",
    { preHandler: requirePermission("properties.read") },
    async (request) => {
      return { ids: await listFavoriteIds(request.user!.id) };
    },
  );

  app.post(
    "/:propertyId",
    { preHandler: requirePermission("properties.read") },
    async (request, reply) => {
      const propertyId = parseId(
        (request.params as { propertyId: string }).propertyId,
      );
      if (!propertyId)
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      await addFavorite(request.user!.id, propertyId);
      return { ok: true };
    },
  );

  app.delete(
    "/:propertyId",
    { preHandler: requirePermission("properties.read") },
    async (request, reply) => {
      const propertyId = parseId(
        (request.params as { propertyId: string }).propertyId,
      );
      if (!propertyId)
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      await removeFavorite(request.user!.id, propertyId);
      return { ok: true };
    },
  );
};
