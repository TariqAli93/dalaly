<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useDisplay, useTheme } from "vuetify";
import { CRM_NAV_ITEMS, NAV_ITEMS } from "../../constants/domain";
import { useAuth } from "../../composables/useAuth";
import { usePermissions } from "../../composables/usePermissions";
import { appearance } from "../../composables/useAppearance";

// نموذج فتح/إغلاق الدرج (يُتحكَّم به من الشريط العلوي على الجوال).
const drawer = defineModel<boolean>({ default: false });
// نموذج الطيّ (rail) على سطح المكتب: يعرض الأيقونات فقط.
const rail = defineModel<boolean>("rail", { default: false });

const router = useRouter();
const { mdAndUp } = useDisplay();
const theme = useTheme();
const { can } = usePermissions();
const { currentUser, logout } = useAuth();

// تحترم RBAC: تُخفى العناصر التي لا يملك المستخدم صلاحيتها. (نفس المنطق السابق)
const navItems = computed(() =>
  [...NAV_ITEMS, ...CRM_NAV_ITEMS].filter(
    (item) => !item.permission || can(item.permission),
  ),
);

// وضع الأيقونات فقط يُفعّل تلميحات التنقّل.
const isRail = computed(() => rail.value && mdAndUp.value);

// قائمة مسطّحة تحفظ ترتيب الروابط الحالي وشروط صلاحياتها.
const NAV_ORDER = [
  "/",
  "/properties",
  "/rentals",
  "/people",
  "/contracts",
  "/properties/new",
  "/rentals/new",
  "/favorites",
  "/rental-favorites",
  "/rental-requests",
  "/purchase-requests",
  "/documents",
  "/contract-templates",
  "/settings/legal-content",
  "/users",
  "/roles",
  "/locations",
  "/settings",
  "/help",
];

const orderedNav = computed(() =>
  NAV_ORDER.flatMap((path) =>
    navItems.value.filter((item) => item.to === path),
  ),
);

function go(to: string) {
  if (!mdAndUp.value) drawer.value = false;
  void router.push(to);
}

async function onLogout() {
  await logout();
  void router.push("/login");
}
</script>

<template>
  <v-navigation-drawer
    v-model="drawer"
    class="dal-nav-drawer"
    :color="
      appearance.colors[
        theme.global.current.value.dark ? 'dalalyDark' : 'dalalyLight'
      ].sidebar
    "
    :rail="isRail"
    rail-width="64"
    location="right"
    :permanent="mdAndUp"
    :temporary="!mdAndUp"
    width="224"
  >
    <div class="dal-brand">
      <v-icon icon="mdi-home-city-outline" size="32" />
      <div v-if="!isRail">
        <div class="dal-brand__title">دلالي</div>
        <div class="dal-brand__sub">إدارة العروض العقارية</div>
      </div>
    </div>

    <v-divider />

    <v-list nav density="compact">
      <v-tooltip
        v-for="item in orderedNav"
        :key="item.to"
        :text="item.title"
        :disabled="!isRail"
        location="start"
      >
        <template #activator="{ props }">
          <v-list-item
            v-bind="props"
            :to="item.to"
            :active="
              $route.path === item.to ||
              (item.to === '/people' && $route.path.startsWith('/clients/')) ||
              (['/properties', '/contracts'].includes(item.to) &&
                $route.path.startsWith(item.to + '/') &&
                $route.path !== item.to + '/new')
            "
            :prepend-icon="item.icon"
            :aria-label="item.title"
            class="dal-nav-item"
            :title="
              item.to === '/'
                ? 'لوحة التحكم'
                : item.to === '/people'
                  ? 'العملاء والأشخاص'
                  : item.title
            "
            @click="go(item.to)"
          />
        </template>
      </v-tooltip>
    </v-list>

    <template #append>
      <div class="dal-nav-footer">
        <v-list nav density="compact">
          <v-tooltip
            :text="currentUser?.username ?? 'مستخدم'"
            :disabled="!isRail"
            location="start"
          >
            <template #activator="{ props }">
              <v-list-item
                v-bind="props"
                :title="currentUser?.username ?? 'مستخدم'"
                subtitle="جلسة محلية"
                prepend-icon="mdi-account-circle-outline"
              />
            </template>
          </v-tooltip>
          <v-tooltip text="تسجيل الخروج" :disabled="!isRail" location="start">
            <template #activator="{ props }">
              <v-list-item
                v-bind="props"
                title="تسجيل الخروج"
                prepend-icon="mdi-logout"
                base-color="on-sidebar"
                aria-label="تسجيل الخروج"
                link
                role="button"
                tabindex="0"
                @click="onLogout"
              />
            </template>
          </v-tooltip>
        </v-list>
      </div>
    </template>
  </v-navigation-drawer>
</template>
