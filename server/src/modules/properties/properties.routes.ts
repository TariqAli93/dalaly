import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  archiveProperty,
  createProperty,
  deleteProperty,
  getProperty,
  getPropertyAudit,
  listProperties,
  listPropertiesPage,
  restoreProperty,
  updateProperty,
} from "./properties.repository.js";
import {
  propertyFiltersSchema,
  propertyPageQuerySchema,
  propertyPayloadSchema,
} from "./properties.schema.js";
import { parseId } from "../../shared/utils/parse-id.js";

export const propertiesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: requirePermission("properties.read") },
    async (request) => {
      const filters = propertyFiltersSchema.parse(request.query);
      return listProperties(filters);
    },
  );

  // صفحة واحدة مع العدد الكلي، لجدول العروض. القائمة الكاملة أعلاه باقية لبقية
  // المستدعين (تفاصيل الشخص، لوحة التحكم).
  app.get(
    "/paged",
    { preHandler: requirePermission("properties.read") },
    async (request) =>
      listPropertiesPage(
        propertyPageQuerySchema.parse(request.query),
        request.user?.id,
      ),
  );

  app.get(
    "/:id",
    { preHandler: requirePermission("properties.read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const propertyId = parseId(id);
      if (!propertyId) {
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      }

      const property = await getProperty(propertyId);

      if (!property) {
        return reply.code(404).send({ message: "العقار غير موجود." });
      }

      return property;
    },
  );

  app.get(
    "/:id/audit",
    { preHandler: requirePermission("audit.read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const propertyId = parseId(id);
      if (!propertyId) {
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      }
      return getPropertyAudit(propertyId);
    },
  );

  app.post(
    "/",
    { preHandler: requirePermission("properties.create") },
    async (request, reply) => {
      const payload = propertyPayloadSchema.parse(request.body);
      const property = await createProperty(payload, request.user?.id);
      return reply.code(201).send(property);
    },
  );

  app.put(
    "/:id",
    { preHandler: requirePermission("properties.update") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const propertyId = parseId(id);
      if (!propertyId) {
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      }

      const payload = propertyPayloadSchema.parse(request.body);
      const property = await updateProperty(
        propertyId,
        payload,
        request.user?.id,
      );

      if (!property) {
        return reply.code(404).send({ message: "العقار غير موجود." });
      }

      return property;
    },
  );

  app.delete(
    "/:id",
    { preHandler: requirePermission("properties.delete") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const propertyId = parseId(id);
      if (!propertyId) {
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      }

      const property = await deleteProperty(propertyId, request.user?.id);

      if (!property) {
        return reply.code(404).send({ message: "العقار غير موجود." });
      }

      return { deleted: true, property };
    },
  );

  app.patch(
    "/:id/archive",
    { preHandler: requirePermission("properties.archive") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const propertyId = parseId(id);
      if (!propertyId) {
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      }

      const property = await archiveProperty(propertyId, request.user?.id);

      if (!property) {
        return reply.code(404).send({ message: "العقار غير موجود." });
      }

      return property;
    },
  );

  app.patch(
    "/:id/restore",
    { preHandler: requirePermission("properties.restore") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const propertyId = parseId(id);
      if (!propertyId) {
        return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      }

      const property = await restoreProperty(propertyId, request.user?.id);

      if (!property) {
        return reply.code(404).send({ message: "العقار غير موجود." });
      }

      return property;
    },
  );
};
