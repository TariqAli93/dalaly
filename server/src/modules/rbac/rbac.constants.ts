export const SUPER_ADMIN_ROLE = "Super Admin";

export const SYSTEM_PERMISSIONS = [
  { key: "properties.read", name: "قراءة العروض", module: "properties" },
  { key: "properties.create", name: "إضافة عروض", module: "properties" },
  { key: "properties.update", name: "تعديل عروض", module: "properties" },
  { key: "properties.archive", name: "أرشفة عروض", module: "properties" },
  { key: "properties.restore", name: "إرجاع عروض مؤرشفة", module: "properties" },
  { key: "properties.delete", name: "حذف عروض", module: "properties" },
  { key: "users.read", name: "قراءة المستخدمين", module: "users" },
  { key: "users.create", name: "إضافة مستخدمين", module: "users" },
  { key: "users.update", name: "تعديل مستخدمين", module: "users" },
  { key: "users.delete", name: "حذف مستخدمين", module: "users" },
  { key: "roles.read", name: "قراءة الأدوار", module: "roles" },
  { key: "roles.create", name: "إضافة أدوار", module: "roles" },
  { key: "roles.update", name: "تعديل أدوار", module: "roles" },
  { key: "roles.delete", name: "حذف أدوار", module: "roles" },
  { key: "settings.read", name: "قراءة الإعدادات", module: "settings" },
  { key: "settings.update", name: "تعديل الإعدادات", module: "settings" }
] as const;
