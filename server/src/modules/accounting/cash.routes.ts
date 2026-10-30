import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { parseId } from "../../shared/utils/parse-id.js";
import { getTransfer, listTransfersPage } from "./cash.repository.js";
import {
  balancesQuerySchema,
  expenseCategorySchema,
  reconciliationPayloadSchema,
  reconciliationQuerySchema,
  transferPageQuerySchema,
  transferPayloadSchema,
  transferVoidSchema,
} from "./cash.schema.js";
import {
  createExpenseCategory,
  createReconciliation,
  createTransfer,
  listExpenseCategories,
  listReconciliations,
  updateExpenseCategory,
  voidTransfer,
} from "./cash.service.js";
import { listMoneyAccounts } from "./vouchers.repository.js";

const notFound = { message: "التحويل غير موجود." };
const badId = { message: "المعرّف غير صحيح." };

/** Cash and bank: balances, transfers, reconciliations (/api/cash). */
export const cashRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/balances",
    { preHandler: requirePermission("cash.read") },
    async (request) =>
      listMoneyAccounts(balancesQuerySchema.parse(request.query).as_of),
  );

  app.get(
    "/transfers/paged",
    { preHandler: requirePermission("cash.read") },
    async (request) =>
      listTransfersPage(transferPageQuerySchema.parse(request.query)),
  );

  app.get(
    "/transfers/:id",
    { preHandler: requirePermission("cash.read") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      return (await getTransfer(id)) ?? reply.code(404).send(notFound);
    },
  );

  app.post(
    "/transfers",
    { preHandler: requirePermission("cash.manage") },
    async (request, reply) => {
      const id = await createTransfer(
        transferPayloadSchema.parse(request.body),
        request.user?.id,
      );
      return reply.code(201).send(await getTransfer(id));
    },
  );

  app.post(
    "/transfers/:id/void",
    { preHandler: requirePermission("cash.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const done = await voidTransfer(
        id,
        transferVoidSchema.parse(request.body),
        request.user?.id,
      );
      return done ? await getTransfer(id) : reply.code(404).send(notFound);
    },
  );

  app.get(
    "/reconciliations",
    { preHandler: requirePermission("cash.read") },
    async (request) =>
      listReconciliations(
        reconciliationQuerySchema.parse(request.query).account_id,
      ),
  );

  app.post(
    "/reconciliations",
    { preHandler: requirePermission("cash.manage") },
    async (request, reply) => {
      const id = await createReconciliation(
        reconciliationPayloadSchema.parse(request.body),
        request.user?.id,
      );
      const [row] = (await listReconciliations()).filter(
        (item) => item.id === id,
      );
      return reply.code(201).send(row);
    },
  );
};

/** Expense categories (/api/expense-categories). */
export const expenseCategoriesRoutes: FastifyPluginAsync = async (app) => {
  // Whoever issues vouchers picks a category; whoever manages them edits it.
  app.get("/", { preHandler: requirePermission("vouchers.read") }, async () =>
    listExpenseCategories(),
  );

  app.post(
    "/",
    { preHandler: requirePermission("expenses.manage") },
    async (request, reply) => {
      const id = await createExpenseCategory(
        expenseCategorySchema.parse(request.body),
        request.user?.id,
      );
      return reply
        .code(201)
        .send((await listExpenseCategories()).find((row) => row.id === id));
    },
  );

  app.put(
    "/:id",
    { preHandler: requirePermission("expenses.manage") },
    async (request, reply) => {
      const id = parseId((request.params as { id: string }).id);
      if (!id) return reply.code(400).send(badId);
      const done = await updateExpenseCategory(
        id,
        expenseCategorySchema.parse(request.body),
        request.user?.id,
      );
      return done
        ? (await listExpenseCategories()).find((row) => row.id === id)
        : reply.code(404).send({ message: "التصنيف غير موجود." });
    },
  );
};
