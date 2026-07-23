<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import { NAV_ITEMS } from "../../constants/domain";
import { useAuth } from "../../composables/useAuth";
import { usePermissions } from "../../composables/usePermissions";

// نموذج فتح/إغلاق الدرج (يُتحكَّم به من الشريط العلوي على الجوال).
const drawer = defineModel<boolean>({ default: false });
// نموذج الطيّ (rail) على سطح المكتب: يعرض الأيقونات فقط.
const rail = defineModel<boolean>("rail", { default: false });

const router = useRouter();
const { mdAndUp } = useDisplay();
const { can } = usePermissions();
const { currentUser, logout } = useAuth();

// تحترم RBAC: تُخفى العناصر التي لا يملك المستخدم صلاحيتها. (نفس المنطق السابق)
const navItems = computed(() =>
  NAV_ITEMS.filter((item) => !item.permission || can(item.permission)),
);

// وضع الأيقونات فقط: يُفعّل تلميحات Tooltip ويخفي عناوين المجموعات.
const isRail = computed(() => rail.value && mdAndUp.value);

// تجميع بصري فوق NAV_ITEMS دون تغيير مصدرها أو شروط صلاحياتها.
// كل مجموعة تُبنى من العناصر المسموح بها فقط، وتُخفى إن خلت.
const NAV_GROUPS: { title: string; paths: string[] }[] = [
  { title: "", paths: ["/", "/properties", "/properties/new", "/favorites"] },
  { title: "الإدارة", paths: ["/users", "/roles", "/locations"] },
  { title: "النظام", paths: ["/settings", "/help"] },
];

const groupedNav = computed(() =>
  NAV_GROUPS.map((group) => ({
    title: group.title,
    items: navItems.value.filter((item) => group.paths.includes(item.to)),
  })).filter((group) => group.items.length > 0),
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
    :rail="isRail"
    rail-width="56"
    location="right"
    :permanent="mdAndUp"
    :temporary="!mdAndUp"
    width="240"
  >
    <div class="dal-brand">
      <v-icon icon="mdi-home-city" color="primary" size="26" />
      <div v-if="!isRail">
        <div class="dal-brand__title">دلالي</div>
        <div class="dal-brand__sub">إدارة العروض العقارية</div>
      </div>
    </div>

    <v-divider />

    <v-list nav density="compact">
      <template v-for="(group, gi) in groupedNav" :key="gi">
        <div v-if="group.title && !isRail" class="dal-nav-subheader">
          {{ group.title }}
        </div>
        <v-divider v-else-if="group.title && isRail" class="my-2" />

        <v-tooltip
          v-for="item in group.items"
          :key="item.to"
          :text="item.title"
          :disabled="!isRail"
          location="start"
        >
          <template #activator="{ props }">
            <v-list-item
              v-bind="props"
              :active="$route.path === item.to"
              :prepend-icon="item.icon"
              :title="item.title"
              color="primary"
              @click="go(item.to)"
            />
          </template>
        </v-tooltip>
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
          <v-tooltip
            text="تسجيل الخروج"
            :disabled="!isRail"
            location="start"
          >
            <template #activator="{ props }">
              <v-list-item
                v-bind="props"
                title="تسجيل الخروج"
                prepend-icon="mdi-logout"
                base-color="error"
                @click="onLogout"
              />
            </template>
          </v-tooltip>
        </v-list>
      </div>
    </template>
  </v-navigation-drawer>
</template>
