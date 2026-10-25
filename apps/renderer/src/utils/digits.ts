const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/**
 * أرقام عربية هندية (٠–٩) وفارسية (۰–۹) إلى لاتينية، و«٫» العشرية إلى «.»
 * و«٬» الفاصلة إلى «,». لوحة المفاتيح العربية واللصق من الواتساب يُدخلانها،
 * وكانت حقول الأرقام تحذفها فيبقى الحقل فارغاً دون أي إشارة.
 */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EXTENDED_ARABIC_INDIC.indexOf(digit)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}
