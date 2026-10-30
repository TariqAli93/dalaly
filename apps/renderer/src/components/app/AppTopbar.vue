<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../../composables/useAuth";
import { usePageTitle } from "../../composables/usePageTitle";
import { formatNumber } from "../../utils/format";
import ThemeToggle from "./ThemeToggle.vue";
import GlobalSearch from "./GlobalSearch.vue";
import QuickAdd from "./QuickAdd.vue";
import NotificationBell from "./NotificationBell.vue";

// شريط الأوامر: عنوان الصفحة (h1) وسياقها وأوامرها على الحافة الأمامية، ثم
// الأدوات العامة. الصفحة تكتب العنوان والسياق عبر AppPage، وترسل أوامرها
// وحالتها إلى #dal-page-actions و#dal-page-status.
defineProps<{ canRefresh?: boolean }>();
const emit = defineEmits<{ refresh: []; "toggle-drawer": [] }>();

const router = useRouter();
const { currentUser, logout } = useAuth();
const { pageTitle, pageParent, pageCount } = usePageTitle();

const userName = computed(() => currentUser.value?.username ?? "مستخدم");
const displayName = computed(
  () => currentUser.value?.display_name || userName.value,
);

async function onLogout() {
  await logout();
  void router.push("/login");
}
</script>

<template>
  <v-app-bar
    color="background"
    class="dal-commandbar"
    height="48"
    flat
    role="banner"
  >
    <v-app-bar-nav-icon
      aria-label="طيّ أو فتح قائمة التنقل"
      @click="emit('toggle-drawer')"
    />

    <div class="dal-commandbar__title">
      <template v-if="pageParent">
        <router-link :to="pageParent.to" class="dal-commandbar__parent">{{
          pageParent.label
        }}</router-link>
        <v-icon
          icon="mdi-chevron-left"
          size="16"
          class="text-medium-emphasis"
          aria-hidden="true"
        />
      </template>
      <h1 id="dal-page-title" tabindex="-1">{{ pageTitle ?? "دلالي" }}</h1>
      <span
        v-if="pageCount !== null"
        class="dal-count"
        :aria-label="`عدد النتائج: ${pageCount}`"
        >{{ formatNumber(pageCount, 0) }}</span
      >
      <div id="dal-page-status" class="dal-commandbar__status" />
    </div>

    <div id="dal-page-actions" class="dal-commandbar__actions" />

    <v-spacer />

    <QuickAdd />
    <GlobalSearch />
    <NotificationBell />
    <ThemeToggle />
    <v-btn
      icon="mdi-refresh"
      variant="text"
      aria-label="تحديث البيانات"
      title="تحديث البيانات"
      :disabled="!canRefresh"
      @click="emit('refresh')"
    />

    <v-menu location="bottom end">
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          class="dal-profile-button"
          variant="text"
          :aria-label="`حساب المستخدم: ${displayName}`"
        >
          <v-avatar color="primary" variant="tonal" size="26">
            <span>{{ userName.slice(0, 1) }}</span>
          </v-avatar>
          <span class="dal-profile-name">{{ userName }}</span>
        </v-btn>
      </template>
      <v-list min-width="220" density="compact">
        <v-list-item
          :title="displayName"
          :subtitle="userName"
          prepend-icon="mdi-account-circle-outline"
        />
        <v-divider />
        <v-list-item
          title="الإعدادات"
          prepend-icon="mdi-cog-outline"
          @click="router.push('/settings')"
        />
        <v-list-item
          title="المساعدة واختصارات لوحة المفاتيح"
          prepend-icon="mdi-help-circle-outline"
          @click="router.push('/help')"
        />
        <v-divider />
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
  padding-inline: 6px;
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
@media (max-width: 1100px) {
  .dal-profile-name {
    display: none;
  }
}
</style>
