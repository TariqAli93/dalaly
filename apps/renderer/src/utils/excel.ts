import * as XLSX from "xlsx";

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
};

/** قراءة ملف Excel وإرجاع الترويسات والصفوف. */
export async function parseXlsx(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

export type ImportField = {
  key: string;
  label: string;
  keywords: string[];
  default?: string;
};

export const IMPORT_FIELDS: ImportField[] = [
  {
    key: "property_type",
    label: "نوع العقار",
    keywords: ["نوع"],
    default: "أرض",
  },
  {
    key: "legal_type",
    label: "الصفة القانونية",
    keywords: ["صفة", "جنس", "قانون"],
    default: "طابو ملك صرف",
  },
  { key: "area_value", label: "المساحة", keywords: ["مساحة"] },
  {
    key: "area_unit",
    label: "وحدة المساحة",
    keywords: ["وحدة"],
    default: "متر",
  },
  {
    key: "pricing_method",
    label: "طريقة التسعير",
    keywords: ["تسعير", "طريقة"],
    default: "سعر على المتر",
  },
  {
    key: "unit_price",
    label: "سعر الوحدة",
    keywords: ["سعر الوحدة", "سعر المتر"],
  },
  {
    key: "total_price",
    label: "السعر الكلي",
    keywords: ["السعر الكلي", "السعر الإجمالي", "السعر"],
  },
  { key: "governorate_text", label: "المحافظة", keywords: ["محافظة"] },
  { key: "district_text", label: "المنطقة", keywords: ["منطقة"] },
  { key: "neighborhood_text", label: "الحي", keywords: ["حي"] },
  { key: "plot_number", label: "رقم القطعة", keywords: ["رقم القطعة", "قطعة"] },
  { key: "plot_letter", label: "حرف القطعة", keywords: ["حرف"] },
  { key: "frontage", label: "الواجهة", keywords: ["واجهة"] },
  { key: "nazal", label: "النزال / العمق", keywords: ["نزال", "عمق"] },
  { key: "owner_name", label: "اسم المالك", keywords: ["مالك", "اسم"] },
  {
    key: "owner_phone",
    label: "هاتف المالك",
    keywords: ["هاتف", "موبايل", "رقم"],
  },
  { key: "notes", label: "ملاحظات", keywords: ["ملاحظ"] },
];

/** يقترح ربطاً تلقائياً بين الحقول والأعمدة بناءً على أسماء الترويسات. */
export function autoMap(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of IMPORT_FIELDS) {
    const match = headers.find((h) =>
      field.keywords.some((kw) => h.includes(kw)),
    );
    if (match) mapping[field.key] = match;
  }
  return mapping;
}

/** يبني صفوف الاستيراد النهائية من الربط مع تطبيق القيم الافتراضية. */
export function buildMappedRows(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const field of IMPORT_FIELDS) {
      const column = mapping[field.key];
      const value = column ? row[column] : undefined;
      if (value !== undefined && value !== "" && value !== null) {
        mapped[field.key] = value;
      } else if (field.default !== undefined) {
        mapped[field.key] = field.default;
      }
    }
    return mapped;
  });
}
