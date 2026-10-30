import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { parseId } from "../../shared/utils/parse-id.js";
import {
  getCommission,
  listCommissionsPage,
  listPayableSplits,
} from "./commissions.repository.js";
import {
  commissionCancelSchema,
  commissionPageQuerySchema,
  commissionPayableQuerySchema,
  commissionPayloadSchema,
} from "./commissions.schema.js";
import { cancelCommission, recordCommission } from "./commissions.service.js";
import { listAssignees } from "../tasks/tasks.repository.js";

const notFound = { message: "العمولة غير موجودة." };
const badId = { message: "معرّف العمولة غير صحيح." };

export const commissionsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/paged",
    { preHandler: requirePermission("commissions.read") },
    async (request) =>
      listCommissionsPage(commissionPageQuerySchema.parse(request.query)),
  );

  app.get(
    "/payable",
    { preHandler: requirePermission("commissions.read") },
    async (request) =>
      listPayableSplits(
        commissionPayableQuerySchema.parse(request.query).user_id,
      ),
  );

  // The active employees a share can go to, for whoever records commissions
  // (the tasks list of assignees needs a follow-up permission).
  app.get(
    "/staff",
    { preHandler: requirePermission("commissions.manage") },
    async () => listAssignees(),
  );

  app.get(
    "/:id",
    { preHandler: requirePermission("commissions.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      return (await getCommission(id)) ?? reply.code(404).send(notFound);
    },
  );

  app.post(
    "/",
    { preHandler: requirePermission("commissions.manage") },
    async (request, reply) => {
      const id = await recordCommission(
        commissionPayloadSchema.parse(request.body),
        request.user?.id,
      );
      return reply.code(201).send(await getCommission(id));
    },
  );

  app.post(
    "/:id/cancel",
    { preHandler: requirePermission("commissions.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const done = await cancelCommission(
        id,
        commissionCancelSchema.parse(request.body),
        request.user?.id,
      );
      return done ? await getCommission(id) : reply.code(404).send(notFound);
    },
  );
};
