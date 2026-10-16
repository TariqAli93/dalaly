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
    titleKey?: string;
  }
}

const routes: RouteRecordRaw[] = [
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
    path: "/contracts/review",
    name: "contract-review",
    component: () => import("../pages/ContractsPage.vue"),
    props: { reviewMode: true },
    meta: {
      requiresAuth: true,
      permission: "contracts.read",
      titleKey: "routes.contracts",
    },
  },
  {
    path: "/contracts/:id/review",
    name: "contract-review-details",
    component: () => import("../pages/ContractReviewPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "contracts.read",
      titleKey: "routes.contracts",
    },
  },
  {
    path: "/contracts/create",
    name: "contract-create",
    component: () => import("../pages/ContractFormPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "contracts.manage",
      titleKey: "routes.contracts",
    },
  },
  {
    path: "/contracts/:id/edit",
    name: "contract-edit",
    component: () => import("../pages/ContractFormPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "contracts.manage",
      titleKey: "routes.contracts",
    },
  },
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
      titleKey: "routes.rentals",
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
      titleKey: "routes.rentals",
    },
  },
  {
    path: "/purchase-requests",
    name: "purchase-requests",
    component: () => import("../pages/PurchaseRequestsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "requests.read",
      titleKey: "routes.properties",
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
  {
    path: "/contracts",
    name: "contracts",
    component: () => import("../pages/ContractsPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "contracts.read",
      titleKey: "routes.contracts",
    },
  },
  {
    path: "/settings/legal-content",
    alias: "/contracts/legal-templates",
    name: "legal-content",
    component: () => import("../pages/LegalContentPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "legal_content.read",
      titleKey: "routes.settings",
    },
  },
  {
    path: "/contract-templates",
    name: "contract-templates",
    component: () => import("../pages/ContractTemplatesPage.vue"),
    meta: {
      requiresAuth: true,
      permission: "contract_templates.manage",
      titleKey: "routes.contracts",
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
      titleKey: "routes.properties",
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

  return true;
});
