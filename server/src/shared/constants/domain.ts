export const PROPERTY_TYPES = ["أرض", "بيت", "مزرعة", "فيلا"] as const;

export const PROPERTY_TYPE_PREFIX: Record<PropertyType, string> = {
  أرض: "L",
  بيت: "H",
  مزرعة: "F",
  فيلا: "V",
};

export const LEGAL_TYPES = [
  "طابو ملك صرف",
  "طابو زراعي ملك صرف",
  "طابو زراعي مملوك للدولة سند 25",
  "عقد زراعي 117",
  "عقد زراعي 35",
] as const;

export const AREA_UNITS = ["متر", "دونم"] as const;

export const PRICING_METHODS = [
  "سعر على المتر",
  "سعر على الدونم",
  "سعر إجمالي مباشر",
] as const;

export const STATUSES = [
  "available",
  "reserved",
  "negotiating",
  "sold",
  "rented",
  "archived",
  "unavailable",
  "pending",
  "draft",
  "rejected",
  "approved",
  "inactive",
  "active",
  "deleted",
  "expired",
  "suspended",
  "terminated",
  "cancelled",
  "completed",
  "in_progress",
  "on_hold",
  "under_review",
  "awaiting_payment",
  "payment_received",
  "payment_failed",
  "shipped",
  "delivered",
  "returned",
  "refunded",
  "matched",
  "closed",
  "unknown",
] as const;

// التسميات العربية للحالات — تُستخدم في البحث الشامل بالعربية.
export const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  available: "متاح",
  reserved: "محجوز",
  negotiating: "قيد التفاوض",
  sold: "مباع",
  rented: "مؤجر",
  archived: "مؤرشف",
  unavailable: "غير متاح",
  pending: "قيد الانتظار",
  draft: "مسودة",
  rejected: "مرفوض",
  approved: "موافق عليه",
  inactive: "غير نشط",
  active: "نشط",
  deleted: "محذوف",
  expired: "منتهي الصلاحية",
  suspended: "معلق",
  terminated: "منتهي",
  cancelled: "ملغى",
  completed: "مكتمل",
  in_progress: "قيد التنفيذ",
  on_hold: "معلق مؤقتًا",
  under_review: "قيد المراجعة",
  awaiting_payment: "في انتظار الدفع",
  payment_received: "تم استلام الدفع",
  payment_failed: "فشل الدفع",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  returned: "تم الإرجاع",
  refunded: "تم الاسترداد",
  matched: "تمت المطابقة",
  closed: "مغلق",
  unknown: "غير معروف",
};

export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type LegalType = (typeof LEGAL_TYPES)[number];
export type AreaUnit = (typeof AREA_UNITS)[number];
export type PricingMethod = (typeof PRICING_METHODS)[number];
export type PropertyStatus = (typeof STATUSES)[number];
export const RENTAL_PROPERTY_TYPES = [
  "house",
  "apartment",
  "shop",
  "warehouse",
  "other",
] as const;
export const RENT_PERIODS = ["monthly", "semi_annual", "annual"] as const;
export const RENTAL_STATUSES = [
  "available",
  "reserved",
  "negotiating",
  "rented",
  "archived",
] as const;
export type RentalPropertyType = (typeof RENTAL_PROPERTY_TYPES)[number];
export type RentPeriod = (typeof RENT_PERIODS)[number];
export type RentalStatus = (typeof RENTAL_STATUSES)[number];
