import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { parseId } from "../../shared/utils/parse-id.js";
import {
  getVoucher,
  listMoneyAccounts,
  listVouchersPage,
} from "./vouchers.repository.js";
import {
  clientFundsQuerySchema,
  voucherPageQuerySchema,
  voucherPayloadSchema,
  voucherVoidSchema,
} from "./vouchers.schema.js";
import {
  clientFundsHeld,
  issueVoucher,
  voidVoucher,
} from "./vouchers.service.js";

const notFound = { message: "السند غير موجود." };
const badId = { message: "معرّف السند غير صحيح." };

export const vouchersRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/paged",
    { preHandler: requirePermission("vouchers.read") },
    async (request) =>
      listVouchersPage(voucherPageQuerySchema.parse(request.query)),
  );

  app.get(
    "/money-accounts",
    { preHandler: requirePermission("vouchers.read") },
    async () => listMoneyAccounts(),
  );

  app.get(
    "/client-funds",
    { preHandler: requirePermission("vouchers.read") },
    async (request) =>
      clientFundsHeld(clientFundsQuerySchema.parse(request.query).person_id),
  );

  app.get(
    "/:id",
    { preHandler: requirePermission("vouchers.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      return (await getVoucher(id)) ?? reply.code(404).send(notFound);
    },
  );

  // A receipt needs vouchers.receipt, a payment vouchers.payment.
  app.post(
    "/",
    { preHandler: requirePermission("vouchers.read") },
    async (request, reply) => {
      const payload = voucherPayloadSchema.parse(request.body);
      const key =
        payload.kind === "receipt" ? "vouchers.receipt" : "vouchers.payment";
      if (!request.user?.permissions.some((item) => item.key === key))
        return reply.code(403).send({
          message:
            payload.kind === "receipt"
              ? "إصدار سندات القبض يحتاج صلاحية خاصة."
              : "إصدار سندات الصرف يحتاج صلاحية خاصة.",
        });
      const id = await issueVoucher(payload, request.user?.id);
      return reply.code(201).send(await getVoucher(id));
    },
  );

  app.post(
    "/:id/void",
    { preHandler: requirePermission("vouchers.void") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const done = await voidVoucher(
        id,
        voucherVoidSchema.parse(request.body),
        request.user?.id,
      );
      return done ? await getVoucher(id) : reply.code(404).send(notFound);
    },
  );
};
