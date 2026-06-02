<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import { NAV_ITEMS } from "../../constants/domain";
import { useAuth } from "../../composables/useAuth";
import { usePermissions } from "../../composables/usePermissions";
import { useProperties } from "../../composables/useProperties";
import ThemeToggle from "./ThemeToggle.vue";

const emit = defineEmits<{ refresh: [] }>();

const router = useRouter();
const { mdAndUp } = useDisplay();
const { can } = usePermissions();
const { currentUser, logout } = useAuth();
const { filters, loadProperties } = useProperties();

const mobileMenuOpen = ref(false);

const navItems = computed(() =>
  NAV_ITEMS.filter((item) => !item.permission || can(item.permission)),
);

function go(to: string) {
  mobileMenuOpen.value = false;
  void router.push(to);
}

function runSearch() {
  void router.push("/properties").then(() => loadProperties());
}

async function onLogout() {
  await logout();
  void router.push("/login");
}
</script>

<template>
  <v-app-bar class="top-navbar" flat border density="comfortable">
    <v-app-bar-nav-icon v-if="!mdAndUp" @click="mobileMenuOpen = true" />
    <v-app-bar-title class="font-weight-bold">دلالي</v-app-bar-title>

    <div v-if="mdAndUp" class="nav-actions">
      <v-btn
        v-for="item in navItems"
        :key="item.to"
        :variant="$route.path === item.to ? 'flat' : 'text'"
        :color="$route.path === item.to ? 'primary' : undefined"
        :prepend-icon="item.icon"
        @click="go(item.to)"
      >
        {{ item.title }}
      </v-btn>
    </div>

    <v-spacer />

    <v-text-field
      v-model="filters.q"
      class="global-search"
      density="compact"
      hide-details
      clearable
      prepend-inner-icon="mdi-magnify"
      label="بحث سريع"
      @keyup.enter="runSearch"
    />

    <ThemeToggle />
    <v-btn
      icon="mdi-refresh"
      variant="text"
      title="تحديث"
      @click="emit('refresh')"
    />
    <v-menu>
      <template #activator="{ props }">
        <v-btn v-bind="props" icon="mdi-account-circle-outline" variant="text" />
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
          @click="onLogout"
        />
      </v-list>
    </v-menu>
  </v-app-bar>

  <v-navigation-drawer v-model="mobileMenuOpen" temporary location="right">
    <v-list nav>
      <v-list-item
        v-for="item in navItems"
        :key="item.to"
        :active="$route.path === item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        @click="go(item.to)"
      />
    </v-list>
  </v-navigation-drawer>
</template>
