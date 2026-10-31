import type {
  AccountStatement,
  CustomersReport,
  CustomersReportQuery,
  DealsReport,
  DealsReportQuery,
  LeasesReport,
  LeasesReportQuery,
  ListingsReport,
  ListingsReportQuery,
  BalanceSheetReport,
  CashFlowReport,
  CommissionsReport,
  CommissionsReportQuery,
  IncomeStatementReport,
  PayablesReport,
  ReceivablesReport,
  ReportAsOfQuery,
  ReportPeriodQuery,
  TrialBalanceReport,
} from "../types";
import { request } from "./api.service";
import { queryString } from "../utils/query";

/** The financial reports (reports.financial); see docs/REPORTS.md. */

export function getTrialBalance(query: ReportPeriodQuery) {
  return request<TrialBalanceReport>(
    `/reports/financial/trial-balance${queryString({ ...query })}`,
  );
}

export function getIncomeStatement(
  query: ReportPeriodQuery & { group?: "none" | "month" },
) {
  return request<IncomeStatementReport>(
    `/reports/financial/income-statement${queryString({ ...query })}`,
  );
}

export function getBalanceSheet(query: ReportAsOfQuery) {
  return request<BalanceSheetReport>(
    `/reports/financial/balance-sheet${queryString({ ...query })}`,
  );
}

export function getCashFlow(query: ReportPeriodQuery) {
  return request<CashFlowReport>(
    `/reports/financial/cash-flow${queryString({ ...query })}`,
  );
}

export function getCommissionsReport(query: CommissionsReportQuery) {
  return request<CommissionsReport>(
    `/reports/financial/commissions${queryString({ ...query })}`,
  );
}

export function getReceivables(query: ReportAsOfQuery) {
  return request<ReceivablesReport>(
    `/reports/financial/receivables${queryString({ ...query })}`,
  );
}

export function getPayables(query: ReportAsOfQuery) {
  return request<PayablesReport>(
    `/reports/financial/payables${queryString({ ...query })}`,
  );
}

/** One account's lines and running balance (cash and bank ledgers). */
export function getAccountLedger(
  id: number,
  range: { from?: string; to?: string },
) {
  return request<AccountStatement>(
    `/reports/financial/ledger/${id}${queryString(range)}`,
  );
}

// ─── Operational (reports.operations and each area's read permission) ───

export function getDealsReport(query: DealsReportQuery) {
  return request<DealsReport>(
    `/reports/operations/deals${queryString({ ...query })}`,
  );
}

export function getCustomersReport(query: CustomersReportQuery) {
  return request<CustomersReport>(
    `/reports/operations/customers${queryString({ ...query })}`,
  );
}

export function getListingsReport(query: ListingsReportQuery) {
  return request<ListingsReport>(
    `/reports/operations/listings${queryString({ ...query })}`,
  );
}

export function getLeasesReport(query: LeasesReportQuery) {
  return request<LeasesReport>(
    `/reports/operations/leases${queryString({ ...query })}`,
  );
}
