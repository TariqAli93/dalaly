import type {
  AgreementSortKey,
  AgreementStatus,
  ListSortOption,
} from "../types";

export const AGREEMENT_STATUSES: Array<{
  title: string;
  value: AgreementStatus;
}> = [
  { title: "مسودة", value: "draft" },
  { title: "قيد المراجعة", value: "review" },
  { title: "صادر", value: "issued" },
  { title: "ملغى", value: "cancelled" },
];

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> =
  Object.fromEntries(
    AGREEMENT_STATUSES.map((status) => [status.value, status.title]),
  ) as Record<AgreementStatus, string>;

/** Theme roles, as statusColor in domain.ts: draft neutral, review ochre. */
export function agreementStatusColor(status: AgreementStatus) {
  return (
    {
      draft: undefined,
      review: "warning",
      issued: "primary",
      cancelled: "error",
    } as Record<AgreementStatus, string | undefined>
  )[status];
}

export const AGREEMENTS_DEFAULT_SORT: ListSortOption<AgreementSortKey> = {
  value: "updated",
  title: "آخر تعديل",
  key: "updated_at",
  order: "desc",
};

export const TEMPLATE_CHANGE_LABELS: Record<string, string> = {
  saved: "حفظ تعديلات",
  design_reset: "استعادة التصميم الافتراضي",
  full_reset: "استعادة القالب الأصلي",
  restored: "استرجاع نسخة سابقة",
};

export const EXPORT_FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  print: "طباعة",
};

/** Workflow steps of a contract, in order. */
export const AGREEMENT_STEPS = [
  { key: "parties", title: "الأطراف" },
  { key: "property", title: "العقار" },
  { key: "details", title: "التفاصيل" },
  { key: "content", title: "البنود والمحتوى" },
  { key: "review", title: "المعاينة والإصدار" },
] as const;
export type AgreementStepKey = (typeof AGREEMENT_STEPS)[number]["key"];
