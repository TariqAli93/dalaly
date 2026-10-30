import { type FastifyPluginAsync, type FastifyRequest } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { parseId } from "../../shared/utils/parse-id.js";
import {
  createAccount,
  listAccounts,
  updateAccount,
} from "./accounts.repository.js";
import { accountPayloadSchema } from "./accounting.schema.js";
import {
  accountStatement,
  closeAccountingPeriod,
  createManualEntry,
  deleteEntry,
  getJournalEntry,
  listJournalPage,
  listPeriods,
  postEntry,
  reopenAccountingPeriod,
  reverseJournalEntry,
  updateManualEntry,
} from "./journal.repository.js";
import {
  accountStatementQuerySchema,
  journalEntrySchema,
  journalPageQuerySchema,
  journalReverseSchema,
  periodSchema,
} from "./journal.schema.js";

const notFound = { message: "الحساب غير موجود." };
const badId = { message: "معرّف الحساب غير صحيح." };
const entryNotFound = { message: "القيد غير موجود." };
const badEntryId = { message: "معرّف القيد غير صحيح." };
const cannotPost = {
  message: "ترحيل القيود يحتاج صلاحية خاصة؛ احفظ القيد مسودة.",
};

const hasPermission = (request: FastifyRequest, key: string) =>
  request.user?.permissions.some((item) => item.key === key) ?? false;

export const accountingRoutes: FastifyPluginAsync = async (app) => {
  // ─── Chart of accounts ────────────────────────────────────────────────
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

  app.get(
    "/accounts/:id/statement",
    { preHandler: requirePermission("accounting.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      return (
        (await accountStatement(
          id,
          accountStatementQuerySchema.parse(request.query),
        )) ?? reply.code(404).send(notFound)
      );
    },
  );

  // ─── Journal ──────────────────────────────────────────────────────────
  app.get(
    "/journal/paged",
    { preHandler: requirePermission("accounting.read") },
    async (request) =>
      listJournalPage(journalPageQuerySchema.parse(request.query)),
  );

  app.get(
    "/journal/:id",
    { preHandler: requirePermission("accounting.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badEntryId);
      return (await getJournalEntry(id)) ?? reply.code(404).send(entryNotFound);
    },
  );

  // A manual entry is saved as a draft; posting it at once needs .post too.
  app.post(
    "/journal",
    { preHandler: requirePermission("accounting.journal.create") },
    async (request, reply) => {
      const payload = journalEntrySchema.parse(request.body);
      if (payload.post && !hasPermission(request, "accounting.journal.post"))
        return reply.code(403).send(cannotPost);
      return reply
        .code(201)
        .send(await createManualEntry(payload, request.user?.id));
    },
  );

  app.put(
    "/journal/:id",
    { preHandler: requirePermission("accounting.journal.create") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badEntryId);
      const payload = journalEntrySchema.parse(request.body);
      if (payload.post && !hasPermission(request, "accounting.journal.post"))
        return reply.code(403).send(cannotPost);
      return (
        (await updateManualEntry(id, payload, request.user?.id)) ??
        reply.code(404).send(entryNotFound)
      );
    },
  );

  app.delete(
    "/journal/:id",
    { preHandler: requirePermission("accounting.journal.create") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badEntryId);
      return (
        (await deleteEntry(id, request.user?.id)) ??
        reply.code(404).send(entryNotFound)
      );
    },
  );

  app.post(
    "/journal/:id/post",
    { preHandler: requirePermission("accounting.journal.post") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badEntryId);
      return (
        (await postEntry(id, request.user?.id)) ??
        reply.code(404).send(entryNotFound)
      );
    },
  );

  app.post(
    "/journal/:id/reverse",
    { preHandler: requirePermission("accounting.journal.reverse") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badEntryId);
      const reversal = await reverseJournalEntry(
        id,
        journalReverseSchema.parse(request.body),
        request.user?.id,
      );
      return reversal
        ? reply.code(201).send(reversal)
        : reply.code(404).send(entryNotFound);
    },
  );

  // ─── Closed months ────────────────────────────────────────────────────
  app.get(
    "/periods",
    { preHandler: requirePermission("accounting.read") },
    async () => listPeriods(),
  );

  app.post(
    "/periods",
    { preHandler: requirePermission("accounting.periods.manage") },
    async (request, reply) => {
      const input = periodSchema.parse(request.body);
      return reply
        .code(201)
        .send(
          await closeAccountingPeriod(
            input.period,
            input.notes,
            request.user?.id,
          ),
        );
    },
  );

  app.delete(
    "/periods/:period",
    { preHandler: requirePermission("accounting.periods.manage") },
    async (request) => {
      const { period } = periodSchema.parse(request.params);
      return reopenAccountingPeriod(period, request.user?.id);
    },
  );
};
