import {
  RENT_PERIOD_LABELS,
  RENTAL_PROPERTY_LABELS,
} from "../constants/domain";
import type { OperationsKind } from "../types";
import { formatMoney, formatNumber } from "./format";

/** نوع العقار للعرض: أنواع الإيجار رموز إنجليزية، وأنواع البيع عربية أصلاً. */
export function propertyTypeText(kind: OperationsKind, value: string) {
  return kind === "rental" ? (RENTAL_PROPERTY_LABELS[value] ?? value) : value;
}

export function locationText(
  ...parts: Array<string | null | undefined>
): string {
  return parts.filter((part) => part && part.trim()).join(" · ");
}

export function moneyText(value: number | null | undefined) {
  return value === null || value === undefined
    ? "—"
    : `${formatMoney(value)} د.ع`;
}

/** سعر العرض، والإيجار مع مدته. */
export function priceText(
  kind: OperationsKind,
  price: number,
  rentPeriod?: string | null,
) {
  const money = moneyText(price);
  if (kind === "sale" || !rentPeriod) return money;
  return `${money} / ${RENT_PERIOD_LABELS[rentPeriod] ?? rentPeriod}`;
}

/** ميزانية الطلب: "حتى ٠"، "من ٠"، "٠ – ٠"، أو null بلا ميزانية. */
export function budgetText(min: number | null, max: number | null) {
  if (min === null && max === null) return null;
  if (min === null) return `حتى ${moneyText(max)}`;
  if (max === null) return `من ${moneyText(min)}`;
  return `${formatMoney(min)} – ${moneyText(max)}`;
}

export function areaRangeText(
  min: number | null,
  max: number | null,
  unit: string | null,
) {
  if (min === null && max === null) return null;
  const suffix = unit ? ` ${unit}` : "";
  if (min === null) return `حتى ${formatNumber(max)}${suffix}`;
  if (max === null) return `${formatNumber(min)}${suffix} فأكثر`;
  return `${formatNumber(min)} – ${formatNumber(max)}${suffix}`;
}

/** متطلبات العدد في الطلب: "3 غرف فأكثر · حمامان فأكثر". */
export function countsText(counts: {
  rooms_count: number | null;
  bathrooms_count: number | null;
  floors_count: number | null;
}) {
  return [
    counts.rooms_count !== null ? `غرف ${counts.rooms_count}+` : null,
    counts.bathrooms_count !== null
      ? `حمامات ${counts.bathrooms_count}+`
      : null,
    counts.floors_count !== null ? `طوابق ${counts.floors_count}+` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** ما يملكه العرض من الأعداد: "غرف 3 · حمامات 2". */
export function offerCountsText(counts: {
  rooms_count: number | null;
  bathrooms_count: number | null;
  floors_count: number | null;
}) {
  return [
    counts.rooms_count !== null ? `غرف ${counts.rooms_count}` : null,
    counts.bathrooms_count !== null ? `حمامات ${counts.bathrooms_count}` : null,
    counts.floors_count !== null ? `طوابق ${counts.floors_count}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
