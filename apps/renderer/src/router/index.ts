import {
  createRouter,
  createWebHashHistory,
  type RouteLocationNormalized,
  type RouteRecordRaw,
} from "vue-router";
import { useSetup } from "../composables/useSetup";
import { useAuth } from "../composables/useAuth";
import { usePermissions } from "../composables/usePermissions";

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    /** A key, or keys of which any one opens the page. */
    permission?: string | string[];
    titleKey?: string;
  }
}

/**
 * روابط ?open=<id> القديمة (لوحة التحكم، البحث، المطابقة) كانت تفتح حواراً
 * فوق القائمة؛ للعرض الإيجاري وللطلب الآن صفحة سجل، فيُحوَّل الرابط إليها.
 * في الحارس العام لا beforeEnter: هذا لا يعمل حين يتغيّر الاستعلام وحده
 * والقائمة مفتوحة.
 */
const RECORD_LISTS = new Set([
  "/rentals",
  "/rental-requests",
  "/purchase-requests",
]);
function openRecord(to: RouteLocationNormalized) {
  if (!RECORD_LISTS.has(to.path)) return null;
  const id = Number(to.query.open);
  return Number.isSafeInteger(id) && id > 0 ? `${to.path}/${id}` : null;
}

// صفحات ما بعد تسجيل الدخول: أبناء AppLayout، فيبقى الإطار (القائمة والشريط
// العلوي) مركّباً أثناء التنقّل بينها.
const appPages: RouteRecordRaw[] = [
  {
    path: "/clients/:id",
    alias: "/people/:id",
    name: "person-details",
    component: () => import("../pages/PersonDetailsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "people.read",
      titleKey: "routes.people",
    },
  },
  {
    path: "/properties/:id",
    name: "property-details",
    component: () => import("../pages/PropertyDetailsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "properties.read",
      titleKey: "routes.properties",
    },
  },
  {
    path: "",
    name: "dashboard",
    component: () => import("../pages/DashboardPage.vue"),
    meta: { requiresAuth: true, titleKey: "routes.dashboard" },
  },
  {
    path: "/properties",
    name: "properties",
    component: () => import("../pages/PropertiesPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "properties.read",
      titleKey: "routes.properties",
    },
  },
  {
    path: "/properties/new",
    name: "property-new",
    component: () => import("../pages/PropertyFormPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "properties.create",
      titleKey: "routes.propertyNew",
    },
  },
  {
    path: "/properties/:id/edit",
    name: "property-edit",
    component: () => import("../pages/PropertyFormPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "properties.update",
      titleKey: "routes.propertyEdit",
    },
  },
  {
    path: "/rentals",
    name: "rentals",
    component: () => import("../pages/RentalsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "rentals.read",
      titleKey: "routes.rentals",
    },
  },
  {
    path: "/rentals/:id(\\d+)",
    name: "rental-details",
    component: () => import("../pages/RentalDetailsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "rentals.read",
      titleKey: "routes.rentals",
    },
  },
  {
    path: "/rentals/new",
    name: "rental-new",
    component: () => import("../pages/RentalFormPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "rentals.create",
      titleKey: "routes.rentalNew",
    },
  },
  {
    path: "/rentals/:id/edit",
    name: "rental-edit",
    component: () => import("../pages/RentalFormPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "rentals.update",
      titleKey: "routes.rentalEdit",
    },
  },
  {
    path: "/rental-favorites",
    name: "rental-favorites",
    component: () => import("../pages/RentalFavoritesPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "rentals.read",
      titleKey: "routes.rentalFavorites",
    },
  },
  {
    path: "/people",
    name: "people",
    component: () => import("../pages/PeoplePage.vue"),
    meta: {
      requiresAuth: true,
      permission: "people.read",
      titleKey: "routes.people",
    },
  },
  { path: "/customers", redirect: "/people" },
  {
    path: "/rental-requests",
    name: "rental-requests",
    component: () => import("../pages/RentalRequestsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "requests.read",
      titleKey: "routes.rentalRequests",
    },
  },
  {
    path: "/rental-requests/:id(\\d+)",
    name: "rental-request-details",
    component: () => import("../pages/RequestDetailsPage.vue"),
    props: { mode: "rental" },
    meta: {
      requiresAuth: true,
      permission: "requests.read",
      titleKey: "routes.rentalRequests",
    },
  },
  {
    path: "/purchase-requests",
    name: "purchase-requests",
    component: () => import("../pages/PurchaseRequestsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "requests.read",
      titleKey: "routes.purchaseRequests",
    },
  },
  {
    path: "/purchase-requests/:id(\\d+)",
    name: "purchase-request-details",
    component: () => import("../pages/RequestDetailsPage.vue"),
    props: { mode: "purchase" },
    meta: {
      requiresAuth: true,
      permission: "requests.read",
      titleKey: "routes.purchaseRequests",
    },
  },
  // الصفقات: اللوحة والجدول، وصفحة كل صفقة.
  {
    path: "/deals",
    name: "deals",
    component: () => import("../pages/DealsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "deals.read",
      titleKey: "routes.deals",
    },
  },
  {
    path: "/deals/:id(\\d+)",
    name: "deal-details",
    component: () => import("../pages/DealPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "deals.read",
      titleKey: "routes.deals",
    },
  },
  // المالية: دليل الحسابات وكشوفها، والقيود.
  {
    path: "/accounting/accounts",
    name: "accounts",
    component: () => import("../pages/AccountsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "accounting.read",
      titleKey: "routes.accounts",
    },
  },
  {
    path: "/accounting/accounts/:id(\\d+)",
    name: "account-statement",
    component: () => import("../pages/AccountStatementPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "accounting.read",
      titleKey: "routes.accountStatement",
    },
  },
  {
    path: "/accounting/cash",
    name: "cash",
    component: () => import("../pages/CashPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "cash.read",
      titleKey: "routes.cash",
    },
  },
  {
    path: "/accounting/commissions",
    name: "commissions",
    component: () => import("../pages/CommissionsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "commissions.read",
      titleKey: "routes.commissions",
    },
  },
  {
    path: "/accounting/commissions/:id(\\d+)",
    name: "commission",
    component: () => import("../pages/CommissionPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "commissions.read",
      titleKey: "routes.commissions",
    },
  },
  {
    path: "/accounting/vouchers",
    name: "vouchers",
    component: () => import("../pages/VouchersPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "vouchers.read",
      titleKey: "routes.vouchers",
    },
  },
  {
    path: "/accounting/vouchers/:id(\\d+)",
    name: "voucher",
    component: () => import("../pages/VoucherPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "vouchers.read",
      titleKey: "routes.vouchers",
    },
  },
  {
    path: "/accounting/journal",
    name: "journal",
    component: () => import("../pages/JournalPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "accounting.read",
      titleKey: "routes.journal",
    },
  },
  {
    path: "/accounting/journal/:id(\\d+)",
    name: "journal-entry",
    component: () => import("../pages/JournalEntryPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "accounting.read",
      titleKey: "routes.journal",
    },
  },
  // المهام والمتابعات: تكفي أي صلاحية قراءة متابعات؛ القائمة تعرض ما تسمح به.
  {
    path: "/tasks",
    name: "tasks",
    component: () => import("../pages/TasksPage.vue"),
    meta: {
      requiresAuth: true,
      permission: ["followups.read", "rentals.followups.read"],
      titleKey: "routes.tasks",
    },
  },
  {
    path: "/documents",
    name: "documents",
    component: () => import("../pages/DocumentsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "documents.read",
      titleKey: "routes.documents",
    },
  },
  // العقود: القائمة، إنشاء عقد (اختيار النوع)، صفحة العقد بخطواتها، والقوالب
  // الأربعة ومحررها. المحرر يُحمَّل مع صفحته فقط.
  {
    path: "/contracts",
    name: "contracts",
    component: () => import("../pages/ContractsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "agreements.read",
      titleKey: "routes.contracts",
    },
  },
  {
    path: "/contracts/new",
    name: "contract-new",
    component: () => import("../pages/ContractWorkspacePage.vue"),
    meta: {
      requiresAuth: true,
      permission: "agreements.manage",
      titleKey: "routes.contracts",
    },
  },
  {
    path: "/contracts/:id(\\d+)",
    name: "contract-details",
    component: () => import("../pages/ContractWorkspacePage.vue"),
    meta: {
      requiresAuth: true,
      permission: "agreements.read",
      titleKey: "routes.contracts",
    },
  },
  {
    path: "/contracts/templates",
    name: "contract-templates",
    component: () => import("../pages/ContractTemplatesPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "agreements.templates",
      titleKey: "routes.contractTemplates",
    },
  },
  {
    path: "/contracts/templates/:key",
    name: "contract-template-studio",
    component: () => import("../pages/ContractTemplateStudioPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "agreements.templates",
      titleKey: "routes.contractTemplates",
    },
  },
  {
    path: "/users",
    name: "users",
    component: () => import("../pages/UsersPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "users.read",
      titleKey: "routes.users",
    },
  },
  {
    path: "/roles",
    name: "roles",
    component: () => import("../pages/RolesPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "roles.read",
      titleKey: "routes.roles",
    },
  },
  {
    path: "/favorites",
    name: "favorites",
    component: () => import("../pages/FavoritesPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "properties.read",
      titleKey: "routes.favorites",
    },
  },
  {
    path: "/locations",
    name: "locations",
    component: () => import("../pages/LocationsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "locations.manage",
      titleKey: "routes.locations",
    },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("../pages/SettingsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "settings.read",
      titleKey: "routes.settings",
    },
  },
  {
    path: "/help",
    name: "help",
    component: () => import("../pages/HelpPage.vue"),
    meta: { requiresAuth: true, titleKey: "routes.help" },
  },
];

