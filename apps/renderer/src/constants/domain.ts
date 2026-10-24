import type { ListSortOption, PropertySortKey, RentalSortKey } from "../types";

export const DIRECT_PRICE = "سعر إجمالي مباشر";

export const PROPERTY_TYPES = [
  "أرض",
  "أرض سكنية",
  "أرض زراعية",
  "بيت",
  "مزرعة",
  "فيلا",
  "شقة",
  "بناية",
  "عقار تجاري",
  "مكتب",
  "مخزن",
  "أخرى",
];

export const LEGAL_TYPES = [
  "طابو ملك صرف",
  "طابو زراعي ملك صرف",
  "طابو زراعي مملوك للدولة سند 25",
  "عقد زراعي 117",
  "عقد زراعي 35",
];

export const AREA_UNITS = ["متر", "دونم"];

export const PRICING_METHODS = [
  "سعر على المتر",
  "سعر على الدونم",
  DIRECT_PRICE,
];

export const STATUSES = [
  { title: "متاح", value: "available" },
  { title: "محجوز", value: "reserved" },
  { title: "قيد التفاوض", value: "negotiating" },
  { title: "مباع", value: "sold" },
  { title: "مؤجر", value: "rented" },
  { title: "مؤرشف", value: "archived" },
  { title: "مغلق", value: "closed" },
  { title: "تمت المطابقة", value: "matched" },
];

export const RENTAL_PROPERTY_TYPES = [
  { title: "بيت", value: "house" },
  { title: "شقة", value: "apartment" },
  { title: "محل", value: "shop" },
  { title: "مكتب", value: "office" },
  { title: "أرض غير محددة الاستخدام", value: "land" },
  { title: "مخزن", value: "warehouse" },
  { title: "أرض سكنية", value: "residential_land" },
  { title: "أرض زراعية / مزرعة", value: "agricultural_land" },
  { title: "عقار تجاري", value: "commercial" },
  { title: "بناية", value: "building" },
  { title: "فيلا", value: "villa" },
  { title: "أخرى", value: "other" },
];

export const RENTAL_PROPERTY_LABELS: Record<string, string> =
  Object.fromEntries(RENTAL_PROPERTY_TYPES.map((t) => [t.value, t.title]));

export const RENT_PERIODS = [
  { title: "شهري", value: "monthly" },
  { title: "نصف سنوي", value: "semi_annual" },
  { title: "سنوي", value: "annual" },
];

export const RENT_PERIOD_LABELS: Record<string, string> = Object.fromEntries(
  RENT_PERIODS.map((p) => [p.value, p.title]),
);

/** أحجام الصفحة في جداول العروض والإيجارات (الخادم يقبل حتى 100). */
export const LIST_PAGE_SIZES = [10, 25, 50, 100];
export const DEFAULT_LIST_PAGE_SIZE = 10;

// خيارات "ترتيب" في شريط النتائج؛ كل خيار مفتاح ترتيب واتجاه في الخادم.
// أول خيار هو الترتيب الافتراضي (الأحدث أولاً).
export const PROPERTY_SORT_OPTIONS: ListSortOption<PropertySortKey>[] = [
  { value: "newest", title: "الأحدث", key: "created_at", order: "desc" },
  { value: "updated", title: "آخر تحديث", key: "updated_at", order: "desc" },
  {
    value: "price_asc",
    title: "السعر: الأقل",
    key: "total_price",
    order: "asc",
  },
  {
    value: "price_desc",
    title: "السعر: الأعلى",
    key: "total_price",
    order: "desc",
  },
  {
    value: "area_desc",
    title: "المساحة: الأكبر أولاً",
    key: "area",
    order: "desc",
  },
  {
    value: "area_asc",
    title: "المساحة: الأصغر أولاً",
    key: "area",
    order: "asc",
  },
];

export const RENTAL_SORT_OPTIONS: ListSortOption<RentalSortKey>[] = [
  { value: "newest", title: "الأحدث", key: "created_at", order: "desc" },
  { value: "updated", title: "آخر تحديث", key: "updated_at", order: "desc" },
  {
    value: "price_asc",
    title: "السعر: الأقل",
    key: "rent_price",
    order: "asc",
  },
  {
    value: "price_desc",
    title: "السعر: الأعلى",
    key: "rent_price",
    order: "desc",
  },
  {
    value: "area_desc",
    title: "المساحة: الأكبر أولاً",
    key: "area",
    order: "desc",
  },
  {
    value: "area_asc",
    title: "المساحة: الأصغر أولاً",
    key: "area",
    order: "asc",
  },
];

