<script setup lang="ts">
import { onMounted, ref } from "vue";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import type { ScheduledBackupConfig } from "../../types";

const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();

const available = ref(Boolean(window.dalalyConfig?.getScheduledBackup));
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
  if (!window.dalalyConfig?.getScheduledBackup) return;
  try {
    const loaded = await window.dalalyConfig.getScheduledBackup();
    if (loaded) config.value = { ...config.value, ...loaded };
  } catch {
    // تجاهل
  }
}

async function save() {
  if (!window.dalalyConfig?.saveScheduledBackup) {
    notifyError("الجدولة متاحة فقط داخل تطبيق سطح المكتب.");
    return;
  }
  saving.value = true;
  try {
    await window.dalalyConfig.saveScheduledBackup({
      ...config.value,
      port: Number(config.value.smtpPort),
      password: password.value || undefined,
    });
    password.value = "";
    notifySuccess("تم حفظ إعدادات النسخ المجدول.");
    await load();
  } catch {
    notifyError("تعذر حفظ الإعدادات.");
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <v-card variant="flat" border>
    <v-card-title>النسخ الاحتياطي المجدول بالبريد</v-card-title>
    <v-card-text>
      <v-alert
        v-if="!available"
        type="info"
        variant="tonal"
        text="جدولة النسخ عبر البريد متاحة فقط داخل تطبيق سطح المكتب (Electron)."
      />
      <template v-else>
        <v-alert
          type="warning"
          variant="tonal"
          class="mb-4"
          text="تنبيه: إرسال النسخة بالبريد يرسل بيانات العقارات خارج هذا الجهاز. لا تُرسل أي بيانات بدون تفعيل صريح."
        />
        <v-switch
          v-model="config.enabled"
          label="تفعيل النسخ المجدول بالبريد"
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
          <v-text-field v-model="config.smtpHost" label="SMTP Host" />
          <v-text-field v-model="config.smtpPort" label="SMTP Port" />
          <v-text-field v-model="config.smtpUser" label="SMTP Username" />
          <v-text-field
            v-model="password"
            class="span-2"
            :label="
              config.hasPassword
                ? 'SMTP Password (محفوظة — اتركها فارغة للإبقاء عليها)'
                : 'SMTP Password'
            "
            type="password"
            hint="تُخزَّن مشفّرة عبر Electron safeStorage ولا تُحفظ كنص صريح."
            persistent-hint
          />
        </div>
        <div class="d-flex align-center mt-3">
          <div class="text-caption text-medium-emphasis">
            آخر تنفيذ: {{ fmt(config.lastRunAt) }}
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
