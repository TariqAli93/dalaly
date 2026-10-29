import fs from "node:fs";
import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  addImages,
  assertPropertyExists,
  deleteImage,
  getImage,
  listImages,
  reorderImages,
  setPrimaryImage,
} from "./images.repository.js";
import {
  contentTypeFor,
  decodeThumbnail,
  deleteImageFromDisk,
  resolveImageAbsolutePath,
  resolveThumbnailPath,
  storeImages,
  writeThumbnail,
} from "./images.service.js";
import {
  imageOrderSchema,
  imageUploadSchema,
  thumbnailSchema,
} from "./images.schema.js";
import { parseId } from "../../shared/utils/parse-id.js";
import { UPLOAD_BODY_LIMIT } from "../../shared/constants/limits.js";

export const imagesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/:id/images",
    { preHandler: requirePermission("properties.read") },
    async (request, reply) => {
      const propertyId = parseId((request.params as { id: string }).id);
      if (!propertyId)
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      return listImages(propertyId);
    },
  );

  app.get(
    "/:id/images/:imageId/file",
    { preHandler: requirePermission("properties.read") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const propertyId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!propertyId || !imageId)
        return reply.code(400).send({ message: "معرف الصورة غير صحيح." });

      const image = await getImage(propertyId, imageId);
      if (!image)
        return reply.code(404).send({ message: "الصورة غير موجودة." });

      const absolute = resolveImageAbsolutePath(image.filePath);
      if (!absolute || !fs.existsSync(absolute)) {
        return reply.code(404).send({ message: "ملف الصورة غير موجود." });
      }

      reply.header("Cache-Control", "private, max-age=86400");
      reply.type(contentTypeFor(image.filePath));
      return reply.send(fs.createReadStream(absolute));
    },
  );

  // المصغّرة لجدول العروض؛ 404 ما لم تُصنع بعد (القائمة تخبر الواجهة بوجودها).
  app.get(
    "/:id/images/:imageId/thumbnail",
    { preHandler: requirePermission("properties.read") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const propertyId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!propertyId || !imageId)
        return reply.code(400).send({ message: "معرف الصورة غير صحيح." });

      const image = await getImage(propertyId, imageId);
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
    { preHandler: requirePermission("properties.images.manage") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const propertyId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!propertyId || !imageId)
        return reply.code(400).send({ message: "معرف الصورة غير صحيح." });

      const { data } = thumbnailSchema.parse(request.body);
      const thumbnail = decodeThumbnail(data);
      const image = await getImage(propertyId, imageId);
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
      preHandler: requirePermission("properties.images.manage"),
    },
    async (request, reply) => {
      const propertyId = parseId((request.params as { id: string }).id);
      if (!propertyId)
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });

      const payload = imageUploadSchema.parse(request.body);
      await assertPropertyExists(propertyId);
      const created = await storeImages(
        "",
        propertyId,
        payload.images,
        (files) => addImages(propertyId, files),
      );

      await recordAudit({
        entityType: "property",
        entityId: propertyId,
        action: "image_added",
        newValue: { count: created.length },
        userId: request.user?.id,
      });

      return reply.code(201).send(created);
    },
  );

  app.patch(
    "/:id/images/:imageId/primary",
    { preHandler: requirePermission("properties.images.manage") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const propertyId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!propertyId || !imageId)
        return reply.code(400).send({ message: "معرف غير صحيح." });
      await setPrimaryImage(propertyId, imageId);
      return listImages(propertyId);
    },
  );

  app.put(
    "/:id/images/order",
    { preHandler: requirePermission("properties.images.manage") },
    async (request, reply) => {
      const propertyId = parseId((request.params as { id: string }).id);
      if (!propertyId)
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      const payload = imageOrderSchema.parse(request.body);
      await reorderImages(propertyId, payload.ids);
      return listImages(propertyId);
    },
  );

  app.delete(
    "/:id/images/:imageId",
    { preHandler: requirePermission("properties.images.manage") },
    async (request, reply) => {
      const params = request.params as { id: string; imageId: string };
      const propertyId = parseId(params.id);
      const imageId = parseId(params.imageId);
      if (!propertyId || !imageId)
        return reply.code(400).send({ message: "معرف غير صحيح." });

      const row = await deleteImage(propertyId, imageId);
      if (!row) return reply.code(404).send({ message: "الصورة غير موجودة." });

      if (!deleteImageFromDisk(row.filePath))
        request.log.warn({ imageId }, "image file could not be deleted");

      await recordAudit({
        entityType: "property",
        entityId: propertyId,
        action: "image_removed",
        oldValue: { file_path: row.filePath },
        userId: request.user?.id,
      });

      return { deleted: true };
    },
  );
};
