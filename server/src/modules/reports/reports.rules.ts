import { fromMinor, toMinor } from "../../shared/money.js";

/**
 * The pure rules of the financial reports: the office's today, the default
 * period, and how receivables are aged. Every amount is exact (bigint minor
 * units, shared/money.ts). The formulas are written down in docs/REPORTS.md.
 */

const OFFICE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Baghdad",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today in the office's time zone (Baghdad), as YYYY-MM-DD. */
export const officeToday = (now = new Date()) => OFFICE_DATE.format(now);

/**
 * A report's period: `to` defaults to the office's today and `from` to the
 * first day of `to`'s year (the year to date).
 */
export function reportPeriod(
  input: { from?: string; to?: string },
  today = officeToday(),
) {
  const to = input.to ?? today;
  return { from: input.from ?? `${to.slice(0, 4)}-01-01`, to };
}

/** Whole days from one ISO date to a later one. */
export function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/** The month of an ISO date: "2026-10". */
export const monthOf = (date: string) => date.slice(0, 7);

/** Every month from one ISO date's to another's, in order. */
export function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const last = monthOf(to);
  for (;;) {
    const current = `${year}-${String(month).padStart(2, "0")}`;
    if (current > last) break;
    months.push(current);
    if (++month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** The age buckets of a receivable, in days since it was charged. */
export const AGING_BUCKETS = [
  { key: "current", max: 30 },
  { key: "days_31_60", max: 60 },
  { key: "days_61_90", max: 90 },
  { key: "over_90", max: Infinity },
] as const;
export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];
export type Aging = Record<AgingKey, string> & { total: string };

/** One posted line on a receivable account, oldest first. */
export interface ReceivableLine {
  date: string;
  debit: string;
  credit: string;
}

/**
 * Ages what a customer owes: each charge (a debit) is settled by the
 * payments and credits that follow, oldest charge first, and what is left
 * of each is counted in the bucket of its age on `asOf`. Credits beyond
 * every charge (an overpayment) stay as a negative amount in "current", so
 * the buckets always add up to the balance.
 */
export function ageReceivable(lines: ReceivableLine[], asOf: string): Aging {
  const open: Array<{ date: string; left: bigint }> = [];
  let credit = 0n;
  for (const line of lines) {
    const debit = toMinor(line.debit);
    if (debit > 0n) open.push({ date: line.date, left: debit });
    credit += toMinor(line.credit);
    // Settle the oldest charges with what has been paid so far.
    while (credit > 0n && open.length) {
      const oldest = open[0]!;
      const taken = oldest.left < credit ? oldest.left : credit;
      oldest.left -= taken;
      credit -= taken;
      if (oldest.left === 0n) open.shift();
    }
  }
  const buckets = new Map<AgingKey, bigint>(
    AGING_BUCKETS.map((bucket) => [bucket.key, 0n]),
  );
  for (const charge of open) {
    const age = daysBetween(charge.date, asOf);
    const bucket = AGING_BUCKETS.find((item) => age <= item.max)!;
    buckets.set(bucket.key, buckets.get(bucket.key)! + charge.left);
  }
  // An overpayment: what was paid beyond every charge.
  buckets.set("current", buckets.get("current")! - credit);
  const total = [...buckets.values()].reduce((sum, value) => sum + value, 0n);
  return {
    current: fromMinor(buckets.get("current")!),
    days_31_60: fromMinor(buckets.get("days_31_60")!),
    days_61_90: fromMinor(buckets.get("days_61_90")!),
    over_90: fromMinor(buckets.get("over_90")!),
    total: fromMinor(total),
  };
}

/** The sum of decimal strings, exactly. */
export function sumOf(values: Iterable<string>) {
  let total = 0n;
  for (const value of values) total += toMinor(value);
  return fromMinor(total);
}
