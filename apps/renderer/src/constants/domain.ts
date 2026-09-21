export const DIRECT_PRICE = "سعر إجمالي مباشر";

export const PROPERTY_TYPES = ["أرض", "بيت", "مزرعة", "فيلا"];

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
  { title: "مفتوح", value: "open" },
  { title: "مغلق", value: "closed" },
  { title: "تمت المطابقة", value: "matched" },
];

export const RENTAL_PROPERTY_TYPES = [
  { title: "بيت", value: "house" },
  { title: "شقة", value: "apartment" },
  { title: "محل", value: "shop" },
  { title: "مخزن", value: "warehouse" },
  { title: "أخرى", value: "other" },
];

export type NavItem = {
  title: string;
  to: string;
  icon: string;
  permission?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { title: "لوحة البداية", to: "/", icon: "mdi-view-dashboard-outline" },
  {
    title: "الإيجارات",
    to: "/rentals",
    icon: "mdi-key-chain",
    permission: "rentals.read",
  },
  {
    title: "إضافة إيجار",
    to: "/rentals/new",
    icon: "mdi-key-plus",
    permission: "rentals.create",
  },
  {
    title: "مفضلة الإيجارات",
    to: "/rental-favorites",
    icon: "mdi-heart-multiple-outline",
    permission: "rentals.read",
  },
  {
    title: "العروض العقارية",
    to: "/properties",
    icon: "mdi-home-city-outline",
    permission: "properties.read",
  },
  {
    title: "إضافة عرض",
    to: "/properties/new",
    icon: "mdi-plus-box-outline",
    permission: "properties.create",
  },
  {
    title: "المفضلة",
    to: "/favorites",
    icon: "mdi-heart-outline",
    permission: "properties.read",
  },
  {
    title: "المستخدمون",
    to: "/users",
    icon: "mdi-account-group-outline",
    permission: "users.read",
  },
  {
    title: "الأدوار والصلاحيات",
    to: "/roles",
    icon: "mdi-shield-key-outline",
    permission: "roles.read",
  },
  {
    title: "المحافظات والمناطق والأحياء",
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
  {
    title: "المساعدة",
    to: "/help",
    icon: "mdi-help-circle-outline",
  },
];

export const CRM_NAV_ITEMS: NavItem[] = [
  {
    title: "العملاء",
    to: "/customers",
    icon: "mdi-account-group-outline",
    permission: "customers.read",
  },
  {
    title: "طلبات الإيجار",
    to: "/rental-requests",
    icon: "mdi-home-search-outline",
    permission: "requests.read",
  },
  {
    title: "طلبات الشراء",
    to: "/purchase-requests",
    icon: "mdi-home-search-outline",
    permission: "requests.read",
  },
  // {
  //   title: "المستندات",
  //   to: "/documents",
  //   icon: "mdi-file-document-multiple-outline",
  //   permission: "documents.read",
  // },
  // {
  //   title: "العقود",
  //   to: "/contracts",
  //   icon: "mdi-file-sign",
  //   permission: "contracts.read",
  // },
  // {
  //   title: "قوالب العقود",
  //   to: "/contract-templates",
  //   icon: "mdi-file-edit-outline",
  //   permission: "contract_templates.manage",
  // },
];

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
