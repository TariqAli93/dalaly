<script setup lang="ts">
import { useRouter } from "vue-router";
import { useProperties } from "../../composables/useProperties";
import { useAuth } from "../../composables/useAuth";
import ThemeToggle from "./ThemeToggle.vue";

// title/subtitle للعرض فقط (يمرّرهما AppLayout من عنوان الصفحة الحالي).
const props = defineProps<{ title?: string; subtitle?: string }>();
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
      v-model="filters.q"
      class="global-search"
      variant="solo-filled"
      flat
      density="compact"
      hide-details
      clearable
      prepend-inner-icon="mdi-magnify"
      placeholder="البحث في العروض العقارية…"
      aria-label="البحث في العروض العقارية"
      @keyup.enter="runSearch"
    />

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
