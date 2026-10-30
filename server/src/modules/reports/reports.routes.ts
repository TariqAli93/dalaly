import { type FastifyPluginAsync, type FastifyRequest } from "fastify";
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
  customersReport,
  dealsReport,
  leasesReport,
  listingsReport,
} from "./operations.repository.js";
import {
  asOfQuerySchema,
  commissionsReportQuerySchema,
  customersReportQuerySchema,
  dealsReportQuerySchema,
  incomeStatementQuerySchema,
  leasesReportQuerySchema,
  listingsReportQuerySchema,
  periodQuerySchema,
} from "./reports.schema.js";

const granted = (request: FastifyRequest, key: string) =>
  Boolean(
    request.user?.permissions.some((permission) => permission.key === key),
  );

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

  // ─── Operational: reports.operations and the area's own read permission.
  const operations = (key: string) => ({
    preHandler: [
      requirePermission("reports.operations"),
      requirePermission(key),
    ],
  });
  app.get("/operations/deals", operations("deals.read"), async (request) =>
    dealsReport(dealsReportQuerySchema.parse(request.query)),
  );
  app.get("/operations/customers", operations("people.read"), async (request) =>
    customersReport(customersReportQuerySchema.parse(request.query), {
      requests: granted(request, "requests.read"),
    }),
  );
  /** Sale listings need properties.read; rental listings rentals.read. */
  app.get(
    "/operations/listings",
    { preHandler: requirePermission("reports.operations") },
    async (request, reply) => {
      const query = listingsReportQuerySchema.parse(request.query);
      if (
        !granted(
          request,
          query.kind === "sale" ? "properties.read" : "rentals.read",
        )
      )
        return reply
          .code(403)
          .send({ message: "ليست لديك صلاحية تنفيذ هذه العملية." });
      return listingsReport(query, {
        requests: granted(request, "requests.read"),
      });
    },
  );
  app.get("/operations/leases", operations("leases.read"), async (request) =>
    leasesReport(leasesReportQuerySchema.parse(request.query)),
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
