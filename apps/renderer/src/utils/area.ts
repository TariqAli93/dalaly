/**
 * المصدر الوحيد لقواعد تحويل وحدات المساحة إلى متر مربع.
 *
 * يُستخدم في المقارنة فقط (الفرز، ولاحقاً الفلاتر/التقارير/التصدير عند
 * الحاجة) لتوحيد النتائج بين وحدات مختلفة. لا يغيّر طريقة تخزين المساحة ولا
 * عرضها بوحدتها الأصلية (١ دونم، ١٢٥٠ م²). القيم المدعومة هي القيم الفعلية
 * المخزّنة حالياً في حقل الوحدة ("متر" / "دونم")، مع مرادفات إنجليزية احتياطية.
 */
const DUNUM_IN_SQUARE_METERS = 2500;

export function convertAreaToSquareMeters(
  area: number | string | null | undefined,
  unit: string | null | undefined,
): number | null {
  // القيمة الفارغة/المعدومة يجب أن تبقى null (لا تُحوَّل إلى 0)، لأن
  // Number("") تساوي 0 فتبدو كأصغر عقار بصورة مضللة.
  if (area === null || area === undefined) return null;
  const raw = typeof area === "string" ? area.replace(/,/g, "").trim() : area;
  if (raw === "") return null;

  const numericArea = Number(raw);
  if (!Number.isFinite(numericArea) || numericArea < 0) {
    return null;
  }

  switch ((unit ?? "").trim()) {
    case "dunum":
    case "donum":
    case "دونم":
      return numericArea * DUNUM_IN_SQUARE_METERS;

    case "square_meter":
    case "sqm":
    case "m2":
    case "متر":
    case "متر مربع":
      return numericArea;

    default:
      return null;
  }
}

/**
 * مقارنة عقارين بالمساحة الحقيقية (م²) للفرز، مع:
 * - NULLS LAST في الاتجاهين: العقارات بلا مساحة صالحة تظهر في النهاية دائماً
 *   (لا نحوّل الفارغ إلى صفر كي لا يبدو أصغر عقار).
 * - فرز ثانوي ثابت بالمعرّف id لمنع تغيّر ترتيب المتساويين عشوائياً.
 */
export function compareByAreaM2(
  a: { area_value: number | string; area_unit: string | null; id: number },
  b: { area_value: number | string; area_unit: string | null; id: number },
  direction: "asc" | "desc",
): number {
  const av = convertAreaToSquareMeters(a.area_value, a.area_unit);
  const bv = convertAreaToSquareMeters(b.area_value, b.area_unit);

  if (av === null && bv === null) return a.id - b.id;
  if (av === null) return 1; // a إلى النهاية
  if (bv === null) return -1; // b إلى النهاية

  const primary = direction === "asc" ? av - bv : bv - av;
  return primary !== 0 ? primary : a.id - b.id;
}
