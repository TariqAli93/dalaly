<script setup lang="ts">
import { useRouter } from "vue-router";
import { useProperties } from "../../composables/useProperties";
import { useAuth } from "../../composables/useAuth";
import ThemeToggle from "./ThemeToggle.vue";

const emit = defineEmits<{ refresh: []; "toggle-drawer": [] }>();

const router = useRouter();
const { filters, loadProperties } = useProperties();
const { currentUser, logout } = useAuth();

// نفس سلوك البحث السابق تماماً: يذهب لصفحة العروض ثم يعيد التحميل.
function runSearch() {
  void router.push("/properties").then(() => loadProperties());
}

async function onLogout() {
  await logout();
  void router.push("/login");
}
</script>

<template>
  <v-app-bar class="top-navbar" height="56" flat density="comfortable">
    <v-app-bar-nav-icon
      aria-label="طيّ أو فتح قائمة التنقل"
      @click="emit('toggle-drawer')"
    />

    <v-text-field
      v-model="filters.q"
      class="global-search"
      variant="solo-filled"
      flat
      density="compact"
      rounded="lg"
      hide-details
      clearable
      prepend-inner-icon="mdi-magnify"
      placeholder="بحث سريع في العروض…"
      aria-label="بحث سريع"
      @keyup.enter="runSearch"
    />

    <v-spacer />

    <ThemeToggle />
    <v-btn
      icon="mdi-refresh"
      variant="text"
      title="تحديث"
      aria-label="تحديث البيانات"
      @click="emit('refresh')"
    />

    <v-menu location="bottom end">
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          icon
          variant="text"
          aria-label="قائمة المستخدم"
          title="حساب المستخدم"
        >
          <v-icon icon="mdi-account-circle-outline" />
        </v-btn>
      </template>
      <v-list min-width="200" density="compact">
        <v-list-item
          :title="currentUser?.username ?? 'مستخدم'"
          subtitle="جلسة محلية"
          prepend-icon="mdi-account-circle-outline"
        />
        <v-divider />
        <v-list-item
          title="الإعدادات"
          prepend-icon="mdi-cog-outline"
          @click="router.push('/settings')"
        />
        <v-list-item
          title="تسجيل الخروج"
          prepend-icon="mdi-logout"
          base-color="error"
          @click="onLogout"
        />
      </v-list>
    </v-menu>
  </v-app-bar>
</template>
