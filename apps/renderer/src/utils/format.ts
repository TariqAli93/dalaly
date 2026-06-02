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
