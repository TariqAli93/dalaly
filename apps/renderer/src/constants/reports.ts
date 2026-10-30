import type { AgingKey } from "../types";

/**
 * التقارير المالية وأسماؤها: كل تقرير يُقرأ لمدة (من … إلى) أو في يوم
 * واحد، ومعادلاته في docs/REPORTS.md.
 */
export type FinancialReportKey =
  | "trial-balance"
  | "income-statement"
  | "balance-sheet"
  | "cash-flow"
  | "commissions"
  | "receivables"
  | "payables"
  | "ledger";

export const FINANCIAL_REPORTS: Array<{
  value: FinancialReportKey;
  title: string;
  icon: string;
  /** period: من وإلى؛ day: في يوم. */
  span: "period" | "day";
}> = [
  {
    value: "income-statement",
    title: "الإيرادات والمصروفات",
    icon: "mdi-chart-line",
    span: "period",
  },
  {
    value: "balance-sheet",
    title: "الميزانية العمومية",
    icon: "mdi-scale-balance",
    span: "day",
  },
  {
    value: "cash-flow",
    title: "التدفق النقدي",
    icon: "mdi-cash-sync",
    span: "period",
  },
  {
    value: "commissions",
    title: "العمولات",
    icon: "mdi-percent-circle-outline",
    span: "period",
  },
  {
    value: "receivables",
    title: "الذمم المدينة",
    icon: "mdi-account-arrow-left-outline",
    span: "day",
  },
  {
    value: "payables",
    title: "الذمم الدائنة",
    icon: "mdi-account-arrow-right-outline",
    span: "day",
  },
  {
    value: "trial-balance",
    title: "ميزان المراجعة",
    icon: "mdi-format-list-numbered",
    span: "period",
  },
  {
    value: "ledger",
    title: "دفتر حساب",
    icon: "mdi-book-open-page-variant-outline",
    span: "period",
  },
];

export const financialReportOf = (value: string) =>
  FINANCIAL_REPORTS.find((item) => item.value === value) ??
  FINANCIAL_REPORTS[0];

/** أعمار الذمة بالأيام منذ قيدها. */
export const AGING_LABELS: Record<AgingKey, string> = {
  current: "حتى 30 يوماً",
  days_31_60: "31–60 يوماً",
  days_61_90: "61–90 يوماً",
  over_90: "أكثر من 90 يوماً",
};

/** من يدفع العمولة في الصفقة، بحسب نوعها. */
export function payerRoleLabel(role: string, dealType: string) {
  if (dealType === "rent") return role === "owner" ? "المؤجر" : "المستأجر";
  return role === "owner" ? "البائع" : "المشتري";
}
