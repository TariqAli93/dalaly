import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  activateUser,
  createUser,
  deactivateUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser
} from "./users.repository.js";
import { createUserSchema, updateUserSchema } from "./users.schema.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requirePermission("users.read") }, async () => listUsers());

  app.get("/:id", { preHandler: requirePermission("users.read") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف المستخدم غير صحيح." });
    const user = await getUser(id);
    if (!user) return reply.code(404).send({ message: "المستخدم غير موجود." });
    return user;
  });

  app.post("/", { preHandler: requirePermission("users.create") }, async (request, reply) => {
    const payload = createUserSchema.parse(request.body);
    const user = await createUser(payload);
    return reply.code(201).send(user);
  });

  app.put("/:id", { preHandler: requirePermission("users.update") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف المستخدم غير صحيح." });
    const payload = updateUserSchema.parse(request.body);
    try {
      const user = await updateUser(id, payload, request.user!.id);
      if (!user) return reply.code(404).send({ message: "المستخدم غير موجود." });
      return user;
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "تعذر تعديل المستخدم." });
    }
  });

  app.patch("/:id/activate", { preHandler: requirePermission("users.update") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف المستخدم غير صحيح." });
    const user = await activateUser(id);
    if (!user) return reply.code(404).send({ message: "المستخدم غير موجود." });
    return user;
  });

  app.patch("/:id/deactivate", { preHandler: requirePermission("users.update") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف المستخدم غير صحيح." });
    try {
      const user = await deactivateUser(id, request.user!.id);
      if (!user) return reply.code(404).send({ message: "المستخدم غير موجود." });
      return user;
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "تعذر تعطيل المستخدم." });
    }
  });

  app.delete("/:id", { preHandler: requirePermission("users.delete") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف المستخدم غير صحيح." });
    try {
      const user = await deleteUser(id, request.user!.id);
      if (!user) return reply.code(404).send({ message: "المستخدم غير موجود." });
      return { deleted: true, user };
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "تعذر حذف المستخدم." });
    }
  });
};
