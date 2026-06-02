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

// تحترم RBAC: تُخفى العناصر التي لا يملك المستخدم صلاحيتها.
const navItems = computed(() =>
  NAV_ITEMS.filter((item) => !item.permission || can(item.permission)),
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
    :rail="rail && mdAndUp"
    rail-width="72"
    location="right"
    :permanent="mdAndUp"
    :temporary="!mdAndUp"
    width="260"
  >
    <div class="sidebar-brand">
      <v-icon icon="mdi-home-city-outline" color="primary" size="28" />
      <span v-if="!(rail && mdAndUp)" class="sidebar-title">دلالي</span>
    </div>

    <v-divider />

    <v-list nav density="comfortable">
      <v-list-item
        v-for="item in navItems"
        :key="item.to"
        :active="$route.path === item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        color="primary"
        @click="go(item.to)"
      />
    </v-list>

    <template #append>
      <v-divider />
      <v-list nav density="comfortable">
        <v-list-item
          :title="currentUser?.username ?? 'مستخدم'"
          subtitle="جلسة محلية"
          prepend-icon="mdi-account-circle-outline"
        />
        <v-list-item
          title="تسجيل الخروج"
          prepend-icon="mdi-logout"
          base-color="error"
          @click="onLogout"
        />
      </v-list>
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
}
.sidebar-title {
  font-size: 20px;
  font-weight: 700;
}
</style>
