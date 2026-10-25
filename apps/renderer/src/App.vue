<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import AppSnackbar from "./components/app/AppSnackbar.vue";
import AppConfirmDialog from "./components/app/AppConfirmDialog.vue";
import { useThemeMode } from "./composables/useThemeMode";
import { useAuth } from "./composables/useAuth";
import { useIdleLock } from "./composables/useIdleLock";
import { useSnackbar } from "./composables/useSnackbar";
import { stashOpenDrafts } from "./composables/useDirtyForm";

const router = useRouter();
const { apply } = useThemeMode();
const { isAuthenticated, logout } = useAuth();
const { start, stop } = useIdleLock();
const { notifyInfo } = useSnackbar();

onMounted(() => {
  apply();
  // تسجيل خروج تلقائي عند الخمول (قفل الشاشة).
  start(async () => {
    if (!isAuthenticated.value) return;
    // نموذج مفتوح يُحفظ مسودةً ويعود إليه المستخدم بعد الدخول، بدل أن يضيع.
    const current = router.currentRoute.value.fullPath;
    stashOpenDrafts();
    await logout();
    notifyInfo("تم تسجيل الخروج تلقائياً بسبب الخمول.");
    if (router.currentRoute.value.path !== "/login") {
      void router.push({ path: "/login", query: { redirect: current } });
    }
  });
});

onUnmounted(stop);
</script>

<template>
  <v-app class="app-shell" dir="rtl">
    <router-view />
    <AppSnackbar />
    <AppConfirmDialog />
  </v-app>
</template>
