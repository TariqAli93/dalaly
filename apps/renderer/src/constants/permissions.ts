/**
 * أسماء عربية لوحدات الصلاحيات (module في rbac.constants في الخادم) ولأدوار
 * النظام. المخزَّن يبقى كما هو؛ هذا للعرض وحده.
 */
export const PERMISSION_MODULES: Array<{ key: string; title: string }> = [
  { key: "properties", title: "عروض البيع" },
  { key: "followups", title: "المتابعات والمهام" },
  { key: "rentals", title: "عروض الإيجار ومتابعاتها" },
  { key: "people", title: "الزبائن" },
  { key: "requests", title: "طلبات الزبائن" },
  { key: "documents", title: "المستمسكات" },
  { key: "deals", title: "الصفقات" },
  { key: "agreements", title: "العقود وقوالبها" },
  { key: "accounting", title: "المالية" },
  { key: "vouchers", title: "سندات القبض والصرف" },
  { key: "commissions", title: "العمولات" },
  { key: "cash", title: "الصناديق والمصارف والمصروفات" },
  { key: "leases", title: "الإيجارات السارية" },
  { key: "locations", title: "المحافظات والمناطق" },
  { key: "users", title: "المستخدمون" },
  { key: "roles", title: "الأدوار والصلاحيات" },
  { key: "settings", title: "الإعدادات" },
  { key: "remote_access", title: "الوصول عن بُعد" },
  { key: "backups", title: "النسخ الاحتياطي" },
  { key: "audit", title: "سجل التغييرات" },
  { key: "security", title: "الأمان" },
];

const MODULE_TITLES = new Map(
  PERMISSION_MODULES.map((item) => [item.key, item.title]),
);
const MODULE_ORDER = new Map(
  PERMISSION_MODULES.map((item, index) => [item.key, index]),
);

/** وحدة لا يعرفها هذا الإصدار (صلاحية أضافها المدير): «وحدة أخرى». */
export function permissionModuleLabel(module: string) {
  return MODULE_TITLES.get(module) ?? "وحدات أخرى";
}

/** ترتيب الوحدات في القوائم: ترتيب العمل في المكتب، والمجهول أخيراً. */
export function permissionModuleOrder(module: string) {
  return MODULE_ORDER.get(module) ?? PERMISSION_MODULES.length;
}

/** الدور النظامي يُخزَّن باسمه الإنجليزي (SUPER_ADMIN_ROLE)، ويُعرض بالعربية. */
const ROLE_LABELS: Record<string, string> = { "Super Admin": "مدير النظام" };

export function roleLabel(name: string) {
  return ROLE_LABELS[name] ?? name;
}
