import type { DealStage, DealType } from "../types";

/** مراحل الصفقة بترتيب خط سيرها؛ الثلاث الأخيرة نتائج تُغلقها. */
export const DEAL_STAGES: Array<{
  value: DealStage;
  title: string;
  color: string;
  closed?: boolean;
}> = [
  { value: "new", title: "فرصة جديدة", color: "default" },
  { value: "contacted", title: "تم التواصل", color: "info" },
  { value: "qualified", title: "مؤهلة", color: "info" },
  { value: "viewing_scheduled", title: "معاينة مجدولة", color: "primary" },
  { value: "viewing_done", title: "تمت المعاينة", color: "primary" },
  { value: "negotiating", title: "تفاوض", color: "warning" },
  { value: "agreed", title: "تم الاتفاق", color: "success" },
  { value: "contract_preparation", title: "إعداد العقد", color: "success" },
  { value: "contract_issued", title: "صدر العقد", color: "success" },
  { value: "won", title: "مكسوبة", color: "success", closed: true },
  { value: "lost", title: "خاسرة", color: "error", closed: true },
  { value: "cancelled", title: "ملغاة", color: "default", closed: true },
];

export const OPEN_DEAL_STAGES = DEAL_STAGES.filter((stage) => !stage.closed);

export function dealStageLabel(value: string) {
  return DEAL_STAGES.find((stage) => stage.value === value)?.title ?? value;
}
export function dealStageColor(value: string) {
  return DEAL_STAGES.find((stage) => stage.value === value)?.color ?? "default";
}
export const isClosedDealStage = (value: string) =>
  DEAL_STAGES.some((stage) => stage.value === value && stage.closed);

export const DEAL_TYPES: Array<{ value: DealType; title: string }> = [
  { value: "sale", title: "بيع" },
  { value: "rent", title: "إيجار" },
];
export function dealTypeLabel(value: string) {
  return DEAL_TYPES.find((type) => type.value === value)?.title ?? value;
}

/** طرفا الصفقة بحسب نوعها. */
export function dealPartyLabels(type: DealType) {
  return type === "sale"
    ? { client: "المشتري", owner: "البائع" }
    : { client: "المستأجر", owner: "المؤجر" };
}
