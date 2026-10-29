import fs from "node:fs";
import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  contentTypeFor,
  decodeThumbnail,
  deleteImageFromDisk,
  resolveImageAbsolutePath,
  resolveThumbnailPath,
  storeImages,
  writeThumbnail,
} from "../images/images.service.js";
import {
  imageOrderSchema,
  imageUploadSchema,
  thumbnailSchema,
} from "../images/images.schema.js";
import {
  addRentalImages,
  assertRentalExists,
  deleteRentalImage,
  getRentalImage,
  listRentalImages,
  reorderRentalImages,
  setPrimaryRentalImage,
} from "./rental-images.repository.js";
import { parseId } from "../../shared/utils/parse-id.js";
import { UPLOAD_BODY_LIMIT } from "../../shared/constants/limits.js";

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
      if (!absolute || !fs.existsSync(absolute))
        return reply.code(404).send({ message: "ملف الصورة غير موجود." });
      reply.header("Cache-Control", "private, max-age=86400");
      reply.type(contentTypeFor(image.filePath));
      return reply.send(fs.createReadStream(absolute));
    },
  );
  // المصغّرة لجدول الإيجارات؛ 404 ما لم تُصنع بعد.
  app.get(
    "/:id/images/:imageId/thumbnail",
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
      const absolute = resolveThumbnailPath(image.filePath);
      if (!absolute || !fs.existsSync(absolute))
        return reply.code(404).send({ message: "لا توجد مصغّرة للصورة." });
      reply.header("Cache-Control", "private, max-age=86400");
      reply.type("image/jpeg");
      return reply.send(fs.createReadStream(absolute));
    },
  );
  // مصغّرة صنعتها الواجهة لصورة رُفعت قبل وجود المصغّرات.
  app.put(
    "/:id/images/:imageId/thumbnail",
    { preHandler: requirePermission("rentals.images.manage") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const rentalId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!rentalId || !imageId)
        return reply.code(400).send({ message: "معرف الصورة غير صحيح." });
      const thumbnail = decodeThumbnail(
        thumbnailSchema.parse(request.body).data,
      );
      const image = await getRentalImage(rentalId, imageId);
      if (!image)
        return reply.code(404).send({ message: "الصورة غير موجودة." });
      writeThumbnail(image.filePath, thumbnail);
      return { thumbnail: true };
    },
  );
  app.post(
    "/:id/images",
    {
      bodyLimit: UPLOAD_BODY_LIMIT,
      preHandler: requirePermission("rentals.images.manage"),
    },
    async (request, reply) => {
      const rentalId = parseId((request.params as { id: string }).id);
      if (!rentalId)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      const payload = imageUploadSchema.parse(request.body);
      await assertRentalExists(rentalId);
      const created = await storeImages(
        "rentals",
        rentalId,
        payload.images,
        (files) => addRentalImages(rentalId, files),
      );
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
      await reorderRentalImages(
        rentalId,
        imageOrderSchema.parse(request.body).ids,
      );
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
      if (!deleteImageFromDisk(row.filePath))
        request.log.warn({ imageId }, "image file could not be deleted");
      await recordAudit({
        entityType: "rental",
        entityId: rentalId,
        action: "image_removed",
        oldValue: { file_path: row.filePath },
        userId: request.user?.id,
      });
      return { deleted: true };
    },
  );
};
