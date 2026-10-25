<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { platform } from "../../platform";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import type { ScheduledBackupConfig } from "../../types";

const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();
const { t } = useI18n();

const available = ref(platform.supportsScheduledBackup);
const saving = ref(false);
// فشل القراءة يترك القيم الافتراضية في النموذج؛ الحفظ عندها يكتبها فوق
// الإعداد الحقيقي، فيُمنع حتى تنجح القراءة.
const loadFailed = ref(false);
const loading = ref(false);
const password = ref("");
// Encrypts the emailed copy; Electron main refuses shorter ones too.
const MIN_BACKUP_PASSWORD_LENGTH = 8;
const backupPassword = ref("");
const backupPasswordConfirm = ref("");

const config = ref<ScheduledBackupConfig>({
  enabled: false,
  recipient: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  hasPassword: false,
  hasBackupPassword: false,
  frequency: "daily",
  time: "02:00",
  lastRunAt: null,
  lastError: null,
});

const FREQ = [
  { title: "يومي", value: "daily" },
  { title: "أسبوعي", value: "weekly" },
];

function fmt(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("ar-IQ", { numberingSystem: "latn" })
    : "—";
}

async function load() {
  if (!platform.supportsScheduledBackup) return;
  loading.value = true;
  try {
    const loaded = await platform.getScheduledBackup();
    if (loaded) config.value = { ...config.value, ...loaded };
    loadFailed.value = false;
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

/** Why the encryption password cannot be saved as typed, if it cannot. */
function backupPasswordProblem() {
  if (!backupPassword.value && !backupPasswordConfirm.value)
    return config.value.enabled && !config.value.hasBackupPassword
      ? t("backup.passwordRequired")
      : null;
  if (backupPassword.value.length < MIN_BACKUP_PASSWORD_LENGTH)
    return t("backup.passwordTooShort");
  if (backupPassword.value !== backupPasswordConfirm.value)
    return t("backup.passwordMismatch");
  return null;
}

async function save() {
  if (!platform.supportsScheduledBackup) {
    notifyError("الجدولة متاحة فقط داخل تطبيق سطح المكتب.");
    return;
  }
  if (loadFailed.value) return;
  const problem = backupPasswordProblem();
  if (problem) {
    notifyError(problem);
    return;
  }
  saving.value = true;
  try {
    const result = await platform.saveScheduledBackup({
      ...config.value,
      port: Number(config.value.smtpPort),
      password: password.value || undefined,
      backupPassword: backupPassword.value || undefined,
    });
    if (!result.ok) {
      notifyError(result.message ?? t("backup.saveFailed"));
      return;
    }
    password.value = "";
    backupPassword.value = "";
    backupPasswordConfirm.value = "";
    notifySuccess(t("backup.saved"));
    await load();
  } catch {
    notifyError(t("backup.saveFailed"));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <v-card variant="flat" border>
    <v-card-title>{{ t("backup.scheduled") }}</v-card-title>
    <v-card-text>
      <v-alert
        v-if="!available"
        type="info"
        variant="tonal"
        :text="t('backup.notAvailable')"
      />
      <template v-else>
        <v-alert
          v-if="loadFailed"
          type="error"
          variant="tonal"
          class="mb-4"
          text="تعذرت قراءة إعدادات النسخ المجدول المحفوظة. الحفظ متوقف كي لا تُستبدل بالقيم الظاهرة هنا."
        >
          <template #append>
            <v-btn variant="text" :loading="loading" @click="load"
              >إعادة المحاولة</v-btn
            >
          </template>
        </v-alert>
        <v-alert
          type="warning"
          variant="tonal"
          class="mb-4"
          :text="t('backup.warning')"
        />
        <v-switch
          v-model="config.enabled"
          :label="t('backup.enableScheduled')"
          color="primary"
          hide-details
          class="mb-3"
        />
        <div class="dialog-grid">
          <v-text-field
            v-model="config.recipient"
            label="البريد المستقبل"
            type="email"
          />
          <v-select v-model="config.frequency" :items="FREQ" label="التكرار" />
          <v-text-field v-model="config.time" label="وقت التنفيذ" type="time" />
          <v-text-field
            v-model="config.smtpHost"
            :label="t('backup.smtpHost')"
          />
          <v-text-field
            v-model="config.smtpPort"
            :label="t('backup.smtpPort')"
          />
          <v-text-field
            v-model="config.smtpUser"
            :label="t('backup.smtpUser')"
          />
          <v-text-field
            v-model="password"
            class="span-2"
            :label="
              config.hasPassword
                ? t('backup.savedPassword')
                : t('backup.smtpPassword')
            "
            type="password"
            :hint="t('backup.secureHint')"
            persistent-hint
          />
          <v-alert
            type="warning"
            variant="tonal"
            class="span-2"
            :text="t('backup.encryptionWarning')"
          />
          <v-text-field
            v-model="backupPassword"
            :label="
              config.hasBackupPassword
                ? t('backup.savedEncryptionPassword')
                : t('backup.encryptionPassword')
            "
            type="password"
            autocomplete="new-password"
            :hint="t('backup.encryptionHint')"
            persistent-hint
          />
          <v-text-field
            v-model="backupPasswordConfirm"
            :label="t('backup.confirmEncryptionPassword')"
            type="password"
            autocomplete="new-password"
          />
        </div>
        <div class="d-flex align-center mt-3">
          <div class="text-caption text-medium-emphasis">
            {{ t("backup.lastRun") }}: {{ fmt(config.lastRunAt) }}
            <span v-if="config.lastError" class="text-error">
              · خطأ: {{ config.lastError }}</span
            >
          </div>
          <v-spacer />
          <v-btn
            v-if="can('backups.schedule')"
            color="primary"
            :loading="saving"
            :disabled="loadFailed || loading"
            prepend-icon="mdi-content-save"
            @click="save"
          >
            حفظ
          </v-btn>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>
