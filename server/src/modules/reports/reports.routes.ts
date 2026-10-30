import { type FastifyPluginAsync } from "fastify";
import { requirePermission } from "../auth/auth.hooks.js";
import { parseId } from "../../shared/utils/parse-id.js";
import { accountStatementQuerySchema } from "../accounting/journal.schema.js";
import {
  accountLedger,
  balanceSheet,
  cashFlow,
  commissionsReport,
  incomeStatement,
  payables,
  receivables,
  trialBalance,
} from "./reports.repository.js";
import {
  asOfQuerySchema,
  commissionsReportQuerySchema,
  incomeStatementQuerySchema,
  periodQuerySchema,
} from "./reports.schema.js";

/**
 * Reports (/api/reports): read-only, each behind its permission. The
 * financial ones read the posted journal; see docs/REPORTS.md.
 */
export const reportsRoutes: FastifyPluginAsync = async (app) => {
  const financial = { preHandler: requirePermission("reports.financial") };

  app.get("/financial/trial-balance", financial, async (request) =>
    trialBalance(periodQuerySchema.parse(request.query)),
  );
  app.get("/financial/income-statement", financial, async (request) =>
    incomeStatement(incomeStatementQuerySchema.parse(request.query)),
  );
  app.get("/financial/balance-sheet", financial, async (request) =>
    balanceSheet(asOfQuerySchema.parse(request.query)),
  );
  app.get("/financial/cash-flow", financial, async (request) =>
    cashFlow(periodQuerySchema.parse(request.query)),
  );
  app.get("/financial/commissions", financial, async (request) =>
    commissionsReport(commissionsReportQuerySchema.parse(request.query)),
  );
  app.get("/financial/receivables", financial, async (request) =>
    receivables(asOfQuerySchema.parse(request.query)),
  );
  app.get("/financial/payables", financial, async (request) =>
    payables(asOfQuerySchema.parse(request.query)),
  );

  /** One account's lines and running balance: the cash and bank ledgers. */
  app.get("/financial/ledger/:id", financial, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (!id) return reply.code(400).send({ message: "معرّف الحساب غير صحيح." });
    return (
      (await accountLedger(
        id,
        accountStatementQuerySchema.parse(request.query),
      )) ?? reply.code(404).send({ message: "الحساب غير موجود." })
    );
  });
};