const routes: RouteRecordRaw[] = [
  {
    path: "/setup",
    alias: "/first-run",
    name: "first-run",
    component: () => import("../pages/FirstRunWizardPage.vue"),
  },
  {
    path: "/startup-error",
    name: "startup-error",
    component: () => import("../pages/StartupErrorPage.vue"),
  },
  {
    path: "/login",
    name: "login",
    component: () => import("../pages/LoginPage.vue"),
  },
  {
    path: "/",
    component: () => import("../layouts/AppLayout.vue"),
    children: appPages,
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const { status, startupState, fetchStatus } = useSetup();
  const { hasToken, currentUser, loadCurrentUser, clearAuthState } = useAuth();
  const { can } = usePermissions();

  let setup = status.value;
  if (to.name === "startup-error" && startupState.value === "ERROR")
    return true;
  if (!setup) {
    try {
      setup = await fetchStatus();
      performance.mark("dalaly:status-fetched");
    } catch {
      return { name: "startup-error" };
    }
  }

  if (setup.startup_state === "ERROR") {
    return to.name === "startup-error" ? true : { name: "startup-error" };
  }
  if (setup.startup_state === "SETUP_REQUIRED") {
    return to.name === "first-run" ? true : { path: "/setup" };
  }

  // النظام مهيأ مسبقاً → لا يظهر الـ Wizard مرة ثانية.
  if (to.name === "first-run" || to.name === "startup-error") {
    return { path: "/login" };
  }

  if (to.meta.requiresAuth) {
    if (!hasToken()) {
      return { path: "/login", query: { redirect: to.fullPath } };
    }
    if (!currentUser.value) {
      try {
        await loadCurrentUser();
      } catch {
        clearAuthState();
        return { path: "/login", query: { redirect: to.fullPath } };
      }
    }
    if (to.meta.permission && !can(to.meta.permission)) {
      return { path: "/" };
    }
  }

  if (to.path === "/login" && hasToken() && currentUser.value) {
    return { path: "/" };
  }

  return openRecord(to) ?? true;
});
