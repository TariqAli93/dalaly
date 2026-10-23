import fs from "node:fs";
import { type FastifyPluginAsync } from "fastify";
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
  setPrimaryImage,
} from "./images.repository.js";
import {
  contentTypeFor,
  decodeThumbnail,
  deleteImageFromDisk,
  resolveImageAbsolutePath,
  resolveThumbnailPath,
  saveImageToDisk,
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
      const imageId = parseId(params.imageId);
      if (!imageId)
        return reply.code(400).send({ message: "معرف الصورة غير صحيح." });

      const image = await getImage(imageId);
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

      const image = await getImage(imageId);
      if (!image || image.propertyId !== propertyId)
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
      const image = await getImage(imageId);
      if (!image || image.propertyId !== propertyId)
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
      // تُفحص المصغّرات قبل حفظ أي أصل.
      const thumbnails = payload.images.map((item) =>
        item.thumbnail ? decodeThumbnail(item.thumbnail) : null,
      );
      const existing = await countImages(propertyId);
      const created = [];

      for (let i = 0; i < payload.images.length; i += 1) {
        const item = payload.images[i];
        const { filePath } = saveImageToDisk(
          propertyId,
          item.data,
          item.original_name ?? undefined,
        );
        const thumbnail = thumbnails[i];
        if (thumbnail) writeThumbnail(filePath, thumbnail);
        const isPrimary = existing === 0 && i === 0;
        const row = await addImage({
          propertyId,
          filePath,
          originalName: item.original_name ?? null,
          isPrimary,
        });
        created.push(row);
      }

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

      const row = await deleteImageRow(imageId);
      if (!row) return reply.code(404).send({ message: "الصورة غير موجودة." });

      deleteImageFromDisk(row.filePath);
      await ensurePrimary(propertyId);

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
