import { LEASE_FREQUENCIES } from "../../infrastructure/database/schema.js";
import { fromMinor, parseMoney, toMinor } from "../../shared/money.js";

/**
 * A lease's schedule, from its terms alone: pure date and money arithmetic,
 * no database. Dates are YYYY-MM-DD days (no time zone); amounts are decimal
 * strings, computed in bigint minor units.
 */

export { LEASE_FREQUENCIES };
export type LeaseFrequency = (typeof LEASE_FREQUENCIES)[number];

export const FREQUENCY_MONTHS: Record<LeaseFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
};

/** Thirty years of monthly rent. */
export const MAX_INSTALLMENTS = 360;

const DAY = 86_400_000;
const dayOf = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) / DAY;
};
const isoOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

export const isIsoDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && isoOf(dayOf(value)) === value;

export const addDays = (iso: string, days: number) => isoOf(dayOf(iso) + days);

/** The same day `months` later, or that month's last day (31 Jan → 28 Feb). */
export function addMonths(iso: string, months: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const index = month! - 1 + months;
  const y = year! + Math.floor(index / 12);
  const m = ((index % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return isoOf(Date.UTC(y, m, Math.min(day!, last)) / DAY);
}

/** Days from `from` to `to`, both counted. */
const daysCovered = (from: string, to: string) => dayOf(to) - dayOf(from) + 1;

/** `amount × part / whole`, rounded half up to the fils or cent. */
function share(amount: string, part: number, whole: number) {
  const minor = toMinor(amount) * BigInt(part) * 2n + BigInt(whole);
  return fromMinor(minor / (2n * BigInt(whole)));
}

export type Installment = {
  seq: number;
  due_date: string;
  period_start: string;
  period_end: string;
  amount: string;
  /** False for a period the end date cuts short. */
  full: boolean;
};

/**
 * One installment per period of `frequency` from the start date, each due
 * on its period's first day (rent is paid in advance). Periods are counted
 * from the start, so a lease from 31 January has periods from 28 February,
 * 31 March and so on. The end date is the lease's last day:
 * - a period it cuts short pays its share of the rent by days, half up;
 * - an end date that falls on an anniversary of the start ("from 1/1/2026
 *   to 1/1/2027") closes the last period instead of adding one day.
 */
export function leaseSchedule(input: {
  startDate: string;
  endDate: string;
  frequency: LeaseFrequency;
  rent: string;
}): { installments: Installment[] } | { error: string } {
  const { startDate, endDate, frequency, rent } = input;
  if (!isIsoDate(startDate) || !isIsoDate(endDate))
    return { error: "التاريخ بصيغة YYYY-MM-DD." };
  if (dayOf(endDate) <= dayOf(startDate))
    return { error: "تاريخ انتهاء الإيجار يجب أن يكون بعد تاريخ بدئه." };
  if (parseMoney(rent) === null || toMinor(rent) <= 0n)
    return { error: "بدل الإيجار مبلغ موجب بمرتبتين عشريتين على الأكثر." };
  const months = FREQUENCY_MONTHS[frequency];
  if (!months) return { error: "دورية الدفع غير معروفة." };

  const installments: Installment[] = [];
  for (let k = 0; ; k += 1) {
    const periodStart = addMonths(startDate, k * months);
    if (dayOf(periodStart) > dayOf(endDate)) break;
    // The end date is the next period's first day: the lease ends there.
    if (k > 0 && periodStart === endDate) break;
    const fullEnd = addDays(addMonths(startDate, (k + 1) * months), -1);
    const periodEnd = dayOf(fullEnd) <= dayOf(endDate) ? fullEnd : endDate;
    const full = periodEnd === fullEnd;
    const amount = full
      ? fromMinor(toMinor(rent))
      : share(
          rent,
          daysCovered(periodStart, periodEnd),
          daysCovered(periodStart, fullEnd),
        );
    if (installments.length >= MAX_INSTALLMENTS)
      return {
        error: `مدة الإيجار أطول مما يُجدول (${MAX_INSTALLMENTS} قسطاً على الأكثر).`,
      };
    // A day or two of a tiny rent can round to nothing: nothing is due.
    if (toMinor(amount) > 0n)
      installments.push({
        seq: installments.length + 1,
        due_date: periodStart,
        period_start: periodStart,
        period_end: periodEnd,
        amount,
        full,
      });
  }
  return { installments };
}

/** The rent contract's terms the lease takes, as the contract stores them. */
export type RentTerms = {
  currency: "IQD" | "USD";
  rent_amount: number | null;
  rent_period: string;
  start_date: string | null;
  end_date: string | null;
  deposit: number | null;
};

/** A contract's amount (a number) as a decimal string, or null if unusable. */
const termMoney = (value: number | null) =>
  value === null || !Number.isFinite(value) || value < 0
    ? null
    : parseMoney(value.toFixed(2));

/**
 * What a lease takes from an issued rent contract's terms, or why it cannot
 * be activated from them.
 */
export function leaseTermsOf(terms: RentTerms):
  | {
      currency: "IQD" | "USD";
      rent: string;
      frequency: LeaseFrequency;
      startDate: string;
      endDate: string;
      deposit: string | null;
    }
  | { error: string } {
  const rent = termMoney(terms.rent_amount);
  if (!rent || toMinor(rent) <= 0n) return { error: "العقد بلا بدل إيجار." };
  if (!terms.start_date || !terms.end_date)
    return { error: "العقد بلا تاريخ بدء أو انتهاء." };
  const frequency = terms.rent_period as LeaseFrequency;
  if (!(frequency in FREQUENCY_MONTHS))
    return { error: "دورية الإيجار في العقد غير معروفة." };
  const deposit = terms.deposit ? termMoney(terms.deposit) : null;
  return {
    currency: terms.currency,
    rent,
    frequency,
    startDate: terms.start_date,
    endDate: terms.end_date,
    deposit: deposit && toMinor(deposit) > 0n ? deposit : null,
  };
}

export type LeaseState =
  "upcoming" | "current" | "ended" | "terminated" | "renewed" | "cancelled";

/**
 * Where a lease stands on `today`: cancelled, ended early or renewed as its
 * status says, else before, during or after its dates.
 */
export function leaseState(
  lease: { status: string; startDate: string; endDate: string },
  today: string,
): LeaseState {
  if (
    lease.status === "cancelled" ||
    lease.status === "terminated" ||
    lease.status === "renewed"
  )
    return lease.status;
  if (dayOf(today) < dayOf(lease.startDate)) return "upcoming";
  if (dayOf(today) > dayOf(lease.endDate)) return "ended";
  return "current";
}

export type InstallmentState =
  "upcoming" | "due" | "overdue" | "paid" | "released";

/**
 * Where an installment stands on `today`. One due after a termination date
 * is released. Payments are tracked only where the office collects the
 * rent; otherwise an installment is upcoming or due by its date alone. A
 * partly paid installment past its day is overdue for what is left.
 */
export function installmentState(
  installment: {
    dueDate: string;
    amount: string;
    paid: string;
    officeCollects: boolean;
    terminationDate: string | null;
  },
  today: string,
): InstallmentState {
  if (
    installment.terminationDate &&
    dayOf(installment.dueDate) > dayOf(installment.terminationDate)
  )
    return "released";
  if (
    installment.officeCollects &&
    toMinor(installment.paid) >= toMinor(installment.amount)
  )
    return "paid";
  const due = dayOf(installment.dueDate);
  if (due > dayOf(today)) return "upcoming";
  if (!installment.officeCollects || due === dayOf(today)) return "due";
  return "overdue";
}

/** What is left on an installment, never below zero. */
export function installmentLeft(amount: string, paid: string) {
  const left = toMinor(amount) - toMinor(paid);
  return fromMinor(left > 0n ? left : 0n);
}

/**
 * Why a lease cannot be ended early on `date`, or null: it must be in force
 * (not cancelled, terminated or renewed), the date inside its term, and no
 * installment due after that day already paid (that money is returned first).
 */
export function terminationError(
  lease: { status: string; startDate: string; endDate: string },
  date: string,
  paidAfter: number,
): string | null {
  if (lease.status !== "active")
    return "يُنهى الإيجار الساري فقط؛ هذا الإيجار ملغى أو منتهٍ أو مجدَّد.";
  if (!isIsoDate(date)) return "التاريخ بصيغة YYYY-MM-DD.";
  if (
    dayOf(date) < dayOf(lease.startDate) ||
    dayOf(date) >= dayOf(lease.endDate)
  )
    return "تاريخ الإنهاء بين بدء الإيجار وقبل آخر يوم فيه.";
  if (paidAfter > 0)
    return "قُبض قسط يُستحق بعد تاريخ الإنهاء؛ ألغِ سنده أو أعِد المبلغ أولاً.";
  return null;
}

/** A renewal starts the day after the lease it renews ends. */
export const renewalStart = (endDate: string) => addDays(endDate, 1);
