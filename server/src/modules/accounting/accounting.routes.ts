import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { parseId } from "../../shared/utils/parse-id.js";
import {
  createAccount,
  listAccounts,
  updateAccount,
} from "./accounts.repository.js";
import { accountPayloadSchema } from "./accounting.schema.js";

const notFound = { message: "الحساب غير موجود." };
const badId = { message: "معرّف الحساب غير صحيح." };

export const accountingRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/accounts",
    { preHandler: requirePermission("accounting.read") },
    async () => listAccounts(),
  );

  app.post(
    "/accounts",
    { preHandler: requirePermission("accounting.accounts.manage") },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await createAccount(
            accountPayloadSchema.parse(request.body),
            request.user?.id,
          ),
        ),
  );

  app.put(
    "/accounts/:id",
    { preHandler: requirePermission("accounting.accounts.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      return (
        (await updateAccount(
          id,
          accountPayloadSchema.parse(request.body),
          request.user?.id,
        )) ?? reply.code(404).send(notFound)
      );
    },
  );
};
