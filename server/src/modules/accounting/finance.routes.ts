import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { parseId } from "../../shared/utils/parse-id.js";
import { dealFinance, personFinance } from "./finance.repository.js";

/**
 * The money of a deal or a customer, for their pages. Reading it is reading
 * receipts and payments, so it needs vouchers.read.
 */
export const financeRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/deals/:id",
    { preHandler: requirePermission("vouchers.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف الصفقة غير صحيح." });
      return (
        (await dealFinance(id)) ??
        reply.code(404).send({ message: "الصفقة غير موجودة." })
      );
    },
  );

  app.get(
    "/people/:id",
    { preHandler: requirePermission("vouchers.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id)
        return reply.code(400).send({ message: "معرّف الزبون غير صحيح." });
      return (
        (await personFinance(id)) ??
        reply.code(404).send({ message: "الزبون غير موجود." })
      );
    },
  );
};
