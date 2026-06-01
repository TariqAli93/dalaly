import { type PricingMethod } from "../constants/domain.js";

export function calculateTotalPrice(input: {
  area_value: number;
  pricing_method: PricingMethod;
  unit_price?: number | null;
  total_price?: number | null;
}): number {
  if (input.pricing_method === "سعر إجمالي مباشر") {
    return normalizeMoney(input.total_price);
  }

  return normalizeMoney(input.area_value * Number(input.unit_price ?? 0));
}

function normalizeMoney(value: number | null | undefined): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.round(numericValue * 100) / 100;
}
