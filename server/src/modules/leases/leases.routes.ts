import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { parseId } from "../../shared/utils/parse-id.js";
import {
  getLease,
  listLeasesPage,
  listOverdueInstallments,
} from "./leases.repository.js";
import {
  leaseActivateSchema,
  leaseCancelSchema,
  leasePageQuerySchema,
  leasePayloadSchema,
  leaseRenewSchema,
  leaseScheduleSchema,
  leaseTerminateSchema,
  overduePageQuerySchema,
} from "./leases.schema.js";
import {
  activateLease,
  agreementLeaseDraft,
  cancelLease,
  createLease,
  renewLease,
  scheduleOf,
  terminateLease,
} from "./leases.service.js";

const notFound = { message: "الإيجار غير موجود." };
const badId = { message: "معرّف الإيجار غير صحيح." };

export const leasesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/paged",
    { preHandler: requirePermission("leases.read") },
    async (request) =>
      listLeasesPage(leasePageQuerySchema.parse(request.query)),
  );

  /** Installments past their day and not fully paid, oldest first. */
  app.get(
    "/installments/overdue",
    { preHandler: requirePermission("leases.read") },
    async (request) =>
      listOverdueInstallments(overduePageQuerySchema.parse(request.query)),
  );

  /** The schedule terms would give, before a lease is entered by hand. */
  app.post(
    "/schedule",
    { preHandler: requirePermission("leases.read") },
    async (request) => {
      const terms = leaseScheduleSchema.parse(request.body);
      return scheduleOf({
        rent: terms.rent_amount,
        frequency: terms.frequency,
        startDate: terms.start_date,
        endDate: terms.end_date,
      });
    },
  );

  /** What activating a rent contract would put in force. */
  app.get(
    "/agreement/:agreementId",
    { preHandler: requirePermission("leases.read") },
    async (request, reply) => {
      const id = parseId(
        (request.params as { agreementId: string }).agreementId,
      );
      if (!id)
        return reply.code(400).send({ message: "معرّف العقد غير صحيح." });
      return (
        (await agreementLeaseDraft(id)) ??
        reply.code(404).send({ message: "العقد غير موجود." })
      );
    },
  );

  app.get(
    "/:id",
    { preHandler: requirePermission("leases.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      return (await getLease(id)) ?? reply.code(404).send(notFound);
    },
  );

  app.post(
    "/",
    { preHandler: requirePermission("leases.manage") },
    async (request, reply) => {
      const id = await createLease(
        leasePayloadSchema.parse(request.body),
        request.user?.id,
      );
      return reply.code(201).send(await getLease(id));
    },
  );

  app.post(
    "/activate",
    { preHandler: requirePermission("leases.manage") },
    async (request, reply) => {
      const id = await activateLease(
        leaseActivateSchema.parse(request.body),
        request.user?.id,
      );
      return reply.code(201).send(await getLease(id));
    },
  );

  app.post(
    "/:id/cancel",
    { preHandler: requirePermission("leases.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const { reason } = leaseCancelSchema.parse(request.body);
      const done = await cancelLease(id, reason, request.user?.id);
      return done ? await getLease(id) : reply.code(404).send(notFound);
    },
  );

  app.post(
    "/:id/terminate",
    { preHandler: requirePermission("leases.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const input = leaseTerminateSchema.parse(request.body);
      const done = await terminateLease(id, input, request.user?.id);
      return done ? await getLease(id) : reply.code(404).send(notFound);
    },
  );

  /** A new lease from the day after this one ends; this one is renewed. */
  app.post(
    "/:id/renew",
    { preHandler: requirePermission("leases.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const input = leaseRenewSchema.parse(request.body);
      const renewal = await renewLease(id, input, request.user?.id);
      return renewal
        ? reply.code(201).send(await getLease(renewal))
        : reply.code(404).send(notFound);
    },
  );
};