export type NavItem = {
  title: string;
  to: string;
  icon: string;
  permission?: string;
};

export type NavSection = { title: string | null; items: NavItem[] };

/**
 * التنقّل الجانبي بمجموعاته وترتيبه. صفحات الإنشاء ليست هنا: تُفتح من زر
 * "إضافة" في صفحتها أو في لوحة التحكم. تُخفى العناصر بلا صلاحية.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      { title: "لوحة التحكم", to: "/", icon: "mdi-view-dashboard-outline" },
    ],
  },
  {
    title: "العقارات والعروض",
    items: [
      {
        title: "عروض البيع",
        to: "/properties",
        icon: "mdi-home-city-outline",
        permission: "properties.read",
      },
      {
        title: "المفضلة",
        to: "/favorites",
        icon: "mdi-heart-outline",
        permission: "properties.read",
      },
    ],
  },
  {
    title: "الإيجارات",
    items: [
      {
        title: "عروض الإيجار",
        to: "/rentals",
        icon: "mdi-key-chain",
        permission: "rentals.read",
      },
      {
        title: "مفضلة الإيجارات",
        to: "/rental-favorites",
        icon: "mdi-heart-multiple-outline",
        permission: "rentals.read",
      },
    ],
  },
  {
    title: "الزبائن والطلبات",
    items: [
      {
        title: "الزبائن",
        to: "/people",
        icon: "mdi-account-box-multiple-outline",
        permission: "people.read",
      },
      {
        title: "طلبات الشراء",
        to: "/purchase-requests",
        icon: "mdi-home-search-outline",
        permission: "requests.read",
      },
      {
        title: "طلبات الإيجار",
        to: "/rental-requests",
        icon: "mdi-text-box-search-outline",
        permission: "requests.read",
      },
    ],
  },
  {
    title: "المستندات",
    items: [
      {
        title: "المستندات",
        to: "/documents",
        icon: "mdi-file-document-multiple-outline",
        permission: "documents.read",
      },
    ],
  },
  {
    title: "إدارة النظام",
    items: [
      {
        title: "المستخدمون",
        to: "/users",
        icon: "mdi-account-cog-outline",
        permission: "users.read",
      },
      {
        title: "الأدوار والصلاحيات",
        to: "/roles",
        icon: "mdi-shield-key-outline",
        permission: "roles.read",
      },
      {
        title: "المحافظات والمناطق",
        to: "/locations",
        icon: "mdi-map-marker-outline",
        permission: "locations.manage",
      },
      {
        title: "الإعدادات",
        to: "/settings",
        icon: "mdi-cog-outline",
        permission: "settings.read",
      },
      { title: "المساعدة", to: "/help", icon: "mdi-help-circle-outline" },
    ],
  },
];

/** هل المسار الحالي داخل قسم العنصر (القائمة نفسها أو تفاصيلها أو نموذجها). */
export function isNavActive(item: NavItem, path: string) {
  if (item.to === "/") return path === "/";
  if (item.to === "/people" && path.startsWith("/clients/")) return true;
  return path === item.to || path.startsWith(`${item.to}/`);
}

export function statusLabel(status: string) {
  return STATUSES.find((item) => item.value === status)?.title ?? status;
}

/**
 * لون الحالة وفق نظام التصميم: التيل للمتاح (نشِط)، الأوكر لما ينتظر قراراً
 * بشرياً (محجوز / قيد التفاوض)، السيج لما استقرّ (مباع / مؤجر)، ومحايد
 * للمؤرشف. اللافتة النصية هي التي تفرّق بين حالتي كل عائلة.
 */
export function statusColor(status: string) {
  return (
    {
      available: "primary",
      reserved: "accent",
      negotiating: "warning",
      sold: "secondary",
      rented: "secondary",
      archived: undefined,
    } as Record<string, string | undefined>
  )[status];
}
