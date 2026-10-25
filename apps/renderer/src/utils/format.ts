// منسّقات Intl تُنشأ مرة واحدة: إنشاء منسّق لكل خلية يكلّف أضعاف التنسيق
// نفسه (docs/OPERATIONS_DASHBOARD.md، "Formatters").
const DATE_TIME = new Intl.DateTimeFormat("ar-IQ", {
  numberingSystem: "latn",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});
const MONEY = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const NUMBERS = new Map<number, Intl.NumberFormat>();

/** تاريخ ووقت بالعربية مع أرقام لاتينية، كما في بقية الواجهة. */
export function formatDateTime(value: string | number | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_TIME.format(date);
}

export function toNumber(value: unknown) {
  // نتحمّل القيم المنسّقة بفواصل الآلاف (مثل "112,345,123") القادمة من حقول الإدخال.
  const raw = typeof value === "string" ? value.replace(/,/g, "") : value;
  const numericValue = Number(raw);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function formatMoney(value: unknown) {
  // en-US: أرقام لاتينية (latn) مع فواصل آلاف ASCII مثل 112,345,123.
  return MONEY.format(toNumber(value));
}

/** تنسيق عدد عام مع فواصل آلاف لاتينية، مع الحفاظ على الكسور إن وُجدت. */
export function formatNumber(value: unknown, maximumFractionDigits = 2) {
  let formatter = NUMBERS.get(maximumFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits });
    NUMBERS.set(maximumFractionDigits, formatter);
  }
  return formatter.format(toNumber(value));
}

/** تاريخ قصير (يوم وشهر) بأرقام لاتينية، لقوائم المواعيد والطلبات. */
const SHORT_DATE = new Intl.DateTimeFormat("ar-IQ", {
  numberingSystem: "latn",
  day: "numeric",
  month: "short",
});
const SHORT_TIME = new Intl.DateTimeFormat("ar-IQ", {
  numberingSystem: "latn",
  hour: "numeric",
  minute: "2-digit",
});
export function formatShortDate(value: string | number | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : SHORT_DATE.format(date);
}
export function formatTime(value: string | number | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : SHORT_TIME.format(date);
}

/** الأيام الكاملة منذ value حتى الآن (0 لتاريخ اليوم أو المستقبل أو غير الصالح). */
export function daysSince(value: string | number | Date) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

/**
 * صيغة الجمع الصحيحة للأيام في العربية:
 * 0 → "اليوم"، 1 → "أمس"، 2 → "يومين"، 3-10 → "أيام"، 11+ → "يوماً".
 * بدونها تظهر عبارات مثل "منذ 45 يوم" وهي خاطئة نحوياً في كل الحالات.
 */
export function pluralizeDays(count: unknown): string {
  const days = Math.max(0, Math.trunc(toNumber(count)));
  if (days === 0) return "اليوم";
  if (days === 1) return "أمس";
  if (days === 2) return "منذ يومين";
  if (days <= 10) return `منذ ${days} أيام`;
  return `منذ ${days} يوماً`;
}

/**
 * عرض موحّد لرقم القطعة مع حرفها: "321 أ" أو "321" أو "".
 * يُستخدم في كل أماكن عرض العروض والتصدير لتجنّب تكرار المنطق.
 */
export function formatPlot(plotNumber: unknown, plotLetter?: unknown): string {
  const number =
    plotNumber === null || plotNumber === undefined
      ? ""
      : String(plotNumber).trim();
  const letter =
    plotLetter === null || plotLetter === undefined
      ? ""
      : String(plotLetter).trim();
  if (!number) return "";
  return letter ? `${number} ${letter}` : number;
}
