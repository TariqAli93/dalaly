<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useDisplay, useTheme } from "vuetify";
import { isNavActive, NAV_SECTIONS } from "../../constants/domain";
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

// وضع الأيقونات فقط يُفعّل تلميحات التنقّل.
const isRail = computed(() => rail.value && mdAndUp.value);

// تحترم RBAC: تُخفى العناصر التي لا يملك المستخدم صلاحيتها، ثم المجموعات الفارغة.
const sections = computed(() =>
  NAV_SECTIONS.map((section) => ({
    title: section.title,
    items: section.items.filter(
      (item) => !item.permission || can(item.permission),
    ),
  })).filter((section) => section.items.length),
);
function go() {
  if (!mdAndUp.value) drawer.value = false;
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

    <v-list nav density="compact" aria-label="التنقل الرئيسي">
      <template
        v-for="(section, index) in sections"
        :key="section.title ?? 'home'"
      >
        <v-divider v-if="index && isRail" class="my-2" />
        <v-list-subheader
          v-if="section.title && !isRail"
          class="dal-nav-section"
          >{{ section.title }}</v-list-subheader
        >
        <template v-for="item in section.items" :key="item.to">
          <v-tooltip :text="item.title" :disabled="!isRail" location="start">
            <template #activator="{ props }">
              <v-list-item
                v-bind="props"
                :to="item.to"
                :active="isNavActive(item, $route.path)"
                :prepend-icon="item.icon"
                :aria-label="item.title"
                :aria-current="
                  isNavActive(item, $route.path) ? 'page' : undefined
                "
                class="dal-nav-item"
                :title="item.title"
                @click="go()"
              />
            </template>
          </v-tooltip>
        </template>
      </template>
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

<style scoped>
.dal-nav-section {
  min-height: 28px;
  font-size: 11px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-sidebar));
  opacity: 0.75;
  letter-spacing: 0;
}
.dal-nav-item {
  min-height: 36px;
  font-size: 13px;
}
</style>
