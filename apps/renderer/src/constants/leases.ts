import type { LeaseFrequency, LeaseState } from "../types";

/** دوريات دفع الإيجار (LEASE_FREQUENCIES في الخادم). */
export const LEASE_FREQUENCIES: Array<{
  value: LeaseFrequency;
  title: string;
}> = [
  { value: "monthly", title: "شهري" },
  { value: "quarterly", title: "كل ثلاثة أشهر" },
  { value: "semi_annual", title: "نصف سنوي" },
  { value: "annual", title: "سنوي" },
];

/** «750,000 د.ع شهرياً»: البدل لكل فترة من دوريته. */
const PER_PERIOD: Record<LeaseFrequency, string> = {
  monthly: "شهرياً",
  quarterly: "كل ثلاثة أشهر",
  semi_annual: "كل ستة أشهر",
  annual: "سنوياً",
};

/** أين يقف الإيجار اليوم بحسب تاريخيه. */
export const LEASE_STATES: Array<{
  value: LeaseState;
  title: string;
  color: string;
}> = [
  { value: "current", title: "سارٍ", color: "success" },
  { value: "upcoming", title: "لم يبدأ", color: "info" },
  { value: "ended", title: "منتهٍ", color: "default" },
  { value: "terminated", title: "أُنهي مبكراً", color: "warning" },
  { value: "renewed", title: "مجدَّد", color: "secondary" },
  { value: "cancelled", title: "ملغى", color: "error" },
];

export const leaseFrequencyLabel = (value: string) =>
  LEASE_FREQUENCIES.find((item) => item.value === value)?.title ?? value;
export const leasePerPeriod = (value: string) =>
  PER_PERIOD[value as LeaseFrequency] ?? "";
export const leaseStateOf = (value: string) =>
  LEASE_STATES.find((item) => item.value === value) ?? {
    value,
    title: value,
    color: "default",
  };

/** «قسط واحد»، «قسطان»، «3 أقساط»، «12 قسطاً». */
export function installmentCount(count: number) {
  if (count === 1) return "قسط واحد";
  if (count === 2) return "قسطان";
  const tens = count % 100;
  return tens >= 3 && tens <= 10 ? `${count} أقساط` : `${count} قسطاً`;
}
