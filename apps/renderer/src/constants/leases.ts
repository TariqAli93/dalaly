import type {
  LeaseFrequency,
  LeaseInstallmentRecord,
  LeaseState,
} from "../types";

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
  // محايد كالمنتهي: إيجار أُغلق بتجديده. "secondary" لون سطح فاتح فكانت
  // الشريحة غير مقروءة في الوضعين.
  { value: "renewed", title: "مجدَّد", color: "default" },
  { value: "cancelled", title: "ملغى", color: "error" },
];

/** حال القسط: يُتابع الدفع حيث يقبض المكتب الإيجار. */
export const INSTALLMENT_STATES: Array<{
  value: LeaseInstallmentRecord["state"];
  title: string;
  color: string;
}> = [
  { value: "paid", title: "مدفوع", color: "success" },
  { value: "overdue", title: "متأخر", color: "error" },
  { value: "due", title: "حلّ موعده", color: "warning" },
  { value: "upcoming", title: "قادم", color: "default" },
  { value: "released", title: "سقط بالإنهاء", color: "default" },
];

export const leaseFrequencyLabel = (value: string) =>
  LEASE_FREQUENCIES.find((item) => item.value === value)?.title ?? value;
export const leasePerPeriod = (value: string) =>
  PER_PERIOD[value as LeaseFrequency] ?? "";
export const installmentStateOf = (value: string) =>
  INSTALLMENT_STATES.find((item) => item.value === value) ?? {
    value,
    title: value,
    color: "default",
  };
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
