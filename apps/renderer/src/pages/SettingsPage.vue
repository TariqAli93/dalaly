<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import { getErrorMessage } from "../services/api.service";
import * as remoteService from "../services/remote.service";
import type { RemoteStatus } from "../services/remote.service";
import { useThemeMode } from "../composables/useThemeMode";
import { useAuth } from "../composables/useAuth";
import { usePermissions } from "../composables/usePermissions";
import { useSetup } from "../composables/useSetup";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useIdleLock } from "../composables/useIdleLock";
import ChangePinDialog from "../components/auth/ChangePinDialog.vue";
import BackupSettings from "../components/setup/BackupSettings.vue";
import ScheduledBackupSettings from "../components/setup/ScheduledBackupSettings.vue";

const router = useRouter();
const { isDark, toggle } = useThemeMode();
const { currentUser, logout } = useAuth();
const { can } = usePermissions();
const { status } = useSetup();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { idleMinutes, setIdleMinutes } = useIdleLock();

const changePinOpen = ref(false);
const idleOptions = [
  { title: "بدون قفل", value: 0 },
  { title: "5 دقائق", value: 5 },
  { title: "15 دقيقة", value: 15 },
  { title: "30 دقيقة", value: 30 },
  { title: "60 دقيقة", value: 60 },
];

async function lockNow() {
  await logout();
  await router.push("/login");
}

const remoteStatus = ref<RemoteStatus>({
  enabled: false,
  running: false,
  url: null,
  message: null,
});

async function loadRemote() {
  try {
    remoteStatus.value = await remoteService.fetchRemoteStatus();
  } catch (error) {
    remoteStatus.value.message = getErrorMessage(error);
  }
}

async function enableRemote() {
  try {
    remoteStatus.value = await remoteService.enableRemote();
    notifySuccess(
      remoteStatus.value.message ?? "تم طلب تشغيل الاتصال الخارجي.",
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function disableRemote() {
  try {
    remoteStatus.value = await remoteService.disableRemote();
    notifySuccess("تم إيقاف الاتصال الخارجي.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

onMounted(() => {
  setRefreshHandler(loadRemote);
  if (can("settings.read")) void loadRemote();
});
</script>

<template>
  <AppLayout title="الإعدادات">
    <div class="settings-grid">
      <v-card rounded="lg" variant="flat" border>
        <v-card-title>المظهر</v-card-title>
        <v-card-text>
          <div class="d-flex align-center justify-space-between ga-4">
            <div>
              <div class="font-weight-bold">Light / Dark Mode</div>
              <div class="text-body-2 text-medium-emphasis">
                يتم حفظ اختيار الثيم محلياً على هذا الجهاز.
              </div>
            </div>
            <v-switch
              :model-value="isDark"
              color="primary"
              hide-details
              inset
              @update:model-value="toggle"
            />
          </div>
        </v-card-text>
      </v-card>

      <v-card rounded="lg" variant="flat" border>
        <v-card-title>الاتصال الخارجي</v-card-title>
        <v-card-text>
          <v-chip
            class="mb-4"
            :color="remoteStatus.running ? 'primary' : undefined"
            variant="tonal"
          >
            {{ remoteStatus.running ? "يعمل" : "متوقف" }}
          </v-chip>
          <div v-if="remoteStatus.url" class="mb-3">
            <div class="text-body-2 text-medium-emphasis">
              رابط الاتصال الخارجي
            </div>
            <a :href="remoteStatus.url" target="_blank" rel="noreferrer">
              {{ remoteStatus.url }}
            </a>
          </div>
          <v-alert v-if="remoteStatus.message" variant="tonal">
            {{ remoteStatus.message }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            v-if="can('settings.update')"
            color="primary"
            prepend-icon="mdi-cloud-upload-outline"
            @click="enableRemote"
          >
            تشغيل
          </v-btn>
          <v-btn
            v-if="can('settings.update')"
            variant="text"
            prepend-icon="mdi-cloud-off-outline"
            @click="disableRemote"
          >
            إيقاف
          </v-btn>
        </v-card-actions>
      </v-card>

      <v-card rounded="lg" variant="flat" border>
        <v-card-title>الأمان</v-card-title>
        <v-card-text>
          <div class="d-flex align-center justify-space-between ga-4 mb-4">
            <div>
              <div class="font-weight-bold">رمز الدخول PIN</div>
              <div class="text-body-2 text-medium-emphasis">
                غيّر رمز الدخول الخاص بك.
              </div>
            </div>
            <v-btn
              v-if="can('security.change_pin')"
              variant="tonal"
              prepend-icon="mdi-form-textbox-password"
              @click="changePinOpen = true"
            >
              تغيير رمز PIN
            </v-btn>
          </div>
          <v-select
            :model-value="idleMinutes"
            :items="idleOptions"
            label="تسجيل خروج تلقائي بعد خمول"
            density="comfortable"
            hide-details
            class="mb-4"
            @update:model-value="setIdleMinutes"
          />
          <v-btn
            block
            variant="tonal"
            color="warning"
            prepend-icon="mdi-lock-outline"
            @click="lockNow"
          >
            قفل الشاشة الآن
          </v-btn>
        </v-card-text>
      </v-card>

      <v-card rounded="lg" variant="flat" border>
        <v-card-title>النظام</v-card-title>
        <v-list lines="two">
          <v-list-item
            title="الإصدار"
            :subtitle="status?.app_version ?? '0.1.0'"
            prepend-icon="mdi-information-outline"
          />
          <v-list-item
            title="قاعدة البيانات"
            subtitle="PostgreSQL محلي"
            prepend-icon="mdi-database-outline"
          />
          <v-list-item
            title="المستخدم"
            :subtitle="currentUser?.username"
            prepend-icon="mdi-account-outline"
          />
        </v-list>
      </v-card>

      <BackupSettings />
      <!-- <ScheduledBackupSettings /> -->
    </div>

    <ChangePinDialog v-model="changePinOpen" />
  </AppLayout>
</template>
