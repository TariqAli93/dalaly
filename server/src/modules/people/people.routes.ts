import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  archivePerson,
  createPerson,
  getPerson,
  listPeople,
  listPeoplePage,
  restorePerson,
  updatePerson,
} from "./people.repository.js";
import {
  personFiltersSchema,
  personPageQuerySchema,
  personPayloadSchema,
} from "./people.schema.js";
import { parseId } from "../../shared/utils/parse-id.js";

export const peopleRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { preHandler: requirePermission("people.read") },
    async (request) => listPeople(personFiltersSchema.parse(request.query)),
  );
  // صفحة واحدة مع العدد الكلي لجدول الأشخاص. القائمة الكاملة أعلاه باقية
  // لقوائم الاختيار (مالك العرض، عميل الطلب، تصفية المستمسكات).
  app.get(
    "/paged",
    { preHandler: requirePermission("people.read") },
    async (request) =>
      listPeoplePage(personPageQuerySchema.parse(request.query)),
  );
  app.get(
    "/:id",
    { preHandler: requirePermission("people.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف الشخص غير صحيح." });
      const row = await getPerson(id);
      return row ?? reply.code(404).send({ message: "الشخص غير موجود." });
    },
  );
  app.post(
    "/",
    { preHandler: requirePermission("people.create") },
    async (request, reply) =>
      reply
        .code(201)
        .send(await createPerson(personPayloadSchema.parse(request.body))),
  );
  app.put(
    "/:id",
    { preHandler: requirePermission("people.update") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف الشخص غير صحيح." });
      const row = await updatePerson(
        id,
        personPayloadSchema.parse(request.body),
      );
      return row ?? reply.code(404).send({ message: "الشخص غير موجود." });
    },
  );
  app.patch(
    "/:id/archive",
    { preHandler: requirePermission("people.update") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف الشخص غير صحيح." });
      const row = await archivePerson(id);
      return row ?? reply.code(404).send({ message: "الشخص غير موجود." });
    },
  );
  app.patch(
    "/:id/restore",
    { preHandler: requirePermission("people.update") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف الشخص غير صحيح." });
      const row = await restorePerson(id);
      return row ?? reply.code(404).send({ message: "الشخص غير موجود." });
    },
  );
};
