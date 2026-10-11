import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { z } from "zod";
import { ForbiddenError } from "../../shared/errors.js";
import {
  legalDecisionSchema,
  legalRevisionSchema,
  reviewerSchema,
} from "./legal-content.schema.js";
import {
  decideLegalRevision,
  legalHistory,
  listLegalContent,
  listLegalReviewers,
  saveLegalRevision,
  verifyReviewer,
  legalOptions,
  validateRevision,
  compareLegalRevisions,
  restoreLegalRevision,
  scheduleLegalRevision,
  legalNotifications,
  readLegalNotification,
} from "./legal-content.service.js";
import { previewLegalRevision } from "./legal-preview.service.js";
const idSchema = z.coerce.number().int().positive();
const has = (req: FastifyRequest, key: string) =>
  req.user!.permissions.some((p) => p.key === key);
const edits = (req: FastifyRequest) =>
  has(req, "legal_content.manage") || has(req, "legal_content.propose");
const administrative = (req: FastifyRequest) =>
  edits(req) ||
  has(req, "legal_content.approve") ||
  has(req, "legal_content.publish");
function revisionInput(req: FastifyRequest) {
  const input = legalRevisionSchema.parse(req.body);
  if (!has(req, "legal_content.manage")) input.priority = 1;
  return input;
}
const propose = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!edits(req))
    return reply.code(403).send({ message: "ليست لديك صلاحية اقتراح تعديل." });
};
export const legalContentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requirePermission("legal_content.read") }, (req) =>
    listLegalContent(
      !edits(req) &&
        !has(req, "legal_content.approve") &&
        !has(req, "legal_content.publish"),
    ),
  );
  app.get(
    "/options",
    { preHandler: requirePermission("legal_content.read") },
    (req) => legalOptions(!administrative(req)),
  );
  app.get(
    "/history",
    { preHandler: requirePermission("legal_content.read") },
    async (req) => {
      const rows = await legalHistory();
      if (
        edits(req) ||
        has(req, "legal_content.approve") ||
        has(req, "legal_content.publish")
      )
        return rows;
      const active = await listLegalContent(true);
      return rows.filter((r) =>
        active.some((t) => t.id === r.legal_template_id),
      );
    },
  );
  app.get(
    "/reviewers",
    { preHandler: requirePermission("legal_content.read") },
    async (req) => {
      if (
        !has(req, "legal_reviewers.manage") &&
        !has(req, "legal_content.approve")
      )
        throw new ForbiddenError("ليست لديك صلاحية عرض إثبات أهلية المراجعين.");
      return listLegalReviewers();
    },
  );
  app.put(
    "/reviewers",
    { preHandler: requirePermission("legal_reviewers.manage") },
    (req) => verifyReviewer(reviewerSchema.parse(req.body), req.user!.id),
  );
  app.post("/", { preHandler: propose }, async (req, reply) =>
    reply
      .code(201)
      .send(await saveLegalRevision(revisionInput(req), req.user!.id)),
  );
  app.post("/:id/revisions", { preHandler: propose }, async (req, reply) =>
    reply
      .code(201)
      .send(
        await saveLegalRevision(
          revisionInput(req),
          req.user!.id,
          idSchema.parse((req.params as any).id),
        ),
      ),
  );
  app.post("/validate", { preHandler: propose }, (req) =>
    validateRevision(legalRevisionSchema.parse(req.body)),
  );
  app.post(
    "/preview",
    { preHandler: requirePermission("legal_content.read") },
    (req) => {
      const body = z
        .object({
          revision: legalRevisionSchema,
          visual_id: z.number().int().positive(),
          contract_id: z.number().int().positive().optional(),
          additional_conditions: z.string().max(20000).default(""),
        })
        .strict()
        .parse(req.body);
      if (body.contract_id && !has(req, "contracts.read"))
        throw Object.assign(new Error("ليست لديك صلاحية عرض بيانات العقود."), {
          statusCode: 403,
        });
      return previewLegalRevision(
        body.revision,
        body.visual_id,
        body.contract_id,
        body.additional_conditions,
      );
    },
  );
  app.get(
    "/compare",
    { preHandler: requirePermission("legal_content.read") },
    async (req) => {
      const q = z.object({ left: idSchema, right: idSchema }).parse(req.query);
      if (!administrative(req)) {
        const active = await listLegalContent(true);
        if (![q.left, q.right].every((id) => active.some((r) => r.id === id)))
          throw new ForbiddenError("يمكن عرض الإصدارات النشطة فقط.");
      }
      return compareLegalRevisions(q.left, q.right);
    },
  );
  app.post("/:id/restore", { preHandler: propose }, async (req, reply) =>
    reply
      .code(201)
      .send(
        await restoreLegalRevision(
          idSchema.parse((req.params as any).id),
          req.user!.id,
        ),
      ),
  );
  app.patch(
    "/:id/schedule",
    { preHandler: requirePermission("legal_content.manage") },
    (req) => {
      const b = z
        .object({
          target_at: z.iso.datetime({ offset: true }).nullable(),
          priority: z.number().int().min(0).max(2),
        })
        .strict()
        .parse(req.body);
      return scheduleLegalRevision(
        idSchema.parse((req.params as any).id),
        b.target_at,
        b.priority,
        req.user!.id,
      );
    },
  );
  app.post("/:id/decision", async (req) =>
    decideLegalRevision(
      idSchema.parse((req.params as any).id),
      legalDecisionSchema.parse(req.body),
      req.user!.id,
      {
        manage: edits(req),
        publish: has(req, "legal_content.publish"),
        specialist: has(req, "legal_content.approve"),
      },
    ),
  );
  app.get(
    "/notifications",
    { preHandler: requirePermission("legal_content.read") },
    (req) =>
      legalNotifications(
        req.user!.id,
        has(req, "legal_content.publish"),
        has(req, "legal_content.approve"),
      ),
  );
  app.post(
    "/notifications/:id/read",
    { preHandler: requirePermission("legal_content.read") },
    (req) =>
      readLegalNotification(
        idSchema.parse((req.params as any).id),
        req.user!.id,
      ),
  );
};
