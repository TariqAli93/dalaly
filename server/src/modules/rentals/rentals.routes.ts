import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  archiveRental,
  createRental,
  deleteRental,
  getRental,
  getRentalAudit,
  listRentals,
  restoreRental,
  updateRental,
} from "./rentals.repository.js";
import { rentalFiltersSchema, rentalPayloadSchema } from "./rentals.schema.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const rentalsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: requirePermission("rentals.read") },
    async (request) => listRentals(rentalFiltersSchema.parse(request.query)),
  );
  app.get(
    "/:id",
    { preHandler: requirePermission("rentals.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      const rental = await getRental(id);
      return rental
        ? rental
        : reply.code(404).send({ message: "العرض الإيجاري غير موجود." });
    },
  );
  app.get(
    "/:id/audit",
    { preHandler: requirePermission("audit.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      return getRentalAudit(id);
    },
  );
  app.post(
    "/",
    { preHandler: requirePermission("rentals.create") },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await createRental(
            rentalPayloadSchema.parse(request.body),
            request.user?.id,
          ),
        ),
  );
  app.put(
    "/:id",
    { preHandler: requirePermission("rentals.update") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      const rental = await updateRental(
        id,
        rentalPayloadSchema.parse(request.body),
        request.user?.id,
      );
      return rental
        ? rental
        : reply.code(404).send({ message: "العرض الإيجاري غير موجود." });
    },
  );
  app.delete(
    "/:id",
    { preHandler: requirePermission("rentals.delete") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      const rental = await deleteRental(id, request.user?.id);
      return rental
        ? { deleted: true, rental }
        : reply.code(404).send({ message: "العرض الإيجاري غير موجود." });
    },
  );
  app.patch(
    "/:id/archive",
    { preHandler: requirePermission("rentals.archive") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      const rental = await archiveRental(id, request.user?.id);
      return rental
        ? rental
        : reply.code(404).send({ message: "العرض الإيجاري غير موجود." });
    },
  );
  app.patch(
    "/:id/restore",
    { preHandler: requirePermission("rentals.restore") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      const rental = await restoreRental(id, request.user?.id);
      return rental
        ? rental
        : reply.code(404).send({ message: "العرض الإيجاري غير موجود." });
    },
  );
};
