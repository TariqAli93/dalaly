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
const password = ref("");

const config = ref<ScheduledBackupConfig>({
  enabled: false,
  recipient: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  hasPassword: false,
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
  try {
    const loaded = await platform.getScheduledBackup();
    if (loaded) config.value = { ...config.value, ...loaded };
  } catch {
    // تجاهل
  }
}

async function save() {
  if (!platform.supportsScheduledBackup) {
    notifyError("الجدولة متاحة فقط داخل تطبيق سطح المكتب.");
    return;
  }
  saving.value = true;
  try {
    await platform.saveScheduledBackup({
      ...config.value,
      port: Number(config.value.smtpPort),
      password: password.value || undefined,
    });
    password.value = "";
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
