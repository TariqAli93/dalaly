export const PROPERTY_TYPES = ["أرض", "بيت", "مزرعة", "فيلا"] as const;

export const PROPERTY_TYPE_PREFIX: Record<PropertyType, string> = {
  أرض: "L",
  بيت: "H",
  مزرعة: "F",
  فيلا: "V"
};

export const LEGAL_TYPES = [
  "طابو ملك صرف",
  "طابو زراعي ملك صرف",
  "طابو زراعي مملوك للدولة سند 25",
  "عقد زراعي 117",
  "عقد زراعي 35"
] as const;

export const AREA_UNITS = ["متر", "دونم"] as const;

export const PRICING_METHODS = [
  "سعر على المتر",
  "سعر على الدونم",
  "سعر إجمالي مباشر"
] as const;

export const STATUSES = [
  "available",
  "reserved",
  "negotiating",
  "sold",
  "rented",
  "archived"
] as const;

// التسميات العربية للحالات — تُستخدم في البحث الشامل بالعربية.
export const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  available: "متاح",
  reserved: "محجوز",
  negotiating: "قيد التفاوض",
  sold: "مباع",
  rented: "مؤجر",
  archived: "مؤرشف"
};

export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type LegalType = (typeof LEGAL_TYPES)[number];
export type AreaUnit = (typeof AREA_UNITS)[number];
export type PricingMethod = (typeof PRICING_METHODS)[number];
export type PropertyStatus = (typeof STATUSES)[number];
