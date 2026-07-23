<script setup lang="ts">
import { useRouter } from "vue-router";
import { useProperties } from "../../composables/useProperties";
import { useAuth } from "../../composables/useAuth";
import ThemeToggle from "./ThemeToggle.vue";

// title/subtitle للعرض فقط (يمرّرهما AppLayout من عنوان الصفحة الحالي).
defineProps<{ title?: string; subtitle?: string }>();
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
  <!-- شريط أوامر مكتبي منخفض (44px)، بلا ظلّ، حدّ سفلي رفيع فقط. -->
  <v-app-bar class="top-navbar" height="44" flat>
    <v-app-bar-nav-icon
      aria-label="طيّ أو فتح قائمة التنقل"
      @click="emit('toggle-drawer')"
    />

    <!-- عنوان القسم الحالي على الحافة الأمامية (يمين في RTL). -->
    <div class="dal-command-title">
      <span class="dal-command-title__text">{{ title ?? "دلالي" }}</span>
      <span v-if="subtitle" class="dal-command-title__sub">{{ subtitle }}</span>
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
      placeholder="بحث سريع…"
      aria-label="بحث سريع"
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
