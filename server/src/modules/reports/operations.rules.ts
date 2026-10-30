/**
 * The pure rules of the operational reports: rates, medians and the
 * buckets listings and requests are counted in. The formulas are written
 * down in docs/REPORTS.md.
 */

/** A share as a percentage to one decimal; null when there is nothing to divide. */
export function rate(part: number, whole: number) {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** The median of some numbers (the mean of the middle two when even). */
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2
      ? sorted[middle]!
      : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return Math.round(value * 10) / 10;
}

export function average(values: number[]) {
  if (!values.length) return null;
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10
  );
}

/** How long available listings have been on offer, in days since added. */
export const AGE_BUCKETS = [
  { key: "days_0_30", max: 30 },
  { key: "days_31_90", max: 90 },
  { key: "days_91_180", max: 180 },
  { key: "days_181_365", max: 365 },
  { key: "over_365", max: Infinity },
] as const;
export type AgeKey = (typeof AGE_BUCKETS)[number]["key"];
export const ageBucket = (days: number) =>
  AGE_BUCKETS.find((bucket) => days <= bucket.max)!.key;

/**
 * Price bands in dinars: a sale listing's total price and a purchase
 * request's top budget; a rental's monthly rent and a rental request's top
 * budget. Each band holds its lower bound and not its upper one.
 */
export const PRICE_BANDS = {
  sale: [0, 100_000_000, 200_000_000, 300_000_000, 500_000_000, 1_000_000_000],
  rental: [0, 500_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000],
} as const;

/** The upper bound of the band that starts at `lower`, or null for the last. */
export function bandEnd(kind: "sale" | "rental", lower: number) {
  const bands = PRICE_BANDS[kind] as readonly number[];
  const index = bands.indexOf(lower);
  return index >= 0 && index < bands.length - 1 ? bands[index + 1]! : null;
}
