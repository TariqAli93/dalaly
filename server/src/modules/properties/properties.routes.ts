import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  archiveProperty,
  createProperty,
  deleteProperty,
  getProperty,
  listProperties,
  restoreProperty,
  updateProperty
} from "./properties.repository.js";
import {
  propertyFiltersSchema,
  propertyPayloadSchema
} from "./properties.schema.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const propertiesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requirePermission("properties.read") }, async (request) => {
    const filters = propertyFiltersSchema.parse(request.query);
    return listProperties(filters);
  });

  app.get("/:id", { preHandler: requirePermission("properties.read") }, async (request, reply) => {
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
  });

  app.post("/", { preHandler: requirePermission("properties.create") }, async (request, reply) => {
    const payload = propertyPayloadSchema.parse(request.body);
    const property = await createProperty(payload);
    return reply.code(201).send(property);
  });

  app.put("/:id", { preHandler: requirePermission("properties.update") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const propertyId = parseId(id);
    if (!propertyId) {
      return reply.code(400).send({ message: "معرف العقار غير صحيح." });
    }

    const payload = propertyPayloadSchema.parse(request.body);
    const property = await updateProperty(propertyId, payload);

    if (!property) {
      return reply.code(404).send({ message: "العقار غير موجود." });
    }

    return property;
  });

  app.delete("/:id", { preHandler: requirePermission("properties.delete") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const propertyId = parseId(id);
    if (!propertyId) {
      return reply.code(400).send({ message: "معرف العقار غير صحيح." });
    }

    const property = await deleteProperty(propertyId);

    if (!property) {
      return reply.code(404).send({ message: "العقار غير موجود." });
    }

    return { deleted: true, property };
  });

  app.patch("/:id/archive", { preHandler: requirePermission("properties.archive") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const propertyId = parseId(id);
    if (!propertyId) {
      return reply.code(400).send({ message: "معرف العقار غير صحيح." });
    }

    const property = await archiveProperty(propertyId);

    if (!property) {
      return reply.code(404).send({ message: "العقار غير موجود." });
    }

    return property;
  });

  app.patch("/:id/restore", { preHandler: requirePermission("properties.restore") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const propertyId = parseId(id);
    if (!propertyId) {
      return reply.code(400).send({ message: "معرف العقار غير صحيح." });
    }

    const property = await restoreProperty(propertyId);

    if (!property) {
      return reply.code(404).send({ message: "العقار غير موجود." });
    }

    return property;
  });
};
