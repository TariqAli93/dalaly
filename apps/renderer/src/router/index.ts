import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";
import { useSetup } from "../composables/useSetup";
import { useAuth } from "../composables/useAuth";
import { usePermissions } from "../composables/usePermissions";

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    permission?: string;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: "/first-run",
    name: "first-run",
    component: () => import("../pages/FirstRunWizardPage.vue"),
  },
  {
    path: "/login",
    name: "login",
    component: () => import("../pages/LoginPage.vue"),
  },
  {
    path: "/",
    name: "dashboard",
    component: () => import("../pages/DashboardPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/properties",
    name: "properties",
    component: () => import("../pages/PropertiesPage.vue"),
    meta: { requiresAuth: true, permission: "properties.read" },
  },
  {
    path: "/properties/new",
    name: "property-new",
    component: () => import("../pages/PropertyFormPage.vue"),
    meta: { requiresAuth: true, permission: "properties.create" },
  },
  {
    path: "/properties/:id/edit",
    name: "property-edit",
    component: () => import("../pages/PropertyFormPage.vue"),
    meta: { requiresAuth: true, permission: "properties.update" },
  },
  {
    path: "/users",
    name: "users",
    component: () => import("../pages/UsersPage.vue"),
    meta: { requiresAuth: true, permission: "users.read" },
  },
  {
    path: "/roles",
    name: "roles",
    component: () => import("../pages/RolesPage.vue"),
    meta: { requiresAuth: true, permission: "roles.read" },
  },
  {
    path: "/favorites",
    name: "favorites",
    component: () => import("../pages/FavoritesPage.vue"),
    meta: { requiresAuth: true, permission: "properties.read" },
  },
  {
    path: "/locations",
    name: "locations",
    component: () => import("../pages/LocationsPage.vue"),
    meta: { requiresAuth: true, permission: "locations.manage" },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("../pages/SettingsPage.vue"),
    meta: { requiresAuth: true, permission: "settings.read" },
  },
  {
    path: "/help",
    name: "help",
    component: () => import("../pages/HelpPage.vue"),
    meta: { requiresAuth: true },
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const { status, fetchStatus } = useSetup();
  const { hasToken, currentUser, loadCurrentUser, clearAuthState } = useAuth();
  const { can } = usePermissions();

  let setup = status.value;
  if (!setup) {
    try {
      setup = await fetchStatus();
    } catch {
      // الـ API غير متاح بعد: اسمح بصفحات الإعداد/الدخول فقط.
      return to.path === "/login" || to.path === "/first-run"
        ? true
        : { path: "/login" };
    }
  }

  const ready =
    setup.db_configured &&
    setup.db_connected &&
    setup.migrations_ok &&
    setup.users_table_exists &&
    setup.admin_exists;

  // النظام غير مهيأ بالكامل → First Run Wizard.
  if (!ready) {
    return to.path === "/first-run" ? true : { path: "/first-run" };
  }

  // النظام مهيأ مسبقاً → لا يظهر الـ Wizard مرة ثانية.
  if (to.path === "/first-run") {
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

  return true;
});
