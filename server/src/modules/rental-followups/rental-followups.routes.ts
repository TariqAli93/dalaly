import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { followupPayloadSchema } from "../followups/followups.schema.js";
import {
  createRentalFollowup,
  deleteRentalFollowup,
  listRentalFollowups,
  updateRentalFollowup,
} from "./rental-followups.repository.js";
function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
export const rentalFollowupsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/:id/followups",
    { preHandler: requirePermission("rentals.followups.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      return listRentalFollowups(id);
    },
  );
  app.post(
    "/:id/followups",
    { preHandler: requirePermission("rentals.followups.create") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف الإيجار غير صحيح." });
      return reply
        .code(201)
        .send(
          await createRentalFollowup(
            id,
            request.user?.id,
            followupPayloadSchema.parse(request.body),
          ),
        );
    },
  );
  app.put(
    "/:id/followups/:followupId",
    { preHandler: requirePermission("rentals.followups.update") },
    async (request, reply) => {
      const id = parseId((request.params as { followupId: string }).followupId);
      if (!id)
        return reply.code(400).send({ message: "معرف المتابعة غير صحيح." });
      const row = await updateRentalFollowup(
        id,
        followupPayloadSchema.parse(request.body),
      );
      return row
        ? row
        : reply.code(404).send({ message: "المتابعة غير موجودة." });
    },
  );
  app.delete(
    "/:id/followups/:followupId",
    { preHandler: requirePermission("rentals.followups.delete") },
    async (request, reply) => {
      const id = parseId((request.params as { followupId: string }).followupId);
      if (!id)
        return reply.code(400).send({ message: "معرف المتابعة غير صحيح." });
      const row = await deleteRentalFollowup(id);
      return row
        ? { deleted: true }
        : reply.code(404).send({ message: "المتابعة غير موجودة." });
    },
  );
};
