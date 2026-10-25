<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useProperties } from "../../composables/useProperties";
import { useAuth } from "../../composables/useAuth";
import ThemeToggle from "./ThemeToggle.vue";

// title للعرض فقط (يمرّره AppLayout من عنوان الصفحة الحالية)، وcanRefresh:
// هل سجّلت الصفحة الحالية ما يعيد تحميلها.
defineProps<{ title?: string; canRefresh?: boolean }>();
const emit = defineEmits<{ refresh: []; "toggle-drawer": [] }>();

const router = useRouter();
const { filters, loadProperties, startFromFirstPage } = useProperties();
const { currentUser, logout } = useAuth();

// على صفحة العروض يحمّل الآن؛ من صفحة أخرى يفتحها على أول صفحة وتحمّلها هي.
function runSearch() {
  if (router.currentRoute.value.name === "properties") {
    void loadProperties();
    return;
  }
  startFromFirstPage();
  void router.push("/properties");
}

async function onLogout() {
  await logout();
  void router.push("/login");
}

// Ctrl+K يضع المؤشر في البحث من أي مكان. KeyK رمز المفتاح لا الحرف، فيعمل
// مع لوحة المفاتيح العربية أيضاً؛ ولا يُعترض داخل حوار مفتوح.
const search = ref<{ focus: () => void } | null>(null);
function onShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyK") return;
  if (event.altKey || event.shiftKey) return;
  if (
    document.querySelector(
      ".v-overlay--active .v-dialog, .v-overlay--active.v-dialog",
    )
  )
    return;
  event.preventDefault();
  search.value?.focus();
}
onMounted(() => window.addEventListener("keydown", onShortcut));
onBeforeUnmount(() => window.removeEventListener("keydown", onShortcut));
</script>

<template>
  <!-- Compact command bar with one aligned row of controls. -->
  <v-app-bar color="background" class="top-navbar" height="60" flat>
    <v-app-bar-nav-icon
      aria-label="طيّ أو فتح قائمة التنقل"
      @click="emit('toggle-drawer')"
    />

    <!-- عنوان القسم الحالي على الحافة الأمامية (يمين في RTL). -->
    <div class="dal-command-title">
      <v-icon icon="mdi-home-outline" size="16" class="text-medium-emphasis" />
      <v-icon icon="mdi-chevron-left" size="14" class="text-medium-emphasis" />
      <span class="dal-command-title__text">{{ title ?? "دلالي" }}</span>
    </div>

    <v-spacer />

    <!-- إجراءات الصفحة الأساسية (تُمرَّر من الصفحة عبر AppLayout). -->
    <div class="dal-command-actions">
      <slot name="actions" />
    </div>

    <v-text-field
      ref="search"
      v-model="filters.q"
      class="global-search"
      variant="solo-filled"
      flat
      density="compact"
      hide-details
      clearable
      prepend-inner-icon="mdi-magnify"
      placeholder="بحث في عروض البيع… (Ctrl+K)"
      aria-label="بحث في عروض البيع"
      aria-keyshortcuts="Control+K"
      @keyup.enter="runSearch"
    />

    <ThemeToggle />
    <v-btn
      icon="mdi-refresh"
      variant="text"
      title="تحديث"
      aria-label="تحديث البيانات"
      :disabled="!canRefresh"
      @click="emit('refresh')"
    />

    <v-menu location="bottom end">
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          class="dal-profile-button"
          variant="text"
          aria-label="قائمة المستخدم"
          title="حساب المستخدم"
        >
          <v-avatar color="primary" variant="tonal" size="30">
            <span>{{ (currentUser?.username ?? "م").slice(0, 1) }}</span>
          </v-avatar>
          <span class="dal-profile-name">{{
            currentUser?.username ?? "مستخدم"
          }}</span>
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

<style scoped>
.dal-profile-button {
  padding-inline: 8px;
}
.dal-profile-button :deep(.v-btn__content) {
  gap: 8px;
}
.dal-profile-name {
  font-size: calc(12px * var(--dal-font-scale));
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.global-search :deep(.v-field) {
  background: var(--dal-canvas);
}
@media (max-width: 760px) {
  .dal-command-title,
  .dal-profile-name {
    display: none;
  }
}
</style>
