import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import {
  createRole,
  deleteRole,
  getRole,
  listRoles,
  updateRole,
  updateRolePermissions
} from "./roles.repository.js";
import { rolePayloadSchema, rolePermissionsSchema } from "./roles.schema.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const rolesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requirePermission("roles.read") }, async () => listRoles());

  app.get("/:id", { preHandler: requirePermission("roles.read") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف الدور غير صحيح." });
    const role = await getRole(id);
    if (!role) return reply.code(404).send({ message: "الدور غير موجود." });
    return role;
  });

  app.post("/", { preHandler: requirePermission("roles.create") }, async (request, reply) => {
    const payload = rolePayloadSchema.parse(request.body);
    const role = await createRole(payload);
    return reply.code(201).send(role);
  });

  app.put("/:id", { preHandler: requirePermission("roles.update") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف الدور غير صحيح." });
    const payload = rolePayloadSchema.parse(request.body);
    const role = await updateRole(id, payload);
    if (!role) return reply.code(404).send({ message: "الدور غير موجود." });
    return role;
  });

  app.delete("/:id", { preHandler: requirePermission("roles.delete") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف الدور غير صحيح." });
    try {
      const role = await deleteRole(id);
      if (!role) return reply.code(404).send({ message: "الدور غير موجود." });
      return { deleted: true, role };
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "تعذر حذف الدور." });
    }
  });

  app.put("/:id/permissions", { preHandler: requirePermission("roles.update") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف الدور غير صحيح." });
    const payload = rolePermissionsSchema.parse(request.body);
    const role = await updateRolePermissions(id, payload.permission_ids);
    if (!role) return reply.code(404).send({ message: "الدور غير موجود." });
    return role;
  });
};
