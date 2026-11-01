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

/** تقارير العمل: كل تقرير بصلاحية عرض مجاله فوق reports.operations. */
export type OperationsReportKey =
  "deals" | "customers" | "sale-listings" | "rental-listings" | "leases";

export const OPERATIONS_REPORTS: Array<{
  value: OperationsReportKey;
  title: string;
  icon: string;
  permission: string;
}> = [
  {
    value: "deals",
    title: "الصفقات",
    icon: "mdi-handshake-outline",
    permission: "deals.read",
  },
  {
    value: "customers",
    title: "الزبائن",
    icon: "mdi-account-group-outline",
    permission: "people.read",
  },
  {
    value: "sale-listings",
    title: "عروض البيع",
    icon: "mdi-home-city-outline",
    permission: "properties.read",
  },
  {
    value: "rental-listings",
    title: "عروض الإيجار",
    icon: "mdi-key-chain",
    permission: "rentals.read",
  },
  {
    value: "leases",
    title: "الإيجارات السارية",
    icon: "mdi-home-clock-outline",
    permission: "leases.read",
  },
];

/** عمر العرض المتاح بالأيام منذ إضافته. */
export const LISTING_AGE_LABELS: Record<string, string> = {
  days_0_30: "حتى 30 يوماً",
  days_31_90: "31–90 يوماً",
  days_91_180: "91–180 يوماً",
  days_181_365: "181–365 يوماً",
  over_365: "أكثر من سنة",
};

/** أي تقرير في صفحة التقارير الواحدة: مالي أو تقرير عمل. */
export type ReportKey = FinancialReportKey | OperationsReportKey;

export type ReportCategory =
  "listings" | "deals" | "leases" | "money" | "customers";

/**
 * تصنيفات صفحة التقارير (شريط واحد، لا تبويبات متداخلة). تصنيف بأكثر من تقرير
 * يختار تقريره من قائمة «التقرير» في شريط الفلاتر؛ أولها هو الافتراضي.
 */
export const REPORT_CATEGORIES: Array<{
  value: ReportCategory;
  title: string;
  icon: string;
  reports: ReportKey[];
}> = [
  {
    value: "listings",
    title: "العقارات",
    icon: "mdi-home-city-outline",
    reports: ["sale-listings", "rental-listings"],
  },
  {
    value: "deals",
    title: "الصفقات",
    icon: "mdi-handshake-outline",
    reports: ["deals"],
  },
  {
    value: "leases",
    title: "الإيجارات",
    icon: "mdi-home-clock-outline",
    reports: ["leases"],
  },
  {
    value: "money",
    title: "العمولات والحسابات",
    icon: "mdi-percent-circle-outline",
    reports: [
      "commissions",
      "income-statement",
      "cash-flow",
      "receivables",
      "payables",
      "balance-sheet",
      "trial-balance",
      "ledger",
    ],
  },
  {
    value: "customers",
    title: "الزبائن",
    icon: "mdi-account-group-outline",
    reports: ["customers"],
  },
];

export function reportCategoryOf(report: string): ReportCategory {
  return (
    REPORT_CATEGORIES.find((category) =>
      category.reports.includes(report as ReportKey),
    )?.value ?? "deals"
  );
}

/** Its title, and the keys that let the user open it. */
export function reportSpec(report: ReportKey): {
  title: string;
  icon: string;
  permissions: string[];
  financial: boolean;
} {
  const operations = OPERATIONS_REPORTS.find((item) => item.value === report);
  if (operations)
    return {
      title: operations.title,
      icon: operations.icon,
      permissions: ["reports.operations", operations.permission],
      financial: false,
    };
  const financial = financialReportOf(report);
  return {
    title: financial.title,
    icon: financial.icon,
    permissions: ["reports.financial"],
    financial: true,
  };
}
