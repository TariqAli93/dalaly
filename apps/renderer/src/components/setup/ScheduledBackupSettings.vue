<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { platform } from "../../platform";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import type { ScheduledBackupConfig } from "../../types";
import SettingsSection from "../settings/SettingsSection.vue";
import FormSection from "../shared/FormSection.vue";
import { formatDateTime } from "../../utils/format";

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
  return value ? formatDateTime(value) : "—";
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
  <SettingsSection
    :title="t('backup.scheduled')"
    description="نسخة مشفّرة من قاعدة البيانات تُرسل بالبريد في الموعد المحدد."
  >
    <v-alert
      v-if="!available"
      type="info"
      variant="tonal"
      density="compact"
      :text="t('backup.notAvailable')"
    />
    <template v-else>
      <v-alert
        v-if="loadFailed"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-3"
        text="تعذرت قراءة إعدادات النسخ المجدول المحفوظة. الحفظ متوقف كي لا تُستبدل بالقيم الظاهرة هنا."
      >
        <template #append>
          <v-btn variant="text" size="small" :loading="loading" @click="load"
            >إعادة المحاولة</v-btn
          >
        </template>
      </v-alert>
      <v-alert
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-3"
        :text="t('backup.warning')"
      />
      <v-switch
        v-model="config.enabled"
        :label="t('backup.enableScheduled')"
        color="primary"
        hide-details
        class="mb-2"
      />
      <v-form @submit.prevent="save">
        <FormSection title="المستلم والموعد">
          <v-text-field
            v-model="config.recipient"
            label="البريد المستقبل"
            type="email"
            hide-details="auto"
          />
          <v-select
            v-model="config.frequency"
            :items="FREQ"
            label="التكرار"
            hide-details="auto"
          />
          <v-text-field
            v-model="config.time"
            label="وقت التنفيذ"
            type="time"
            hide-details="auto"
          />
        </FormSection>
        <FormSection title="خادم البريد">
          <v-text-field
            v-model="config.smtpHost"
            :label="t('backup.smtpHost')"
            hide-details="auto"
          />
          <v-text-field
            v-model="config.smtpPort"
            :label="t('backup.smtpPort')"
            inputmode="numeric"
            hide-details="auto"
          />
          <v-text-field
            v-model="config.smtpUser"
            :label="t('backup.smtpUser')"
            hide-details="auto"
          />
          <v-text-field
            v-model="password"
            class="form-section__wide"
            :label="
              config.hasPassword
                ? t('backup.savedPassword')
                : t('backup.smtpPassword')
            "
            type="password"
            autocomplete="off"
            :hint="t('backup.secureHint')"
            persistent-hint
          />
        </FormSection>
        <FormSection title="تشفير النسخة المرسلة" :columns="2">
          <v-alert
            type="warning"
            variant="tonal"
            density="compact"
            class="form-section__wide"
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
            hide-details="auto"
          />
        </FormSection>
        <div class="scheduled-footer">
          <v-btn
            v-if="can('backups.schedule')"
            color="primary"
            variant="flat"
            type="submit"
            :loading="saving"
            :disabled="loadFailed || loading"
            prepend-icon="mdi-content-save-outline"
            >حفظ الجدولة</v-btn
          >
          <span class="scheduled-footer__status">
            {{ t("backup.lastRun") }}:
            <bdi dir="rtl">{{ fmt(config.lastRunAt) }}</bdi>
            <span v-if="config.lastError" class="text-error">
              · خطأ: {{ config.lastError }}</span
            >
          </span>
        </div>
      </v-form>
    </template>
  </SettingsSection>
</template>

<style scoped>
.scheduled-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding-top: 12px;
}
.scheduled-footer__status {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
</style>
