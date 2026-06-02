import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  createDistrict,
  createGovernorate,
  createNeighborhood,
  deleteDistrict,
  deleteGovernorate,
  deleteNeighborhood,
  getLocations,
  updateDistrict,
  updateGovernorate,
  updateNeighborhood
} from "./locations.repository.js";
import {
  districtPayloadSchema,
  districtUpdateSchema,
  governoratePayloadSchema,
  neighborhoodPayloadSchema,
  neighborhoodUpdateSchema
} from "./locations.schema.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const locationsRoutes: FastifyPluginAsync = async (app) => {
  // القراءة متاحة لأي مستخدم مصادق (لازمة لنماذج العقار).
  app.get("/", async () => getLocations());

  app.post(
    "/governorates",
    { preHandler: requirePermission("locations.manage") },
    async (request, reply) => {
      const payload = governoratePayloadSchema.parse(request.body);
      const governorate = await createGovernorate(payload);
      return reply.code(201).send(governorate);
    }
  );

  app.put(
    "/governorates/:id",
    { preHandler: requirePermission("locations.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف المحافظة غير صحيح." });
      const payload = governoratePayloadSchema.parse(request.body);
      const governorate = await updateGovernorate(id, payload);
      if (!governorate) return reply.code(404).send({ message: "المحافظة غير موجودة." });
      return governorate;
    }
  );

  app.delete(
    "/governorates/:id",
    { preHandler: requirePermission("locations.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف المحافظة غير صحيح." });
      try {
        const governorate = await deleteGovernorate(id);
        if (!governorate) return reply.code(404).send({ message: "المحافظة غير موجودة." });
        return { deleted: true, governorate };
      } catch (error) {
        return reply
          .code(400)
          .send({ message: error instanceof Error ? error.message : "تعذر حذف المحافظة." });
      }
    }
  );

  app.post(
    "/districts",
    { preHandler: requirePermission("locations.manage") },
    async (request, reply) => {
      const payload = districtPayloadSchema.parse(request.body);
      const district = await createDistrict(payload);
      return reply.code(201).send(district);
    }
  );

  app.put(
    "/districts/:id",
    { preHandler: requirePermission("locations.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف المنطقة غير صحيح." });
      const payload = districtUpdateSchema.parse(request.body);
      const district = await updateDistrict(id, payload);
      if (!district) return reply.code(404).send({ message: "المنطقة غير موجودة." });
      return district;
    }
  );

  app.delete(
    "/districts/:id",
    { preHandler: requirePermission("locations.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف المنطقة غير صحيح." });
      try {
        const district = await deleteDistrict(id);
        if (!district) return reply.code(404).send({ message: "المنطقة غير موجودة." });
        return { deleted: true, district };
      } catch (error) {
        return reply
          .code(400)
          .send({ message: error instanceof Error ? error.message : "تعذر حذف المنطقة." });
      }
    }
  );

  app.post(
    "/neighborhoods",
    { preHandler: requirePermission("locations.manage") },
    async (request, reply) => {
      const payload = neighborhoodPayloadSchema.parse(request.body);
      const neighborhood = await createNeighborhood(payload);
      return reply.code(201).send(neighborhood);
    }
  );

  app.put(
    "/neighborhoods/:id",
    { preHandler: requirePermission("locations.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف الحي غير صحيح." });
      const payload = neighborhoodUpdateSchema.parse(request.body);
      const neighborhood = await updateNeighborhood(id, payload);
      if (!neighborhood) return reply.code(404).send({ message: "الحي غير موجود." });
      return neighborhood;
    }
  );

  app.delete(
    "/neighborhoods/:id",
    { preHandler: requirePermission("locations.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send({ message: "معرف الحي غير صحيح." });
      try {
        const neighborhood = await deleteNeighborhood(id);
        if (!neighborhood) return reply.code(404).send({ message: "الحي غير موجود." });
        return { deleted: true, neighborhood };
      } catch (error) {
        return reply
          .code(400)
          .send({ message: error instanceof Error ? error.message : "تعذر حذف الحي." });
      }
    }
  );
};
