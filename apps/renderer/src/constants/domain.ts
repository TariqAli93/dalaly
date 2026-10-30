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

/** حالات العرض الإيجاري (RENTAL_STATUSES في الخادم): لا «مباع» ولا «مغلق». */
export const RENTAL_STATUSES = [
  { title: "متاح", value: "available" },
  { title: "محجوز", value: "reserved" },
  { title: "قيد التفاوض", value: "negotiating" },
  { title: "مؤجر", value: "rented" },
  { title: "مؤرشف", value: "archived" },
];

export const RENT_PERIOD_LABELS: Record<string, string> = Object.fromEntries(
  RENT_PERIODS.map((p) => [p.value, p.title]),
);

/** أحجام الصفحة في جداول العروض والإيجارات (الخادم يقبل حتى 100). */
export const LIST_PAGE_SIZES = [10, 25, 50, 100];
export const DEFAULT_LIST_PAGE_SIZE = 25;

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
  /** A key, or keys of which any one shows the item. */
  permission?: string | string[];
};

export type NavSection = { title: string | null; items: NavItem[] };

/**
 * التنقّل الجانبي بمجالات العمل: العمل اليومي أولاً (لوحة التحكم والمهام)،
 * ثم العقارات، فالزبائن وطلباتهم، فالصفقات والعقود والإيجارات السارية،
 * فالحسابات، فالتقارير، فالإعدادات والإدارة. صفحات الإنشاء ليست هنا: تُفتح
 * من «إضافة» في شريط الأوامر أو من صفحتها. تُخفى العناصر بلا صلاحية.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      { title: "لوحة التحكم", to: "/", icon: "mdi-view-dashboard-outline" },
      {
        title: "المهام والمتابعات",
        to: "/tasks",
        icon: "mdi-clipboard-check-outline",
        permission: ["followups.read", "rentals.followups.read"],
      },
    ],
  },
  {
    title: "العقارات",
    items: [
      {
        title: "عروض البيع",
        to: "/properties",
        icon: "mdi-home-city-outline",
        permission: "properties.read",
      },
      {
        title: "عروض الإيجار",
        to: "/rentals",
        icon: "mdi-key-chain",
        permission: "rentals.read",
      },
      {
        title: "المفضلة",
        to: "/favorites",
        icon: "mdi-heart-outline",
        permission: "properties.read",
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
      {
        title: "المستمسكات",
        to: "/documents",
        icon: "mdi-file-document-multiple-outline",
        permission: "documents.read",
      },
    ],
  },
  {
    title: "الصفقات والعقود",
    items: [
      {
        title: "الصفقات",
        to: "/deals",
        icon: "mdi-handshake-outline",
        permission: "deals.read",
      },
      {
        title: "العقود",
        to: "/contracts",
        icon: "mdi-file-sign",
        permission: "agreements.read",
      },
      {
        title: "الإيجارات السارية",
        to: "/leases",
        icon: "mdi-home-clock-outline",
        permission: "leases.read",
      },
      {
        title: "قوالب العقود",
        to: "/contracts/templates",
        icon: "mdi-file-document-edit-outline",
        permission: "agreements.templates",
      },
    ],
  },
  {
    title: "الحسابات",
    items: [
      {
        title: "الصناديق والمصارف",
        to: "/accounting/cash",
        icon: "mdi-safe-square-outline",
        permission: "cash.read",
      },
      {
        title: "سندات القبض والصرف",
        to: "/accounting/vouchers",
        icon: "mdi-cash-register",
        permission: "vouchers.read",
      },
      {
        title: "العمولات",
        to: "/accounting/commissions",
        icon: "mdi-percent-circle-outline",
        permission: "commissions.read",
      },
      {
        title: "القيود",
        to: "/accounting/journal",
        icon: "mdi-book-open-variant",
        permission: "accounting.read",
      },
      {
        title: "دليل الحسابات",
        to: "/accounting/accounts",
        icon: "mdi-file-tree-outline",
        permission: "accounting.read",
      },
    ],
  },
  {
    title: "التقارير",
    items: [
      {
        title: "التقارير المالية",
        to: "/reports/financial",
        icon: "mdi-chart-box-outline",
        permission: "reports.financial",
      },
      {
        title: "تقارير العمل",
        to: "/reports/operations",
        icon: "mdi-chart-timeline-variant",
        permission: "reports.operations",
      },
    ],
  },
  {
    title: "الإعدادات والإدارة",
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

/** A record started from «إضافة»: shown only with every one of its keys. */
export type QuickAddItem = {
  title: string;
  to: string;
  icon: string;
  permissions: string[];
};

