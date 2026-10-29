import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { parseId } from "../../shared/utils/parse-id.js";
import {
  addDealOffer,
  createDeal,
  dealPipeline,
  dealStage,
  getDealDetail,
  listDealsPage,
  moveDealStage,
  setDealOfferStatus,
  updateDeal,
} from "./deals.repository.js";
import { needsClosePermission } from "./deals.rules.js";
import { prepareDealAgreement } from "./deals.service.js";
import {
  dealAgreementSchema,
  dealFiltersSchema,
  dealOfferSchema,
  dealOfferStatusSchema,
  dealPageQuerySchema,
  dealPayloadSchema,
  dealStageSchema,
} from "./deals.schema.js";

const notFound = { message: "الصفقة غير موجودة." };
const badId = { message: "معرّف الصفقة غير صحيح." };

export const dealsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/paged",
    { preHandler: requirePermission("deals.read") },
    async (request) =>
      listDealsPage(dealPageQuerySchema.parse(request.query), request.user?.id),
  );

  app.get(
    "/pipeline",
    { preHandler: requirePermission("deals.read") },
    async (request) =>
      dealPipeline(dealFiltersSchema.parse(request.query), request.user?.id),
  );

  app.get(
    "/:id",
    { preHandler: requirePermission("deals.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      return (await getDealDetail(id)) ?? reply.code(404).send(notFound);
    },
  );

  app.post(
    "/",
    { preHandler: requirePermission("deals.create") },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await createDeal(
            dealPayloadSchema.parse(request.body),
            request.user?.id,
          ),
        ),
  );

  app.put(
    "/:id",
    { preHandler: requirePermission("deals.update") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const deal = await updateDeal(
        id,
        dealPayloadSchema.parse(request.body),
        request.user?.id,
      );
      return deal ?? reply.code(404).send(notFound);
    },
  );

  // نقل المرحلة: الإغلاق (ربح، خسارة، إلغاء) وإعادة الفتح تحتاج deals.close.
  app.post(
    "/:id/stage",
    { preHandler: requirePermission("deals.update") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const input = dealStageSchema.parse(request.body);
      const from = await dealStage(id);
      if (!from) return reply.code(404).send(notFound);
      const keys = request.user?.permissions.map((item) => item.key) ?? [];
      if (
        needsClosePermission(from, input.stage) &&
        !keys.includes("deals.close")
      )
        return reply
          .code(403)
          .send({ message: "إغلاق الصفقات وإعادة فتحها يحتاجان صلاحية خاصة." });
      const deal = await moveDealStage(
        id,
        input.stage,
        input,
        request.user?.id,
      );
      return deal ?? reply.code(404).send(notFound);
    },
  );

  // إعداد عقد الصفقة: مسودة من القالب المختار بأطرافها وعرضها ومبالغها.
  app.post(
    "/:id/agreement",
    {
      preHandler: [
        requirePermission("deals.update"),
        requirePermission("agreements.manage"),
      ],
    },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const { template_key } = dealAgreementSchema.parse(request.body);
      const prepared = await prepareDealAgreement(
        id,
        template_key,
        request.user!.id,
      );
      return prepared
        ? reply.code(201).send(prepared)
        : reply.code(404).send(notFound);
    },
  );

  app.post(
    "/:id/offers",
    { preHandler: requirePermission("deals.update") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const offer = await addDealOffer(
        id,
        dealOfferSchema.parse(request.body),
        request.user?.id,
      );
      return offer
        ? reply.code(201).send(offer)
        : reply.code(404).send(notFound);
    },
  );

  app.patch(
    "/:id/offers/:offerId",
    { preHandler: requirePermission("deals.update") },
    async (request, reply) => {
      const params = request.params as { id: string; offerId: string };
      const id = parseId(params.id);
      const offerId = parseId(params.offerId);
      if (!id || !offerId) return reply.code(400).send(badId);
      const deal = await setDealOfferStatus(
        id,
        offerId,
        dealOfferStatusSchema.parse(request.body).status,
        request.user?.id,
      );
      return deal ?? reply.code(404).send({ message: "العرض غير موجود." });
    },
  );
};
