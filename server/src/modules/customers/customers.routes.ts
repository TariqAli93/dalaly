import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { archiveCustomer, createCustomer, getCustomer, listCustomers, restoreCustomer, updateCustomer } from "./customers.repository.js";
import { customerFiltersSchema, customerPayloadSchema } from "./customers.schema.js";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const customersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requirePermission("customers.read") }, async (request) => listCustomers(customerFiltersSchema.parse(request.query)));
  app.get("/:id", { preHandler: requirePermission("customers.read") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف العميل غير صحيح." });
    const row = await getCustomer(id);
    return row ?? reply.code(404).send({ message: "العميل غير موجود." });
  });
  app.post("/", { preHandler: requirePermission("customers.create") }, async (request, reply) => reply.code(201).send(await createCustomer(customerPayloadSchema.parse(request.body))));
  app.put("/:id", { preHandler: requirePermission("customers.update") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف العميل غير صحيح." });
    const row = await updateCustomer(id, customerPayloadSchema.parse(request.body));
    return row ?? reply.code(404).send({ message: "العميل غير موجود." });
  });
  app.patch("/:id/archive", { preHandler: requirePermission("customers.update") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف العميل غير صحيح." });
    const row = await archiveCustomer(id);
    return row ?? reply.code(404).send({ message: "العميل غير موجود." });
  });
  app.patch("/:id/restore", { preHandler: requirePermission("customers.update") }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرف العميل غير صحيح." });
    const row = await restoreCustomer(id);
    return row ?? reply.code(404).send({ message: "العميل غير موجود." });
  });
};
