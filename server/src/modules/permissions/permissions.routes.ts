import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  createPermission,
  deletePermission,
  listPermissions,
  updatePermission
} from "./permissions.repository.js";
import { permissionPayloadSchema } from "./permissions.schema.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const permissionsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requirePermission("roles.read") }, async () => listPermissions());

  app.post("/", { preHandler: requirePermission("roles.create") }, async (request, reply) => {
    const payload = permissionPayloadSchema.parse(request.body);
    const permission = await createPermission(payload);
    return reply.code(201).send(permission);
  });

  app.put("/:id", { preHandler: requirePermission("roles.update") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف الصلاحية غير صحيح." });
    const payload = permissionPayloadSchema.parse(request.body);
    const permission = await updatePermission(id, payload);
    if (!permission) return reply.code(404).send({ message: "الصلاحية غير موجودة." });
    return permission;
  });

  app.delete("/:id", { preHandler: requirePermission("roles.delete") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف الصلاحية غير صحيح." });
    const permission = await deletePermission(id);
    if (!permission) return reply.code(404).send({ message: "الصلاحية غير موجودة." });
    return { deleted: true, permission };
  });
};