/**
 * «إضافة» في شريط الأوامر، من أي صفحة: كل بند يفتح صفحته وحوار الإضافة فيها
 * (?new=)، أو نموذجه. مجموعات بفواصل بينها، وتُخفى البنود بلا صلاحية.
 */
export const QUICK_ADD: QuickAddItem[][] = [
  [
    {
      title: "عرض بيع",
      to: "/properties/new",
      icon: "mdi-home-plus-outline",
      permissions: ["properties.create"],
    },
    {
      title: "عرض إيجار",
      to: "/rentals/new",
      icon: "mdi-key-plus",
      permissions: ["rentals.create"],
    },
  ],
  [
    {
      title: "زبون",
      to: "/people?new=1",
      icon: "mdi-account-plus-outline",
      permissions: ["people.create"],
    },
    {
      title: "طلب شراء",
      to: "/purchase-requests?new=1",
      icon: "mdi-home-search-outline",
      permissions: ["requests.create"],
    },
    {
      title: "طلب إيجار",
      to: "/rental-requests?new=1",
      icon: "mdi-text-box-search-outline",
      permissions: ["requests.create"],
    },
    {
      title: "مهمة لزبون",
      to: "/tasks?new=1",
      icon: "mdi-clipboard-plus-outline",
      permissions: ["followups.create", "people.read"],
    },
    {
      title: "مستمسك",
      to: "/documents?new=1",
      icon: "mdi-file-document-plus-outline",
      permissions: ["documents.manage"],
    },
  ],
  [
    {
      title: "صفقة",
      to: "/deals?new=1",
      icon: "mdi-handshake-outline",
      permissions: ["deals.create"],
    },
    {
      title: "إيجار بلا عقد في النظام",
      to: "/leases?new=1",
      icon: "mdi-home-clock-outline",
      permissions: ["leases.manage"],
    },
  ],
  [
    {
      title: "سند قبض",
      to: "/accounting/vouchers?new=receipt",
      icon: "mdi-cash-plus",
      permissions: ["vouchers.receipt"],
    },
    {
      title: "سند صرف",
      to: "/accounting/vouchers?new=payment",
      icon: "mdi-cash-minus",
      permissions: ["vouchers.payment"],
    },
  ],
];

/** هل المسار الحالي داخل قسم العنصر (القائمة نفسها أو تفاصيلها أو نموذجها). */
export function isNavActive(item: NavItem, path: string) {
  if (item.to === "/") return path === "/";
  if (item.to === "/people" && path.startsWith("/clients/")) return true;
  // القوالب تحت /contracts لكنها عنصر مستقل في القائمة.
  if (item.to === "/contracts" && path.startsWith("/contracts/templates"))
    return false;
  return path === item.to || path.startsWith(`${item.to}/`);
}

export function statusLabel(status: string) {
  return STATUSES.find((item) => item.value === status)?.title ?? status;
}

/**
 * لون الحالة وفق نظام التصميم: التيل للمتاح (نشِط)، الأوكر لما ينتظر قراراً
 * بشرياً (محجوز / قيد التفاوض)، السيج لما استقرّ (مباع / مؤجر)، ومحايد
 * للمؤرشف. اللافتة النصية هي التي تفرّق بين حالتي كل عائلة.
 *
 * أدوار الثيم لا الألوان الخام: secondary لون سطح (1.15:1 على الأبيض) وaccent
 * للتعبئة فقط (2.96:1)، فلا يصلحان لنص الشارة. warning هو الأوكر المقروء
 * وinfo هو السيج.
 */
export function statusColor(status: string) {
  return (
    {
      available: "primary",
      reserved: "warning",
      negotiating: "warning",
      sold: "info",
      rented: "info",
      matched: "success",
      archived: undefined,
      closed: undefined,
    } as Record<string, string | undefined>
  )[status];
}
