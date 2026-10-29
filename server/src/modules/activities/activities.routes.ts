import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { parseId } from "../../shared/utils/parse-id.js";
import {
  createActivity,
  deleteActivity,
  getActivity,
  listActivities,
  updateActivity,
} from "./activities.repository.js";
import {
  activityFiltersSchema,
  activityPayloadSchema,
} from "./activities.schema.js";

/** A customer's activities: the follow-up permissions, plus reading people. */
export const activitiesRoutes: FastifyPluginAsync = async (app) => {
  const readsPeople = requirePermission("people.read");

  app.get(
    "/",
    { preHandler: [requirePermission("followups.read"), readsPeople] },
    async (request) =>
      listActivities(activityFiltersSchema.parse(request.query)),
  );

  app.get(
    "/:id",
    { preHandler: [requirePermission("followups.read"), readsPeople] },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف النشاط غير صحيح." });
      const row = await getActivity(id);
      return row ?? reply.code(404).send({ message: "النشاط غير موجود." });
    },
  );

  app.post(
    "/",
    { preHandler: [requirePermission("followups.create"), readsPeople] },
    async (request, reply) => {
      const payload = activityPayloadSchema.parse(request.body);
      return reply
        .code(201)
        .send(await createActivity(request.user?.id, payload));
    },
  );

  app.put(
    "/:id",
    { preHandler: [requirePermission("followups.update"), readsPeople] },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف النشاط غير صحيح." });
      const row = await updateActivity(
        id,
        activityPayloadSchema.parse(request.body),
      );
      return row ?? reply.code(404).send({ message: "النشاط غير موجود." });
    },
  );

  app.delete(
    "/:id",
    { preHandler: [requirePermission("followups.delete"), readsPeople] },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرف النشاط غير صحيح." });
      const row = await deleteActivity(id);
      return row
        ? { deleted: true }
        : reply.code(404).send({ message: "النشاط غير موجود." });
    },
  );
};
