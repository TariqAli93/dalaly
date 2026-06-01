<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useDisplay, useTheme } from "vuetify";

type PropertyStatus = "available" | "reserved" | "sold" | "archived";
type AuthMode = "checking" | "setup" | "login" | "app";
type ViewName =
  | "dashboard"
  | "properties"
  | "form"
  | "users"
  | "roles"
  | "settings";

type AuthUserRecord = {
  id: number;
  username: string;
  display_name: string;
  is_active: boolean;
};

type RoleRecord = {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  permission_ids: number[];
};

type PermissionRecord = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  module: string;
};

type ManagedUserRecord = AuthUserRecord & {
  role_ids: number[];
  roles: RoleRecord[];
};

type PropertyRecord = {
  id: number;
  code: string;
  property_type: string;
  legal_type: string;
  area_value: string | number;
  area_unit: string;
  pricing_method: string;
  unit_price: string | number | null;
  total_price: string | number;
  governorate: string | null;
  city: string | null;
  district: string | null;
  address_details: string | null;
  owner_name: string;
  owner_phone: string;
  owner_notes: string | null;
  status: PropertyStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type PropertyForm = Omit<
  PropertyRecord,
  "id" | "code" | "created_at" | "updated_at" | "archived_at"
>;

const configuredApiBase = import.meta.env.VITE_API_BASE_URL as
  | string
  | undefined;

/**
 * مهم:
 * لا تستخدم أكثر من API base أثناء التشغيل.
 * fallback بين ports أثناء PATCH/PUT/POST/DELETE يسبب مشاكل CORS و 400/500.
 */
const API_BASE =
  configuredApiBase?.replace(/\/$/, "") || "http://127.0.0.1:45678/api";

const SESSION_KEY = "dalaly.session";
const THEME_KEY = "dalaly.theme";
const DIRECT_PRICE = "سعر إجمالي مباشر";

const theme = useTheme();
const { mdAndUp } = useDisplay();

const propertyTypes = ["أرض", "بيت", "مزرعة", "فيلا"];
const legalTypes = [
  "طابو ملك صرف",
  "طابو زراعي ملك صرف",
  "طابو زراعي مملوك للدولة سند 25",
  "عقد زراعي 117",
  "عقد زراعي 35",
];
const areaUnits = ["متر", "دونم"];
const pricingMethods = ["سعر على المتر", "سعر على الدونم", DIRECT_PRICE];

const statuses = [
  { title: "متاح", value: "available" },
  { title: "محجوز", value: "reserved" },
  { title: "مباع", value: "sold" },
  { title: "مؤرشف", value: "archived" },
];

const baseNavItems: Array<{
  title: string;
  value: ViewName;
  icon: string;
  permission?: string;
}> = [
  {
    title: "لوحة البداية",
    value: "dashboard",
    icon: "mdi-view-dashboard-outline",
  },
  {
    title: "العروض العقارية",
    value: "properties",
    icon: "mdi-home-city-outline",
    permission: "properties.read",
  },
  {
    title: "إضافة عرض",
    value: "form",
    icon: "mdi-plus-box-outline",
    permission: "properties.create",
  },
  {
    title: "المستخدمون",
    value: "users",
    icon: "mdi-account-group-outline",
    permission: "users.read",
  },
  {
    title: "الأدوار والصلاحيات",
    value: "roles",
    icon: "mdi-shield-key-outline",
    permission: "roles.read",
  },
  {
    title: "الإعدادات",
    value: "settings",
    icon: "mdi-cog-outline",
    permission: "settings.read",
  },
];

const authMode = ref<AuthMode>("checking");
const activeView = ref<ViewName>("dashboard");
const mobileMenuOpen = ref(false);
const advancedFiltersOpen = ref(false);
const loading = ref(false);
const statsLoading = ref(false);
const saving = ref(false);
const authLoading = ref(false);
const detailsDialog = ref(false);

const token = ref(localStorage.getItem(SESSION_KEY) ?? "");
const currentUser = ref<AuthUserRecord | null>(null);
const currentRoles = ref<RoleRecord[]>([]);
const currentPermissions = ref<PermissionRecord[]>([]);

const globalSearchRef = ref<{ focus?: () => void } | null>(null);
const propertyFormRef = ref<{
  validate: () => Promise<{ valid: boolean }>;
} | null>(null);

const snackbar = ref({ show: false, text: "", color: "success" });

const confirmDialog = ref({
  open: false,
  loading: false,
  title: "",
  body: "",
  confirmText: "تأكيد",
  color: "primary",
  onConfirm: async () => undefined as void | Promise<void>,
});

const themeName = ref(localStorage.getItem(THEME_KEY) ?? "dalalyLight");
theme.change(themeName.value);

const loginForm = ref({ username: "admin", pin: "" });
const setupForm = ref({ username: "admin", pin: "" });

const setupStatus = ref({
  app_version: "0.1.0",
  db_connected: false,
  admin_exists: false,
});

const properties = ref<PropertyRecord[]>([]);
const users = ref<ManagedUserRecord[]>([]);
const roles = ref<RoleRecord[]>([]);
const permissions = ref<PermissionRecord[]>([]);
const selectedProperty = ref<PropertyRecord | null>(null);
const editingId = ref<number | null>(null);
const userDialog = ref(false);
const roleDialog = ref(false);
const permissionDialog = ref(false);
const editingUserId = ref<number | null>(null);
const editingRoleId = ref<number | null>(null);
const editingPermissionId = ref<number | null>(null);

const remoteStatus = ref({
  enabled: false,
  running: false,
  url: null as string | null,
  message: null as string | null,
});

const stats = ref({
  total: 0,
  available: 0,
  sold: 0,
  archived: 0,
  by_type: [] as Array<{ name: string; count: number }>,
  by_legal_type: [] as Array<{ name: string; count: number }>,
  by_pricing_method: [] as Array<{ name: string; count: number }>,
});

const filters = ref({
  property_type: "",
  legal_type: "",
  area_unit: "",
  pricing_method: "",
  status: "",
  district: "",
  price_min: "",
  price_max: "",
  q: "",
});

const defaultForm = (): PropertyForm => ({
  property_type: "أرض",
  legal_type: "طابو ملك صرف",
  area_value: "",
  area_unit: "متر",
  pricing_method: "سعر على المتر",
  unit_price: "",
  total_price: "",
  governorate: "",
  city: "",
  district: "",
  address_details: "",
  owner_name: "",
  owner_phone: "",
  owner_notes: "",
  status: "available",
  notes: "",
});

const form = ref<PropertyForm>(defaultForm());
const userForm = ref({
  username: "",
  display_name: "",
  pin: "",
  is_active: true,
  role_ids: [] as number[],
});
const roleForm = ref({
  name: "",
  description: "",
  permission_ids: [] as number[],
});
const permissionForm = ref({
  key: "",
  name: "",
  description: "",
  module: "",
});

const headers = [
  { title: "الكود", key: "code", sortable: true },
  { title: "النوع", key: "property_type" },
  { title: "الصفة القانونية", key: "legal_type" },
  { title: "المنطقة", key: "district" },
  { title: "المساحة", key: "area" },
  { title: "التسعير", key: "pricing_method" },
  { title: "السعر الكلي", key: "total_price" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false, align: "end" as const },
];

const isDarkMode = computed(() => themeName.value === "dalalyDark");
const currentUserPermissions = computed(() =>
  currentPermissions.value.map((permission) => permission.key),
);
const navItems = computed(() =>
  baseNavItems.filter((item) => !item.permission || can(item.permission)),
);

const pageTitle = computed(
  () =>
    navItems.value.find((item) => item.value === activeView.value)?.title ?? "",
);
const permissionsByModule = computed(() => {
  const groups = new Map<string, PermissionRecord[]>();
  for (const permission of permissions.value) {
    const group = groups.get(permission.module) ?? [];
    group.push(permission);
    groups.set(permission.module, group);
  }
  return [...groups.entries()].map(([module, items]) => ({ module, items }));
});

const isDirectPrice = computed(
  () => form.value.pricing_method === DIRECT_PRICE,
);

const computedTotal = computed(() => {
  if (isDirectPrice.value) return toNumber(form.value.total_price);
  return toNumber(form.value.area_value) * toNumber(form.value.unit_price);
});

const filteredCountLabel = computed(() =>
  properties.value.length === 1 ? "عرض واحد" : `${properties.value.length} عرض`,
);

const topDistricts = computed(() => {
  const counts = new Map<string, number>();

  for (const property of properties.value) {
    if (property.district) {
      counts.set(property.district, (counts.get(property.district) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));
});

const required = (value: unknown) => Boolean(value) || "هذا الحقل مطلوب";
const positive = (value: unknown) =>
  toNumber(value) > 0 || "يجب أن تكون القيمة أكبر من صفر";

onMounted(async () => {
  window.addEventListener("keydown", handleShortcut);
  await boot();
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleShortcut);
});

async function boot() {
  authMode.value = "checking";

  try {
    setupStatus.value =
      await publicApi<typeof setupStatus.value>("/auth/setup-status");

    if (!setupStatus.value.db_connected) {
      authMode.value = "login";
      notifyError(
        "تعذر الاتصال بقاعدة البيانات. تحقق من إعدادات PostgreSQL المحلية.",
      );
      return;
    }

    if (!setupStatus.value.admin_exists) {
      authMode.value = "setup";
      return;
    }

    if (token.value) {
      await loadCurrentUser();
      authMode.value = "app";
      await refreshAll();
      return;
    }

    authMode.value = "login";
  } catch (error) {
    authMode.value = "login";
    notifyError(getErrorMessage(error));
  }
}

async function publicApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init, false);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(formatApiError(body));
  }

  return body as T;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init, true);
  const body = await response.json().catch(() => null);

  if (response.status === 401) {
    token.value = "";
    currentUser.value = null;
    localStorage.removeItem(SESSION_KEY);
    authMode.value = "login";
  }

  if (!response.ok) {
    throw new Error(formatApiError(body));
  }

  return body as T;
}

