export function toNumber(value: unknown) {
  // نتحمّل القيم المنسّقة بفواصل الآلاف (مثل "112,345,123") القادمة من حقول الإدخال.
  const raw = typeof value === "string" ? value.replace(/,/g, "") : value;
  const numericValue = Number(raw);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function formatMoney(value: unknown) {
  // en-US: أرقام لاتينية (latn) مع فواصل آلاف ASCII مثل 112,345,123.
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

/** تنسيق عدد عام مع فواصل آلاف لاتينية، مع الحفاظ على الكسور إن وُجدت. */
export function formatNumber(value: unknown, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(
    toNumber(value),
  );
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
