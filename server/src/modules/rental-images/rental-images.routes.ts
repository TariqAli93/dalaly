import fs from "node:fs";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth/auth.hooks.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  contentTypeFor,
  deleteImageFromDisk,
  resolveImageAbsolutePath,
  saveRentalImageToDisk,
} from "../images/images.service.js";
import {
  addRentalImage,
  countRentalImages,
  deleteRentalImage,
  ensurePrimaryRentalImage,
  getRentalImage,
  listRentalImages,
  reorderRentalImages,
  setPrimaryRentalImage,
} from "./rental-images.repository.js";

const uploadSchema = z.object({
  images: z
    .array(
      z.object({
        data: z.string().min(1),
        original_name: z.string().optional().nullable(),
      }),
    )
    .min(1),
});
const orderSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).default([]),
});
function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const rentalImagesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/:id/images",
    { preHandler: requirePermission("rentals.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      return listRentalImages(id);
    },
  );
  app.get(
    "/:id/images/:imageId/file",
    { preHandler: requirePermission("rentals.read") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const rentalId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!rentalId || !imageId)
        return reply.code(400).send({ message: "معرف الصورة غير صحيح." });
      const image = await getRentalImage(rentalId, imageId);
      if (!image)
        return reply.code(404).send({ message: "الصورة غير موجودة." });
      const absolute = resolveImageAbsolutePath(image.filePath);
      if (!fs.existsSync(absolute))
        return reply.code(404).send({ message: "ملف الصورة غير موجود." });
      reply.header("Cache-Control", "private, max-age=86400");
      reply.type(contentTypeFor(image.filePath));
      return reply.send(fs.createReadStream(absolute));
    },
  );
  app.post(
    "/:id/images",
    { preHandler: requirePermission("rentals.images.manage") },
    async (request, reply) => {
      const rentalId = parseId((request.params as { id: string }).id);
      if (!rentalId)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      const payload = uploadSchema.parse(request.body);
      const existing = await countRentalImages(rentalId);
      const created = [];
      for (let index = 0; index < payload.images.length; index += 1) {
        const item = payload.images[index];
        const saved = saveRentalImageToDisk(
          rentalId,
          item.data,
          item.original_name ?? undefined,
        );
        created.push(
          await addRentalImage({
            rentalId,
            filePath: saved.filePath,
            originalName: item.original_name ?? null,
            isPrimary: existing === 0 && index === 0,
          }),
        );
      }
      await recordAudit({
        entityType: "rental",
        entityId: rentalId,
        action: "image_added",
        newValue: { count: created.length },
        userId: request.user?.id,
      });
      return reply.code(201).send(created);
    },
  );
  app.patch(
    "/:id/images/:imageId/primary",
    { preHandler: requirePermission("rentals.images.manage") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const rentalId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!rentalId || !imageId)
        return reply.code(400).send({ message: "معرف غير صحيح." });
      await setPrimaryRentalImage(rentalId, imageId);
      return listRentalImages(rentalId);
    },
  );
  app.put(
    "/:id/images/order",
    { preHandler: requirePermission("rentals.images.manage") },
    async (request, reply) => {
      const rentalId = parseId((request.params as { id: string }).id);
      if (!rentalId)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      await reorderRentalImages(rentalId, orderSchema.parse(request.body).ids);
      return listRentalImages(rentalId);
    },
  );
  app.delete(
    "/:id/images/:imageId",
    { preHandler: requirePermission("rentals.images.manage") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const rentalId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!rentalId || !imageId)
        return reply.code(400).send({ message: "معرف غير صحيح." });
      const row = await deleteRentalImage(rentalId, imageId);
      if (!row) return reply.code(404).send({ message: "الصورة غير موجودة." });
      deleteImageFromDisk(row.filePath);
      await ensurePrimaryRentalImage(rentalId);
      return { deleted: true };
    },
  );
};