async function apiFetch(
  path: string,
  init: RequestInit = {},
  authenticated = true,
) {
  const url = `${API_BASE}${path}`;

  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (authenticated && token.value) {
    headers.set("Authorization", `Bearer ${token.value}`);
  }

  return fetch(url, {
    ...init,
    headers,
  });
}

async function setupAdmin() {
  authLoading.value = true;

  try {
    await publicApi("/auth/setup-admin", {
      method: "POST",
      body: JSON.stringify(setupForm.value),
    });

    loginForm.value.username = setupForm.value.username;
    authMode.value = "login";
    notifySuccess("تم إنشاء مستخدم المدير. سجل الدخول الآن.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    authLoading.value = false;
  }
}

async function loginUser() {
  authLoading.value = true;

  try {
    const result = await publicApi<{
      token: string;
      user: AuthUserRecord;
      roles: RoleRecord[];
      permissions: PermissionRecord[];
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(loginForm.value),
    });

    token.value = result.token;
    currentUser.value = result.user;
    currentRoles.value = result.roles;
    currentPermissions.value = result.permissions;
    localStorage.setItem(SESSION_KEY, result.token);
    authMode.value = "app";

    await refreshAll();
    notifySuccess("تم تسجيل الدخول.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    authLoading.value = false;
  }
}

async function logoutUser() {
  await api("/auth/logout", { method: "POST" }).catch(() => undefined);

  token.value = "";
  currentUser.value = null;
  currentRoles.value = [];
  currentPermissions.value = [];
  localStorage.removeItem(SESSION_KEY);
  authMode.value = "login";
}

async function loadCurrentUser() {
  const me = await api<{
    user: AuthUserRecord;
    roles: RoleRecord[];
    permissions: PermissionRecord[];
  }>("/auth/me");
  currentUser.value = me.user;
  currentRoles.value = me.roles;
  currentPermissions.value = me.permissions;
}

async function loadProperties() {
  loading.value = true;

  try {
    const params = new URLSearchParams();

    Object.entries(filters.value).forEach(([key, value]) => {
      if (value !== "") params.set(key, value);
    });

    properties.value = await api<PropertyRecord[]>(
      `/properties${params.toString() ? `?${params.toString()}` : ""}`,
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  statsLoading.value = true;

  try {
    stats.value = await api<typeof stats.value>("/stats/summary");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    statsLoading.value = false;
  }
}

async function loadRemoteStatus() {
  try {
    remoteStatus.value = await api<typeof remoteStatus.value>(
      "/remote-access/status",
    );
  } catch (error) {
    remoteStatus.value.message = getErrorMessage(error);
  }
}

async function refreshAll() {
  await Promise.all([
    can("properties.read") ? loadProperties() : Promise.resolve(),
    can("properties.read") ? loadStats() : Promise.resolve(),
    can("settings.read") ? loadRemoteStatus() : Promise.resolve(),
    can("users.read") ? loadUsers() : Promise.resolve(),
    can("roles.read") ? loadRolesAndPermissions() : Promise.resolve(),
  ]);
}

async function refreshPropertyData() {
  await Promise.all([loadProperties(), loadStats()]);
}

async function loadUsers() {
  try {
    users.value = await api<ManagedUserRecord[]>("/users");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function loadRolesAndPermissions() {
  try {
    const [roleRows, permissionRows] = await Promise.all([
      api<RoleRecord[]>("/roles"),
      api<PermissionRecord[]>("/permissions"),
    ]);
    roles.value = roleRows;
    permissions.value = permissionRows;
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function openUserDialog(user?: ManagedUserRecord) {
  editingUserId.value = user?.id ?? null;
  userForm.value = {
    username: user?.username ?? "",
    display_name: user?.display_name ?? "",
    pin: "",
    is_active: user?.is_active ?? true,
    role_ids: user?.role_ids ? [...user.role_ids] : [],
  };
  userDialog.value = true;
}

async function saveUser() {
  try {
    const payload = {
      ...userForm.value,
      pin: userForm.value.pin || undefined,
    };
    if (editingUserId.value) {
      await api(`/users/${editingUserId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      notifySuccess("تم تحديث المستخدم.");
    } else {
      await api("/users", {
        method: "POST",
        body: JSON.stringify(userForm.value),
      });
      notifySuccess("تم إنشاء المستخدم.");
    }
    userDialog.value = false;
    await loadUsers();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function toggleUserActive(user: ManagedUserRecord) {
  try {
    await api(
      `/users/${user.id}/${user.is_active ? "deactivate" : "activate"}`,
      {
        method: "PATCH",
      },
    );
    await loadUsers();
    notifySuccess(user.is_active ? "تم تعطيل المستخدم." : "تم تفعيل المستخدم.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDeleteUser(user: ManagedUserRecord) {
  openConfirm({
    title: `حذف ${user.username}`,
    body: "هل تريد حذف هذا المستخدم؟",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await api(`/users/${user.id}`, { method: "DELETE" });
      await loadUsers();
      notifySuccess("تم حذف المستخدم.");
    },
  });
}

function openRoleDialog(role?: RoleRecord) {
  editingRoleId.value = role?.id ?? null;
  roleForm.value = {
    name: role?.name ?? "",
    description: role?.description ?? "",
    permission_ids: role?.permission_ids ? [...role.permission_ids] : [],
  };
  roleDialog.value = true;
}

async function saveRole() {
  try {
    const payload = {
      name: roleForm.value.name,
      description: roleForm.value.description,
    };
    const role = editingRoleId.value
      ? await api<RoleRecord>(`/roles/${editingRoleId.value}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        })
      : await api<RoleRecord>("/roles", {
          method: "POST",
          body: JSON.stringify(payload),
        });

    await api(`/roles/${role.id}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permission_ids: roleForm.value.permission_ids }),
    });
    roleDialog.value = false;
    await loadRolesAndPermissions();
    notifySuccess("تم حفظ الدور والصلاحيات.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDeleteRole(role: RoleRecord) {
  openConfirm({
    title: `حذف ${role.name}`,
    body: "هل تريد حذف هذا الدور؟",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await api(`/roles/${role.id}`, { method: "DELETE" });
      await loadRolesAndPermissions();
      notifySuccess("تم حذف الدور.");
    },
  });
}

function openPermissionDialog(permission?: PermissionRecord) {
  editingPermissionId.value = permission?.id ?? null;
  permissionForm.value = {
    key: permission?.key ?? "",
    name: permission?.name ?? "",
    description: permission?.description ?? "",
    module: permission?.module ?? "",
  };
  permissionDialog.value = true;
}

async function savePermission() {
  try {
    const path = editingPermissionId.value
      ? `/permissions/${editingPermissionId.value}`
      : "/permissions";
    await api(path, {
      method: editingPermissionId.value ? "PUT" : "POST",
      body: JSON.stringify(permissionForm.value),
    });
    permissionDialog.value = false;
    await loadRolesAndPermissions();
    notifySuccess("تم حفظ الصلاحية.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDeletePermission(permission: PermissionRecord) {
  openConfirm({
    title: `حذف ${permission.key}`,
    body: "هل تريد حذف هذه الصلاحية؟",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await api(`/permissions/${permission.id}`, { method: "DELETE" });
      await loadRolesAndPermissions();
      notifySuccess("تم حذف الصلاحية.");
    },
  });
}

async function saveProperty() {
  const validation = await propertyFormRef.value?.validate();

  if (validation && !validation.valid) {
    notifyError("تحقق من الحقول المطلوبة قبل الحفظ.");
    return;
  }

  if (!isPayloadValid()) {
    notifyError("لا يمكن حفظ عرض بدون سعر كلي صحيح وبيانات مالك.");
    return;
  }

  saving.value = true;

  const wasEditing = editingId.value !== null;

  try {
    const payload = {
      ...form.value,
      area_value: toNumber(form.value.area_value),
      unit_price: isDirectPrice.value ? null : toNumber(form.value.unit_price),
      total_price: computedTotal.value,
    };

    selectedProperty.value = wasEditing
      ? await api<PropertyRecord>(`/properties/${editingId.value}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        })
      : await api<PropertyRecord>("/properties", {
          method: "POST",
          body: JSON.stringify(payload),
        });

    editingId.value = selectedProperty.value.id;

    await refreshPropertyData();

    activeView.value = "properties";
    detailsDialog.value = true;

    notifySuccess(
      wasEditing ? "تم تحديث العرض بنجاح." : "تمت إضافة العرض بنجاح.",
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    saving.value = false;
  }
}

function openCreateForm() {
  editingId.value = null;
  form.value = defaultForm();
  selectedProperty.value = null;
  detailsDialog.value = false;
  activeView.value = "form";
  mobileMenuOpen.value = false;
}

function editProperty(property: PropertyRecord) {
  editingId.value = property.id;
  form.value = propertyToForm(property);
  selectedProperty.value = property;
  detailsDialog.value = false;
  activeView.value = "form";
}

function viewDetails(property: PropertyRecord) {
  selectedProperty.value = property;
  detailsDialog.value = true;
}

function askArchive(property: PropertyRecord) {
  openConfirm({
    title: `أرشفة ${property.code}`,
    body: "سيبقى العرض محفوظاً لكنه لن يظهر في القائمة الافتراضية.",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: async () => {
      selectedProperty.value = await api<PropertyRecord>(
        `/properties/${property.id}/archive`,
        { method: "PATCH" },
      );

      await refreshPropertyData();

      detailsDialog.value = false;
      notifySuccess("تمت أرشفة العرض بنجاح.");
    },
  });
}

function askRestore(property: PropertyRecord) {
  openConfirm({
    title: `إرجاع ${property.code}`,
    body: "هل تريد إرجاع هذا العرض إلى حالة متاح؟",
    confirmText: "إرجاع",
    color: "success",
    onConfirm: async () => {
      selectedProperty.value = await api<PropertyRecord>(
        `/properties/${property.id}/restore`,
        { method: "PATCH" },
      );

      await refreshPropertyData();

      detailsDialog.value = false;
      notifySuccess("تم إرجاع العرض إلى المتاح بنجاح.");
    },
  });
}

function askDelete(property: PropertyRecord) {
  openConfirm({
    title: `حذف ${property.code}`,
    body: "سيتم حذف العرض نهائياً من قاعدة البيانات. لا يمكن التراجع عن هذه العملية.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await api(`/properties/${property.id}`, { method: "DELETE" });

      if (selectedProperty.value?.id === property.id) {
        selectedProperty.value = null;
      }

      if (editingId.value === property.id) {
        form.value = defaultForm();
        editingId.value = null;
      }

      await refreshPropertyData();

      detailsDialog.value = false;
      notifySuccess("تم حذف العرض بنجاح.");
    },
  });
}

async function enableRemote() {
  try {
    remoteStatus.value = await api<typeof remoteStatus.value>(
      "/remote-access/enable",
      { method: "POST" },
    );

    notifySuccess(
      remoteStatus.value.message ?? "تم طلب تشغيل الاتصال الخارجي.",
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function disableRemote() {
  try {
    remoteStatus.value = await api<typeof remoteStatus.value>(
      "/remote-access/disable",
      { method: "POST" },
    );

    notifySuccess("تم إيقاف الاتصال الخارجي.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function setView(view: ViewName) {
  mobileMenuOpen.value = false;

  if (view === "form") {
    openCreateForm();
    return;
  }

  activeView.value = view;
}

function clearFilters() {
  filters.value = {
    property_type: "",
    legal_type: "",
    area_unit: "",
    pricing_method: "",
    status: "",
    district: "",
    price_min: "",
    price_max: "",
    q: "",
  };

  void loadProperties();
}

function applyQuickFilter(key: keyof typeof filters.value, value: string) {
  filters.value[key] = value;
  activeView.value = "properties";
  void loadProperties();
}

function toggleTheme() {
  themeName.value = isDarkMode.value ? "dalalyLight" : "dalalyDark";
  theme.change(themeName.value);
  localStorage.setItem(THEME_KEY, themeName.value);
}

function propertyToForm(property: PropertyRecord): PropertyForm {
  return {
    property_type: property.property_type,
    legal_type: property.legal_type,
    area_value: property.area_value,
    area_unit: property.area_unit,
    pricing_method: property.pricing_method,
    unit_price: property.unit_price ?? "",
    total_price: property.total_price,
    governorate: property.governorate ?? "",
    city: property.city ?? "",
    district: property.district ?? "",
    address_details: property.address_details ?? "",
    owner_name: property.owner_name,
    owner_phone: property.owner_phone,
    owner_notes: property.owner_notes ?? "",
    status: property.status,
    notes: property.notes ?? "",
  };
}

function openConfirm(input: {
  title: string;
  body: string;
  confirmText: string;
  color: string;
  onConfirm: () => Promise<void>;
}) {
  confirmDialog.value = {
    open: true,
    loading: false,
    ...input,
  };
}

async function runConfirmedAction() {
  confirmDialog.value.loading = true;

  try {
    await confirmDialog.value.onConfirm();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    confirmDialog.value.loading = false;
    confirmDialog.value.open = false;
  }
}

function handleShortcut(event: KeyboardEvent) {
  if (authMode.value !== "app") return;

  const key = event.key.toLowerCase();

  if (event.ctrlKey && key === "n") {
    event.preventDefault();
    openCreateForm();
  }

  if ((event.ctrlKey && key === "k") || (event.ctrlKey && key === "f")) {
    event.preventDefault();
    activeView.value = "properties";
    void nextTick(() => globalSearchRef.value?.focus?.());
  }

  if (key === "escape") {
    advancedFiltersOpen.value = false;
    confirmDialog.value.open = false;
    detailsDialog.value = false;
  }
}

function isPayloadValid() {
  if (!form.value.property_type || !form.value.legal_type) return false;

  if (toNumber(form.value.area_value) <= 0 || !form.value.area_unit) {
    return false;
  }

  if (
    !form.value.pricing_method ||
    !form.value.owner_name ||
    !form.value.owner_phone
  ) {
    return false;
  }

  if (isDirectPrice.value) {
    return toNumber(form.value.total_price) > 0;
  }

  return toNumber(form.value.unit_price) > 0 && computedTotal.value > 0;
}

function statusLabel(status: string) {
  return statuses.find((item) => item.value === status)?.title ?? status;
}

function statusColor(status: string) {
  return {
    available: "primary",
    reserved: "accent",
    sold: "secondary",
    archived: undefined,
  }[status];
}

function can(permission: string) {
  return currentUserPermissions.value.includes(permission);
}

function notifySuccess(text: string) {
  snackbar.value = { show: true, text, color: "success" };
}

function notifyError(text: string) {
  snackbar.value = { show: true, text, color: "error" };
}

function toNumber(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("ar-IQ", {
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatApiError(body: unknown) {
  if (body && typeof body === "object") {
    const payload = body as {
      message?: string;
      error?: string;
      issues?: Array<{ message: string }>;
    };

    if (payload.issues?.length) {
      return payload.issues.map((issue) => issue.message).join("، ");
    }

    if (payload.message) return payload.message;
    if (payload.error) return payload.error;
  }

  return "تعذر تنفيذ العملية.";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
}
</script>

<template>
  <v-app class="app-shell" dir="rtl">
    <v-main v-if="authMode !== 'app'">
      <section class="auth-screen">
        <v-card class="auth-panel" rounded="lg" variant="flat" border>
          <v-card-text class="pa-7">
            <div class="d-flex align-center ga-3 mb-7">
              <v-avatar color="primary" rounded="lg">
                <v-icon icon="mdi-home-city-outline" />
              </v-avatar>
              <div>
                <div class="text-h5 font-weight-bold">دلالي</div>
                <div class="text-body-2 text-medium-emphasis">
                  نظام محلي لإدارة عروض مكتب الوساطة العقارية
                </div>
              </div>
            </div>

            <v-skeleton-loader
              v-if="authMode === 'checking'"
              type="heading, paragraph, actions"
            />

            <v-form
              v-else-if="authMode === 'setup'"
              @submit.prevent="setupAdmin"
            >
              <div class="text-h6 mb-2">إعداد التشغيل الأول</div>
              <div class="text-body-2 text-medium-emphasis mb-5">
                أنشئ مستخدم المدير المحلي. سيتم تخزين رمز PIN كـ hash داخل
                PostgreSQL.
              </div>
              <v-alert class="mb-4" variant="tonal">
                إصدار التطبيق: {{ setupStatus.app_version }}
              </v-alert>
              <v-text-field
                v-model="setupForm.username"
                label="Username"
                :rules="[required]"
                autofocus
              />
              <v-text-field
                v-model="setupForm.pin"
                label="PIN Code"
                type="password"
                :rules="[required]"
              />
              <v-btn
                block
                color="primary"
                type="submit"
                :loading="authLoading"
                prepend-icon="mdi-shield-account"
              >
                إنشاء المدير
              </v-btn>
            </v-form>

            <v-form v-else @submit.prevent="loginUser">
              <div class="text-h6 mb-2">تسجيل الدخول</div>
              <div class="text-body-2 text-medium-emphasis mb-5">
                الدخول محلي باستخدام Username وPIN فقط.
              </div>
              <v-text-field
                v-model="loginForm.username"
                label="Username"
                :rules="[required]"
                autofocus
              />
              <v-text-field
                v-model="loginForm.pin"
                label="PIN Code"
                type="password"
                :rules="[required]"
              />
              <v-btn
                block
                color="primary"
                type="submit"
                :loading="authLoading"
                prepend-icon="mdi-login"
              >
                دخول
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </section>
    </v-main>

    <template v-else>
      <v-app-bar class="top-navbar" flat border density="comfortable">
        <v-app-bar-nav-icon v-if="!mdAndUp" @click="mobileMenuOpen = true" />
        <v-app-bar-title class="font-weight-bold">دلالي</v-app-bar-title>

        <div v-if="mdAndUp" class="nav-actions">
          <v-btn
            v-for="item in navItems"
            :key="item.value"
            :variant="activeView === item.value ? 'flat' : 'text'"
            :color="activeView === item.value ? 'primary' : undefined"
            :prepend-icon="item.icon"
            @click="setView(item.value)"
          >
            {{ item.title }}
          </v-btn>
        </div>

        <v-spacer />

        <v-text-field
          ref="globalSearchRef"
          v-model="filters.q"
          class="global-search"
          density="compact"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          label="بحث سريع Ctrl+K"
          @keyup.enter="
            activeView = 'properties';
            loadProperties();
          "
        />

        <v-btn
          :icon="isDarkMode ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="text"
          title="تبديل الثيم"
          @click="toggleTheme"
        />
        <v-btn
          icon="mdi-refresh"
          variant="text"
          title="تحديث"
          @click="refreshAll"
        />
        <v-menu>
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              icon="mdi-account-circle-outline"
              variant="text"
            />
          </template>
          <v-list min-width="220">
            <v-list-item
              :title="currentUser?.username ?? 'مستخدم'"
              subtitle="جلسة محلية"
              prepend-icon="mdi-account"
            />
            <v-divider />
            <v-list-item
              title="تسجيل الخروج"
              prepend-icon="mdi-logout"
              @click="logoutUser"
            />
          </v-list>
        </v-menu>
      </v-app-bar>

      <v-navigation-drawer v-model="mobileMenuOpen" temporary location="right">
        <v-list nav>
          <v-list-item
            v-for="item in navItems"
            :key="item.value"
            :active="activeView === item.value"
            :prepend-icon="item.icon"
            :title="item.title"
            @click="setView(item.value)"
          />
        </v-list>
      </v-navigation-drawer>

      <v-main>
        <main class="main-content">
          <section class="page-band">
            <div class="page-header">
              <div>
                <div class="text-h5 font-weight-bold">{{ pageTitle }}</div>
                <div class="text-body-2 text-medium-emphasis">
                  إدارة محلية وسريعة لعروض البيع والتسويق داخل المكتب.
                </div>
              </div>
            </div>

            <div v-if="activeView === 'dashboard'">
              <div class="stats-grid mb-5">
                <v-skeleton-loader
                  v-if="statsLoading"
                  v-for="n in 4"
                  :key="n"
                  type="card"
                />
                <template v-else>
                  <v-card rounded="lg" variant="flat" border>
                    <v-card-text>
                      <div class="text-body-2 text-medium-emphasis">
                        إجمالي العروض
                      </div>
                      <div class="text-h4 font-weight-bold">
                        {{ stats.total }}
                      </div>
                    </v-card-text>
                  </v-card>
                  <v-card rounded="lg" variant="flat" border>
                    <v-card-text>
                      <div class="text-body-2 text-medium-emphasis">
                        المتاحة
                      </div>
                      <div class="text-h4 font-weight-bold">
                        {{ stats.available }}
                      </div>
                    </v-card-text>
                  </v-card>
                  <v-card rounded="lg" variant="flat" border>
                    <v-card-text>
                      <div class="text-body-2 text-medium-emphasis">
                        المباعة
                      </div>
                      <div class="text-h4 font-weight-bold">
                        {{ stats.sold }}
                      </div>
                    </v-card-text>
                  </v-card>
                  <v-card rounded="lg" variant="flat" border>
                    <v-card-text>
                      <div class="text-body-2 text-medium-emphasis">
                        المؤرشفة
                      </div>
                      <div class="text-h4 font-weight-bold">
                        {{ stats.archived }}
                      </div>
                    </v-card-text>
                  </v-card>
                </template>
              </div>

              <div class="action-grid mb-5">
                <v-card rounded="lg" variant="flat" border>
                  <v-card-title>إجراءات يومية</v-card-title>
                  <v-card-text class="quick-actions">
                    <v-btn
                      v-if="can('properties.create')"
                      variant="tonal"
                      prepend-icon="mdi-home-plus"
                      @click="openCreateForm"
                    >
                      تسجيل عرض جديد
                    </v-btn>
                    <v-btn
                      v-if="can('properties.read')"
                      variant="tonal"
                      prepend-icon="mdi-check-circle-outline"
                      @click="applyQuickFilter('status', 'available')"
                    >
                      العروض المتاحة
                    </v-btn>
                    <v-btn
                      v-if="can('properties.read')"
                      variant="tonal"
                      prepend-icon="mdi-tune"
                      @click="
                        activeView = 'properties';
                        advancedFiltersOpen = true;
                      "
                    >
                      فلاتر متقدمة
                    </v-btn>
                  </v-card-text>
                </v-card>
                <v-card rounded="lg" variant="flat" border>
                  <v-card-title>المناطق الأكثر تكراراً</v-card-title>
                  <v-card-text>
                    <v-chip
                      v-for="district in topDistricts"
                      :key="district.name"
                      class="ma-1"
                      variant="tonal"
                      @click="applyQuickFilter('district', district.name)"
                    >
                      {{ district.name }} · {{ district.count }}
                    </v-chip>
                    <v-empty-state
                      v-if="!topDistricts.length"
                      icon="mdi-map-marker-off"
                      title="لا توجد بيانات بعد"
                    />
                  </v-card-text>
                </v-card>
              </div>

              <v-row>
                <v-col cols="12" md="6">
                  <v-card rounded="lg" variant="flat" border>
                    <v-card-title>حسب نوع العقار</v-card-title>
                    <v-list lines="one">
                      <v-list-item
                        v-for="item in stats.by_type"
                        :key="item.name"
                        :title="item.name"
                      >
                        <template #append>
                          <v-chip color="primary" variant="tonal">{{
                            item.count
                          }}</v-chip>
                        </template>
                      </v-list-item>
                    </v-list>
                  </v-card>
                </v-col>
                <v-col cols="12" md="6">
                  <v-card rounded="lg" variant="flat" border>
                    <v-card-title>حسب الصفة القانونية</v-card-title>
                    <v-list lines="one">
                      <v-list-item
                        v-for="item in stats.by_legal_type"
                        :key="item.name"
                        :title="item.name"
                      >
                        <template #append>
                          <v-chip color="secondary" variant="tonal">{{
                            item.count
                          }}</v-chip>
                        </template>
                      </v-list-item>
                    </v-list>
                  </v-card>
                </v-col>
              </v-row>
            </div>

            <div v-else-if="activeView === 'properties'">
              <v-sheet class="filter-panel" rounded="lg" border>
                <div class="list-toolbar">
                  <v-text-field
                    ref="globalSearchRef"
                    v-model="filters.q"
                    label="بحث: كود، منطقة، مالك، هاتف"
                    density="compact"
                    hide-details
                    clearable
                    prepend-inner-icon="mdi-magnify"
                    @keyup.enter="loadProperties"
                  />
                  <v-select
                    v-model="filters.status"
                    :items="statuses"
                    label="الحالة"
                    density="compact"
                    hide-details
                    clearable
                  />
                  <v-btn
                    color="primary"
                    prepend-icon="mdi-filter"
                    @click="loadProperties"
                  >
                    تطبيق
                  </v-btn>
                  <v-btn
                    variant="tonal"
                    prepend-icon="mdi-tune"
                    @click="advancedFiltersOpen = !advancedFiltersOpen"
                  >
                    فلاتر
                  </v-btn>
                  <v-btn
                    variant="text"
                    prepend-icon="mdi-filter-remove"
                    @click="clearFilters"
                  >
                    مسح
                  </v-btn>
                </div>
                <v-expand-transition>
                  <div v-if="advancedFiltersOpen" class="advanced-grid">
                    <v-select
                      v-model="filters.property_type"
                      :items="propertyTypes"
                      label="نوع العقار"
                      density="compact"
                      hide-details
                      clearable
                    />
                    <v-select
                      v-model="filters.legal_type"
                      :items="legalTypes"
                      label="الصفة القانونية"
                      density="compact"
                      hide-details
                      clearable
                    />
                    <v-select
                      v-model="filters.area_unit"
                      :items="areaUnits"
                      label="وحدة المساحة"
                      density="compact"
                      hide-details
                      clearable
                    />
                    <v-select
                      v-model="filters.pricing_method"
                      :items="pricingMethods"
                      label="طريقة التسعير"
                      density="compact"
                      hide-details
                      clearable
                    />
                    <v-text-field
                      v-model="filters.district"
                      label="المنطقة"
                      density="compact"
                      hide-details
                      clearable
                    />
                    <v-text-field
                      v-model="filters.price_min"
                      label="السعر من"
                      type="number"
                      density="compact"
                      hide-details
                      clearable
                    />
                    <v-text-field
                      v-model="filters.price_max"
                      label="السعر إلى"
                      type="number"
                      density="compact"
                      hide-details
                      clearable
                    />
                  </div>
                </v-expand-transition>
              </v-sheet>

              <div class="table-meta">
                <span>النتيجة: {{ filteredCountLabel }}</span>
                <span class="shortcut-hint">Ctrl+N إضافة · Ctrl+K بحث</span>
              </div>

              <v-card rounded="lg" variant="flat" border>
                <v-skeleton-loader v-if="loading" type="table" />
                <v-empty-state
                  v-else-if="!properties.length"
                  icon="mdi-home-search-outline"
                  title="لا توجد عروض مطابقة"
                  text="غيّر الفلاتر أو أضف عرضاً جديداً."
                >
                  <template #actions>
                    <v-btn
                      color="primary"
                      prepend-icon="mdi-plus"
                      @click="openCreateForm"
                    >
                      إضافة عرض
                    </v-btn>
                  </template>
                </v-empty-state>
                <v-data-table
                  v-else
                  :headers="headers"
                  :items="properties"
                  item-value="id"
                  density="compact"
                  hover
                >
                  <template #item.area="{ item }"
                    >{{ item.area_value }} {{ item.area_unit }}</template
                  >
                  <template #item.total_price="{ item }">
                    <span class="money">{{
                      formatMoney(item.total_price)
                    }}</span>
                    دينار
                  </template>
                  <template #item.status="{ item }">
                    <v-chip
                      size="small"
                      :color="statusColor(item.status)"
                      variant="tonal"
                    >
                      {{ statusLabel(item.status) }}
                    </v-chip>
                  </template>
                  <template #item.actions="{ item }">
                    <div class="d-flex ga-1 justify-end">
                      <v-btn
                        icon="mdi-eye"
                        size="small"
                        variant="text"
                        title="عرض"
                        @click="viewDetails(item)"
                      />
                      <v-btn
                        v-if="can('properties.update')"
                        icon="mdi-pencil"
                        size="small"
                        variant="text"
                        title="تعديل"
                        @click="editProperty(item)"
                      />
                      <v-btn
                        v-if="
                          item.status === 'archived' &&
                          can('properties.restore')
                        "
                        icon="mdi-archive-arrow-up-outline"
                        color="success"
                        size="small"
                        variant="text"
                        title="إرجاع من الأرشيف"
                        @click="askRestore(item)"
                      />
                      <v-btn
                        v-else-if="can('properties.archive')"
                        icon="mdi-archive-arrow-down-outline"
                        color="warning"
                        size="small"
                        variant="text"
                        title="أرشفة"
                        @click="askArchive(item)"
                      />
                      <v-btn
                        v-if="can('properties.delete')"
                        icon="mdi-delete-outline"
                        size="small"
                        variant="text"
                        color="error"
                        title="حذف"
                        @click="askDelete(item)"
                      />
                    </div>
                  </template>
                </v-data-table>
              </v-card>
            </div>

            <div v-else-if="activeView === 'form'">
              <v-form ref="propertyFormRef" @submit.prevent="saveProperty">
                <v-card rounded="lg" variant="flat" border>
                  <v-card-title>{{
                    editingId ? "تعديل عرض عقاري" : "إضافة عرض عقاري"
                  }}</v-card-title>
                  <v-card-subtitle>
                    أدخل بيانات العقار والمالك. السعر الكلي يحسب فورياً ويعاد
                    حسابه في الـ API عند الحفظ.
                  </v-card-subtitle>
                  <v-card-text>
                    <div class="form-grid">
                      <v-select
                        v-model="form.property_type"
                        :items="propertyTypes"
                        :rules="[required]"
                        label="نوع العقار"
                      />
                      <v-select
                        v-model="form.legal_type"
                        :items="legalTypes"
                        :rules="[required]"
                        label="جنس الأرض / الصفة القانونية"
                      />
                      <v-select
                        v-model="form.status"
                        :items="statuses"
                        :rules="[required]"
                        label="الحالة"
                      />
                      <v-text-field
                        v-model="form.governorate"
                        label="المحافظة"
                      />
                      <v-text-field v-model="form.city" label="المدينة" />
                      <v-text-field v-model="form.district" label="المنطقة" />
                      <v-text-field
                        v-model="form.address_details"
                        class="span-3"
                        label="العنوان التفصيلي"
                      />
                      <v-text-field
                        v-model="form.area_value"
                        :rules="[required, positive]"
                        label="المساحة"
                        type="number"
                      />
                      <v-select
                        v-model="form.area_unit"
                        :items="areaUnits"
                        :rules="[required]"
                        label="وحدة المساحة"
                      />
                      <v-select
                        v-model="form.pricing_method"
                        :items="pricingMethods"
                        :rules="[required]"
                        label="طريقة التسعير"
                      />
                      <v-text-field
                        v-if="!isDirectPrice"
                        v-model="form.unit_price"
                        :rules="[required, positive]"
                        label="سعر الوحدة"
                        type="number"
                      />
                      <v-text-field
                        v-else
                        v-model="form.total_price"
                        :rules="[required, positive]"
                        label="السعر الإجمالي المباشر"
                        type="number"
                      />
                      <v-text-field
                        :model-value="formatMoney(computedTotal)"
                        label="السعر الكلي المحسوب"
                        readonly
                      />
                      <v-text-field
                        v-model="form.owner_name"
                        :rules="[required]"
                        label="اسم المالك"
                      />
                      <v-text-field
                        v-model="form.owner_phone"
                        :rules="[required]"
                        label="رقم هاتف المالك"
                      />
                      <v-textarea
                        v-model="form.owner_notes"
                        label="ملاحظات المالك"
                        rows="2"
                      />
                      <v-textarea
                        v-model="form.notes"
                        class="span-3"
                        label="ملاحظات العقار"
                        rows="3"
                      />
                    </div>
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer />
                    <v-btn variant="text" @click="setView('properties')"
                      >إلغاء</v-btn
                    >
                    <v-btn
                      color="primary"
                      type="submit"
                      :loading="saving"
                      prepend-icon="mdi-content-save"
                    >
                      حفظ
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </v-form>
            </div>

            <div v-else-if="activeView === 'users'">
              <v-card rounded="lg" variant="flat" border>
                <v-card-title class="d-flex align-center">
                  <span>إدارة المستخدمين</span>
                  <v-spacer />
                  <v-btn
                    v-if="can('users.create')"
                    color="primary"
                    prepend-icon="mdi-account-plus"
                    @click="openUserDialog()"
                  >
                    إضافة مستخدم
                  </v-btn>
                </v-card-title>
                <v-card-text>
                  <v-empty-state
                    v-if="!users.length"
                    icon="mdi-account-group-outline"
                    title="لا توجد مستخدمون"
                  />
                  <v-table v-else density="comfortable">
                    <thead>
                      <tr>
                        <th>المستخدم</th>
                        <th>الاسم</th>
                        <th>الأدوار</th>
                        <th>الحالة</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="user in users" :key="user.id">
                        <td>{{ user.username }}</td>
                        <td>{{ user.display_name }}</td>
                        <td>
                          <v-chip
                            v-for="role in user.roles"
                            :key="role.id"
                            class="ma-1"
                            size="small"
                            variant="tonal"
                          >
                            {{ role.name }}
                          </v-chip>
                        </td>
                        <td>
                          <v-chip
                            :color="user.is_active ? 'success' : undefined"
                            size="small"
                            variant="tonal"
                          >
                            {{ user.is_active ? "فعال" : "معطل" }}
                          </v-chip>
                        </td>
                        <td class="text-end">
                          <v-btn
                            v-if="can('users.update')"
                            icon="mdi-pencil"
                            size="small"
                            variant="text"
                            @click="openUserDialog(user)"
                          />
                          <v-btn
                            v-if="can('users.update')"
                            :icon="
                              user.is_active
                                ? 'mdi-account-off-outline'
                                : 'mdi-account-check-outline'
                            "
                            size="small"
                            variant="text"
                            @click="toggleUserActive(user)"
                          />
                          <v-btn
                            v-if="can('users.delete')"
                            icon="mdi-delete-outline"
                            color="error"
                            size="small"
                            variant="text"
                            @click="askDeleteUser(user)"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-card-text>
              </v-card>
            </div>

            <div v-else-if="activeView === 'roles'">
              <div class="settings-grid">
                <v-card rounded="lg" variant="flat" border>
                  <v-card-title class="d-flex align-center">
                    <span>الأدوار</span>
                    <v-spacer />
                    <v-btn
                      v-if="can('roles.create')"
                      color="primary"
                      prepend-icon="mdi-shield-plus-outline"
                      @click="openRoleDialog()"
                    >
                      إضافة Role
                    </v-btn>
                  </v-card-title>
                  <v-card-text>
                    <v-list lines="two">
                      <v-list-item
                        v-for="role in roles"
                        :key="role.id"
                        :title="role.name"
                        :subtitle="role.description || 'بدون وصف'"
                      >
                        <template #append>
                          <v-chip
                            v-if="role.is_system"
                            class="me-2"
                            size="small"
                            variant="tonal"
                            >System</v-chip
                          >
                          <v-btn
                            v-if="can('roles.update')"
                            icon="mdi-pencil"
                            size="small"
                            variant="text"
                            @click="openRoleDialog(role)"
                          />
                          <v-btn
                            v-if="can('roles.delete') && !role.is_system"
                            icon="mdi-delete-outline"
                            color="error"
                            size="small"
                            variant="text"
                            @click="askDeleteRole(role)"
                          />
                        </template>
                      </v-list-item>
                    </v-list>
                  </v-card-text>
                </v-card>

                <v-card rounded="lg" variant="flat" border>
                  <v-card-title class="d-flex align-center">
                    <span>الصلاحيات</span>
                    <v-spacer />
                    <v-btn
                      v-if="can('roles.create')"
                      variant="tonal"
                      prepend-icon="mdi-key-plus"
                      @click="openPermissionDialog()"
                    >
                      إضافة صلاحية
                    </v-btn>
                  </v-card-title>
                  <v-card-text>
                    <v-expansion-panels variant="accordion">
                      <v-expansion-panel
                        v-for="group in permissionsByModule"
                        :key="group.module"
                      >
                        <v-expansion-panel-title>{{
                          group.module
                        }}</v-expansion-panel-title>
                        <v-expansion-panel-text>
                          <v-list density="compact">
                            <v-list-item
                              v-for="permission in group.items"
                              :key="permission.id"
                              :title="permission.name"
                              :subtitle="permission.key"
                            >
                              <template #append>
                                <v-btn
                                  v-if="can('roles.update')"
                                  icon="mdi-pencil"
                                  size="small"
                                  variant="text"
                                  @click="openPermissionDialog(permission)"
                                />
                                <v-btn
                                  v-if="can('roles.delete')"
                                  icon="mdi-delete-outline"
                                  color="error"
                                  size="small"
                                  variant="text"
                                  @click="askDeletePermission(permission)"
                                />
                              </template>
                            </v-list-item>
                          </v-list>
                        </v-expansion-panel-text>
                      </v-expansion-panel>
                    </v-expansion-panels>
                  </v-card-text>
                </v-card>
              </div>
            </div>

            <div v-else-if="activeView === 'settings'">
              <div class="settings-grid">
                <v-card rounded="lg" variant="flat" border>
                  <v-card-title>المظهر</v-card-title>
                  <v-card-text>
                    <div class="d-flex align-center justify-space-between ga-4">
                      <div>
                        <div class="font-weight-bold">Light / Dark Mode</div>
                        <div class="text-body-2 text-medium-emphasis">
                          يتم حفظ اختيار الثيم محلياً على هذا الجهاز.
                        </div>
                      </div>
                      <v-switch
                        :model-value="isDarkMode"
                        color="primary"
                        hide-details
                        inset
                        @update:model-value="toggleTheme"
                      />
                    </div>
                  </v-card-text>
                </v-card>

                <v-card rounded="lg" variant="flat" border>
                  <v-card-title>الاتصال الخارجي</v-card-title>
                  <v-card-text>
                    <v-chip
                      class="mb-4"
                      :color="remoteStatus.running ? 'primary' : undefined"
                      variant="tonal"
                    >
                      {{ remoteStatus.running ? "يعمل" : "متوقف" }}
                    </v-chip>
                    <div v-if="remoteStatus.url" class="mb-3">
                      <div class="text-body-2 text-medium-emphasis">
                        رابط الاتصال الخارجي
                      </div>
                      <a
                        :href="remoteStatus.url"
                        target="_blank"
                        rel="noreferrer"
                        >{{ remoteStatus.url }}</a
                      >
                    </div>
                    <v-alert v-if="remoteStatus.message" variant="tonal">
                      {{ remoteStatus.message }}
                    </v-alert>
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer />
                    <v-btn
                      v-if="can('settings.update')"
                      color="primary"
                      prepend-icon="mdi-cloud-upload-outline"
                      @click="enableRemote"
                    >
                      تشغيل
                    </v-btn>
                    <v-btn
                      v-if="can('settings.update')"
                      variant="text"
                      prepend-icon="mdi-cloud-off-outline"
                      @click="disableRemote"
                    >
                      إيقاف
                    </v-btn>
                  </v-card-actions>
                </v-card>

                <v-card rounded="lg" variant="flat" border>
                  <v-card-title>النظام</v-card-title>
                  <v-list lines="two">
                    <v-list-item
                      title="الإصدار"
                      :subtitle="setupStatus.app_version"
                      prepend-icon="mdi-information-outline"
                    />
                    <v-list-item
                      title="قاعدة البيانات"
                      subtitle="PostgreSQL محلي"
                      prepend-icon="mdi-database-outline"
                    />
                    <v-list-item
                      title="المستخدم"
                      :subtitle="currentUser?.username"
                      prepend-icon="mdi-account-outline"
                    />
                  </v-list>
                </v-card>
              </div>
            </div>
          </section>
        </main>
      </v-main>

      <v-dialog v-model="detailsDialog" width="980">
        <v-card v-if="selectedProperty" rounded="lg">
          <v-card-title class="d-flex align-center ga-2">
            <span>{{ selectedProperty.code }}</span>
            <v-chip
              :color="statusColor(selectedProperty.status)"
              variant="tonal"
            >
              {{ statusLabel(selectedProperty.status) }}
            </v-chip>
            <v-spacer />
            <v-btn
              icon="mdi-close"
              variant="text"
              @click="detailsDialog = false"
            />
          </v-card-title>
          <v-card-text>
            <div class="detail-grid">
              <div class="detail-item">
                <div class="detail-label">نوع العقار</div>
                <div class="detail-value">
                  {{ selectedProperty.property_type }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">الصفة القانونية</div>
                <div class="detail-value">
                  {{ selectedProperty.legal_type }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المساحة</div>
                <div class="detail-value">
                  {{ selectedProperty.area_value }}
                  {{ selectedProperty.area_unit }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">طريقة التسعير</div>
                <div class="detail-value">
                  {{ selectedProperty.pricing_method }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">سعر الوحدة</div>
                <div class="detail-value">
                  <span class="money">{{
                    selectedProperty.unit_price
                      ? formatMoney(selectedProperty.unit_price)
                      : "-"
                  }}</span>
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">السعر الكلي</div>
                <div class="detail-value">
                  <span class="money">{{
                    formatMoney(selectedProperty.total_price)
                  }}</span>
                  دينار
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المحافظة</div>
                <div class="detail-value">
                  {{ selectedProperty.governorate || "-" }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المدينة</div>
                <div class="detail-value">
                  {{ selectedProperty.city || "-" }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المنطقة</div>
                <div class="detail-value">
                  {{ selectedProperty.district || "-" }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">اسم المالك</div>
                <div class="detail-value">
                  {{ selectedProperty.owner_name }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">هاتف المالك</div>
                <div class="detail-value">
                  {{ selectedProperty.owner_phone }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">آخر تحديث</div>
                <div class="detail-value">
                  {{
                    new Date(selectedProperty.updated_at).toLocaleString(
                      "ar-IQ",
                    )
                  }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">العنوان التفصيلي</div>
                <div class="detail-value">
                  {{ selectedProperty.address_details || "-" }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">ملاحظات المالك</div>
                <div class="detail-value">
                  {{ selectedProperty.owner_notes || "-" }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">ملاحظات العقار</div>
                <div class="detail-value">
                  {{ selectedProperty.notes || "-" }}
                </div>
              </div>
            </div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              v-if="can('properties.update')"
              variant="tonal"
              prepend-icon="mdi-pencil"
              @click="editProperty(selectedProperty)"
              >تعديل</v-btn
            >
            <v-btn
              v-if="
                selectedProperty.status === 'archived' &&
                can('properties.restore')
              "
              color="success"
              variant="tonal"
              prepend-icon="mdi-archive-arrow-up-outline"
              @click="askRestore(selectedProperty)"
              >إرجاع من الأرشيف</v-btn
            >
            <v-btn
              v-else-if="can('properties.archive')"
              color="warning"
              variant="tonal"
              prepend-icon="mdi-archive-arrow-down-outline"
              @click="askArchive(selectedProperty)"
              >أرشفة</v-btn
            >
            <v-btn
              v-if="can('properties.delete')"
              color="error"
              variant="text"
              prepend-icon="mdi-delete-outline"
              @click="askDelete(selectedProperty)"
              >حذف</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-dialog>

      <v-dialog v-model="userDialog" width="620">
        <v-card rounded="lg">
          <v-card-title>{{
            editingUserId ? "تعديل مستخدم" : "إضافة مستخدم"
          }}</v-card-title>
          <v-card-text>
            <div class="dialog-grid">
              <v-text-field v-model="userForm.username" label="Username" />
              <v-text-field
                v-model="userForm.display_name"
                label="الاسم الظاهر"
              />
              <v-text-field
                v-model="userForm.pin"
                :label="editingUserId ? 'PIN جديد اختياري' : 'PIN'"
                type="password"
              />
              <v-switch
                v-model="userForm.is_active"
                label="فعال"
                color="primary"
                hide-details
              />
              <v-select
                v-model="userForm.role_ids"
                :items="roles"
                item-title="name"
                item-value="id"
                label="الأدوار"
                multiple
                chips
                class="span-2"
              />
            </div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="userDialog = false">إلغاء</v-btn>
            <v-btn color="primary" variant="flat" @click="saveUser">حفظ</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <v-dialog v-model="roleDialog" width="760">
        <v-card rounded="lg">
          <v-card-title>{{
            editingRoleId ? "تعديل Role" : "إضافة Role"
          }}</v-card-title>
          <v-card-text>
            <div class="dialog-grid">
              <v-text-field v-model="roleForm.name" label="اسم الدور" />
              <v-text-field v-model="roleForm.description" label="الوصف" />
            </div>
            <v-divider class="my-4" />
            <div class="text-subtitle-2 mb-2">الصلاحيات</div>
            <v-expansion-panels variant="accordion">
              <v-expansion-panel
                v-for="group in permissionsByModule"
                :key="group.module"
              >
                <v-expansion-panel-title>{{
                  group.module
                }}</v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-checkbox
                    v-for="permission in group.items"
                    :key="permission.id"
                    v-model="roleForm.permission_ids"
                    :value="permission.id"
                    :label="`${permission.name} (${permission.key})`"
                    density="compact"
                    hide-details
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="roleDialog = false">إلغاء</v-btn>
            <v-btn color="primary" variant="flat" @click="saveRole">حفظ</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <v-dialog v-model="permissionDialog" width="620">
        <v-card rounded="lg">
          <v-card-title>{{
            editingPermissionId ? "تعديل صلاحية" : "إضافة صلاحية"
          }}</v-card-title>
          <v-card-text>
            <div class="dialog-grid">
              <v-text-field
                v-model="permissionForm.key"
                label="Permission Key"
              />
              <v-text-field v-model="permissionForm.name" label="الاسم" />
              <v-text-field v-model="permissionForm.module" label="Module" />
              <v-text-field
                v-model="permissionForm.description"
                label="الوصف"
              />
            </div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="permissionDialog = false"
              >إلغاء</v-btn
            >
            <v-btn color="primary" variant="flat" @click="savePermission"
              >حفظ</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-dialog>

      <v-dialog v-model="confirmDialog.open" width="430">
        <v-card rounded="lg">
          <v-card-title>{{ confirmDialog.title }}</v-card-title>
          <v-card-text>{{ confirmDialog.body }}</v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="confirmDialog.open = false"
              >إلغاء</v-btn
            >
            <v-btn
              :color="confirmDialog.color"
              variant="flat"
              :loading="confirmDialog.loading"
              @click="runConfirmedAction"
            >
              {{ confirmDialog.confirmText }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3600">
      {{ snackbar.text }}
    </v-snackbar>
  </v-app>
</template>
