import type {
  AccountStatement,
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

/** The financial reports (reports.financial); see docs/REPORTS.md. */

function buildQuery(filters: Record<string, string | number | undefined>) {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return query.toString() ? `?${query}` : "";
}

export function getTrialBalance(query: ReportPeriodQuery) {
  return request<TrialBalanceReport>(
    `/reports/financial/trial-balance${buildQuery({ ...query })}`,
  );
}

export function getIncomeStatement(
  query: ReportPeriodQuery & { group?: "none" | "month" },
) {
  return request<IncomeStatementReport>(
    `/reports/financial/income-statement${buildQuery({ ...query })}`,
  );
}

export function getBalanceSheet(query: ReportAsOfQuery) {
  return request<BalanceSheetReport>(
    `/reports/financial/balance-sheet${buildQuery({ ...query })}`,
  );
}

export function getCashFlow(query: ReportPeriodQuery) {
  return request<CashFlowReport>(
    `/reports/financial/cash-flow${buildQuery({ ...query })}`,
  );
}

export function getCommissionsReport(query: CommissionsReportQuery) {
  return request<CommissionsReport>(
    `/reports/financial/commissions${buildQuery({ ...query })}`,
  );
}

export function getReceivables(query: ReportAsOfQuery) {
  return request<ReceivablesReport>(
    `/reports/financial/receivables${buildQuery({ ...query })}`,
  );
}

export function getPayables(query: ReportAsOfQuery) {
  return request<PayablesReport>(
    `/reports/financial/payables${buildQuery({ ...query })}`,
  );
}

/** One account's lines and running balance (cash and bank ledgers). */
export function getAccountLedger(
  id: number,
  range: { from?: string; to?: string },
) {
  return request<AccountStatement>(
    `/reports/financial/ledger/${id}${buildQuery(range)}`,
  );
}
