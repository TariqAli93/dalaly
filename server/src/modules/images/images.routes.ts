import fs from "node:fs";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth/auth.hooks.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  addImage,
  countImages,
  deleteImageRow,
  ensurePrimary,
  getImage,
  listImages,
  reorderImages,
  setPrimaryImage
} from "./images.repository.js";
import {
  contentTypeFor,
  deleteImageFromDisk,
  resolveImageAbsolutePath,
  saveImageToDisk
} from "./images.service.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const uploadSchema = z.object({
  images: z
    .array(
      z.object({
        data: z.string().min(1),
        original_name: z.string().optional().nullable()
      })
    )
    .min(1)
});

const orderSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).default([])
});

export const imagesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/:id/images",
    { preHandler: requirePermission("properties.read") },
    async (request, reply) => {
      const propertyId = parseId((request.params as { id: string }).id);
      if (!propertyId) return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      return listImages(propertyId);
    }
  );

  app.get(
    "/:id/images/:imageId/file",
    { preHandler: requirePermission("properties.read") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const imageId = parseId(params.imageId);
      if (!imageId) return reply.code(400).send({ message: "معرف الصورة غير صحيح." });

      const image = await getImage(imageId);
      if (!image) return reply.code(404).send({ message: "الصورة غير موجودة." });

      const absolute = resolveImageAbsolutePath(image.filePath);
      if (!fs.existsSync(absolute)) {
        return reply.code(404).send({ message: "ملف الصورة غير موجود." });
      }

      reply.header("Cache-Control", "private, max-age=86400");
      reply.type(contentTypeFor(image.filePath));
      return reply.send(fs.createReadStream(absolute));
    }
  );

  app.post(
    "/:id/images",
    { preHandler: requirePermission("properties.images.manage") },
    async (request, reply) => {
      const propertyId = parseId((request.params as { id: string }).id);
      if (!propertyId) return reply.code(400).send({ message: "معرف العقار غير صحيح." });

      const payload = uploadSchema.parse(request.body);
      const existing = await countImages(propertyId);
      const created = [];

      for (let i = 0; i < payload.images.length; i += 1) {
        const item = payload.images[i];
        const { filePath } = saveImageToDisk(propertyId, item.data, item.original_name ?? undefined);
        const isPrimary = existing === 0 && i === 0;
        const row = await addImage({
          propertyId,
          filePath,
          originalName: item.original_name ?? null,
          isPrimary
        });
        created.push(row);
      }

      await recordAudit({
        entityType: "property",
        entityId: propertyId,
        action: "image_added",
        newValue: { count: created.length },
        userId: request.user?.id
      });

      return reply.code(201).send(created);
    }
  );

  app.patch(
    "/:id/images/:imageId/primary",
    { preHandler: requirePermission("properties.images.manage") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const propertyId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!propertyId || !imageId) return reply.code(400).send({ message: "معرف غير صحيح." });
      await setPrimaryImage(propertyId, imageId);
      return listImages(propertyId);
    }
  );

  app.put(
    "/:id/images/order",
    { preHandler: requirePermission("properties.images.manage") },
    async (request, reply) => {
      const propertyId = parseId((request.params as { id: string }).id);
      if (!propertyId) return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      const payload = orderSchema.parse(request.body);
      await reorderImages(propertyId, payload.ids);
      return listImages(propertyId);
    }
  );

  app.delete(
    "/:id/images/:imageId",
    { preHandler: requirePermission("properties.images.manage") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const propertyId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!propertyId || !imageId) return reply.code(400).send({ message: "معرف غير صحيح." });

      const row = await deleteImageRow(imageId);
      if (!row) return reply.code(404).send({ message: "الصورة غير موجودة." });

      deleteImageFromDisk(row.filePath);
      await ensurePrimary(propertyId);

      await recordAudit({
        entityType: "property",
        entityId: propertyId,
        action: "image_removed",
        oldValue: { file_path: row.filePath },
        userId: request.user?.id
      });

      return { deleted: true };
    }
  );
};
