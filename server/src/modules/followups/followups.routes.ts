import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  createFollowup,
  deleteFollowup,
  listFollowups,
  updateFollowup
} from "./followups.repository.js";
import { followupPayloadSchema } from "./followups.schema.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const followupsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/:id/followups",
    { preHandler: requirePermission("followups.read") },
    async (request, reply) => {
      const propertyId = parseId((request.params as { id: string }).id);
      if (!propertyId) return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      return listFollowups(propertyId);
    }
  );

  app.post(
    "/:id/followups",
    { preHandler: requirePermission("followups.create") },
    async (request, reply) => {
      const propertyId = parseId((request.params as { id: string }).id);
      if (!propertyId) return reply.code(400).send({ message: "معرف العقار غير صحيح." });
      const payload = followupPayloadSchema.parse(request.body);
      const row = await createFollowup(propertyId, request.user?.id, payload);
      return reply.code(201).send(row);
    }
  );

  app.put(
    "/:id/followups/:followupId",
    { preHandler: requirePermission("followups.update") },
    async (request, reply) => {
      const params = request.params as { id: string; followupId: string };
      const followupId = parseId(params.followupId);
      if (!followupId) return reply.code(400).send({ message: "معرف المتابعة غير صحيح." });
      const payload = followupPayloadSchema.parse(request.body);
      const row = await updateFollowup(followupId, payload);
      if (!row) return reply.code(404).send({ message: "المتابعة غير موجودة." });
      return row;
    }
  );

  app.delete(
    "/:id/followups/:followupId",
    { preHandler: requirePermission("followups.delete") },
    async (request, reply) => {
      const params = request.params as { id: string; followupId: string };
      const followupId = parseId(params.followupId);
      if (!followupId) return reply.code(400).send({ message: "معرف المتابعة غير صحيح." });
      const row = await deleteFollowup(followupId);
      if (!row) return reply.code(404).send({ message: "المتابعة غير موجودة." });
      return { deleted: true };
    }
  );
};
