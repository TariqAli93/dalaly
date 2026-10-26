<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import * as backupService from "../../services/backup.service";
import { ApiError, getErrorMessage } from "../../services/api.service";
import { platform } from "../../platform";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { useConfirm } from "../../composables/useConfirm";
import { useRefresh } from "../../composables/useRefresh";
import type { BackupHistory } from "../../types";
import { formatDateTime, formatNumber } from "../../utils/format";
import SettingsSection from "../settings/SettingsSection.vue";

/**
 * النسخ الاحتياطي اليدوي والاسترجاع: آخر نسخة ومجلدها، وسجل النسخ بأسماء
 * عربية، ونتيجة آخر استرجاع ظاهرة في الصفحة (مع مسار نسخة الأمان ونسخه) بدل
 * إشعار يختفي.
 */
const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();
const { openConfirm } = useConfirm();
const { setRefreshHandler } = useRefresh();

const history = ref<BackupHistory | null>(null);
const creating = ref(false);
const exporting = ref(false);
// التصدير إلى مسار على القرص وتغيير مجلد النسخ يحتاجان حوارات نظام،
// فهما متاحان في تطبيق سطح المكتب فقط. إنشاء النسخة والاسترجاع يعملان
// في الحالتين (الاسترجاع في المتصفح يستخدم <input type="file">).
const canExport = platform.isDesktop;
const canPickFolder = platform.isDesktop;
const restoreOpen = ref(false);
const restoreScope = ref<
  "full" | "properties" | "images" | "users" | "settings"
>("full");
const restoreFilePath = ref("");
const restoreData = ref("");
const restoreFileName = ref("");
const restoring = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const restorePassword = ref("");
// The API said the file is encrypted although its name does not end so.
const passwordRequested = ref(false);

const SCOPES = [
  { title: "استرجاع كامل", value: "full" },
  { title: "العقارات فقط", value: "properties" },
  { title: "الصور فقط", value: "images" },
  { title: "المستخدمون فقط", value: "users" },
  { title: "الإعدادات فقط", value: "settings" },
];

// The emailed copy: the database alone, encrypted, so it has no images to
// restore and needs its password.
const encrypted = computed(
  () => passwordRequested.value || /\.dalaly-enc$/i.test(restoreFileName.value),
);
const scopes = computed(() =>
  encrypted.value ? SCOPES.filter((s) => s.value !== "images") : SCOPES,
);
watch(encrypted, (value) => {
  if (value && restoreScope.value === "images") restoreScope.value = "full";
});

function selectFile(name: string) {
  restoreFileName.value = name;
  restorePassword.value = "";
  passwordRequested.value = false;
}

function fmt(value: string | null) {
  return value ? formatDateTime(value) : "—";
}

// أنواع backup_jobs.type وحالاتها كما يكتبها الخادم (backup.service.ts).
const JOB_TYPES: Record<string, string> = {
  manual: "يدوية",
  manual_export: "تصدير يدوي",
  scheduled: "مجدولة",
  email: "بالبريد",
  pre_restore: "قبل الاسترجاع",
  restore: "استرجاع",
};
// "pruned": نسخة مجدولة أو سابقة للاسترجاع حذفها حدّ الاحتفاظ.
const JOB_STATUSES: Record<string, string> = {
  success: "ناجحة",
  failure: "فشلت",
  pruned: "حُذفت (حدّ الاحتفاظ)",
};
const jobType = (type: string) => JOB_TYPES[type] ?? type;
const jobStatus = (status: string) => JOB_STATUSES[status] ?? status;
function statusColor(status: string) {
  if (status === "success") return "success";
  return status === "pruned" ? undefined : "error";
}
function fmtSize(bytes: number | null) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${formatNumber(mb, 2)} ميغابايت`
    : `${formatNumber(bytes / 1024, 0)} كيلوبايت`;
}

// نتيجة آخر استرجاع في هذه الجلسة: تبقى حتى تُغلق، ومعها مسار نسخة الأمان.
const lastRestore = ref<{ message: string; path: string | null } | null>(null);
async function copyPath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
    notifySuccess("نُسخ المسار.");
  } catch {
    notifyError("تعذر النسخ. حدّد المسار وانسخه يدوياً.");
  }
}

async function load() {
  try {
    history.value = await backupService.fetchBackupHistory();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

// تصدير يدوي: يفتح حوار حفظ Electron ثم يكتب ZIP في المسار المختار.
async function exportManualBackup() {
  if (!platform.isDesktop) {
    notifyError(platform.unavailableReason("التصدير اليدوي") ?? "");
    return;
  }
  const selected = await platform.chooseBackupExportPath();
  if (selected?.canceled || !selected?.filePath) return;

  exporting.value = true;
  try {
    const result = await backupService.exportBackup(selected.filePath);
    notifySuccess(`تم تصدير النسخة الاحتياطية إلى: ${result.file_path}`);
    await load();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    exporting.value = false;
  }
}

async function changeFolder() {
  if (!platform.isDesktop) return;
  try {
    const result = await platform.pickFolder();
    if (result?.path) {
      await backupService.setBackupDir(result.path);
      notifySuccess("تم تغيير مجلد النسخ.");
      await load();
    }
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function create() {
  creating.value = true;
  try {
    await backupService.createBackup();
    notifySuccess("تم إنشاء النسخة الاحتياطية.");
    await load();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    creating.value = false;
  }
}

function openRestore() {
  restoreScope.value = "full";
  restoreFilePath.value = "";
  restoreData.value = "";
  selectFile("");
  restoreOpen.value = true;
}

async function pickFile() {
  // في تطبيق Electron نستخدم حوار النظام لاختيار الملف بالمسار.
  if (platform.isDesktop) {
    const result = await platform.pickBackupFile();
    if (result?.path) {
      restoreFilePath.value = result.path;
      selectFile(result.path);
    }
    return;
  }
  // في المتصفح: منتقي ملفات عادي، والمحتوى يُرسل كـ data URL.
  fileInput.value?.click();
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  selectFile(file.name);
  const reader = new FileReader();
  reader.onload = () => {
    restoreData.value = String(reader.result);
  };
  reader.readAsDataURL(file);
}

function confirmRestore() {
  openConfirm({
    title: "تأكيد الاسترجاع",
    body: "سيتم استبدال البيانات الحالية بمحتوى النسخة الاحتياطية. تُحفظ نسخة من البيانات الحالية في مجلد النسخ قبل الاستبدال. هل أنت متأكد؟",
    confirmText: "استرجاع",
    color: "error",
    onConfirm: runRestore,
  });
}

async function runRestore() {
  restoring.value = true;
  try {
    const result = await backupService.restoreBackup({
      scope: restoreScope.value,
      file_path: restoreFilePath.value || undefined,
      data: restoreData.value || undefined,
      password: encrypted.value ? restorePassword.value : undefined,
    });
    restoreOpen.value = false;
    const restored = result.database_only
      ? "تم استرجاع قاعدة البيانات من النسخة المشفّرة، وبقيت الصور والمستندات على هذا الجهاز كما هي."
      : "تم استرجاع النسخة الاحتياطية.";
    lastRestore.value = {
      message: `${restored} قد تحتاج إلى إعادة تسجيل الدخول.`,
      path: result.safety_backup_path ?? null,
    };
    notifySuccess(restored);
    await load();
  } catch (error) {
    if (error instanceof ApiError && error.code === "BACKUP_PASSWORD_REQUIRED")
      passwordRequested.value = true;
    notifyError(getErrorMessage(error));
  } finally {
    restoring.value = false;
  }
}

onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>

<template>
  <SettingsSection
    title="النسخ الاحتياطي"
    description="نسخة كاملة من البيانات والصور والمستندات في مجلد النسخ على هذا الجهاز."
  >
    <template #actions>
      <v-btn
        v-if="can('backups.create')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-database-export"
        :loading="creating"
        @click="create"
        >إنشاء نسخة</v-btn
      >
      <v-btn
        v-if="can('backups.create') && canExport"
        variant="tonal"
        prepend-icon="mdi-content-save-move-outline"
        :loading="exporting"
        @click="exportManualBackup"
        >تصدير نسخة إلى مكان آخر</v-btn
      >
      <v-btn
        v-if="can('backups.restore')"
        variant="tonal"
        prepend-icon="mdi-database-import"
        @click="openRestore"
        >استرجاع</v-btn
      >
    </template>

    <v-alert
      v-if="lastRestore"
      type="success"
      variant="tonal"
      closable
      close-label="إغلاق نتيجة الاسترجاع"
      class="mb-3"
      role="status"
      @click:close="lastRestore = null"
    >
      <div>{{ lastRestore.message }}</div>
      <div v-if="lastRestore.path" class="backup-path">
        <span>حُفظت البيانات السابقة في:</span>
        <bdi class="backup-path__value">{{ lastRestore.path }}</bdi>
        <v-btn
          size="small"
          variant="text"
          prepend-icon="mdi-content-copy"
          @click="copyPath(lastRestore.path)"
          >نسخ المسار</v-btn
        >
      </div>
    </v-alert>

    <dl class="backup-facts">
      <div>
        <dt>آخر نسخة احتياطية</dt>
        <dd>
          <bdi>{{ fmt(history?.last_backup_at ?? null) }}</bdi>
        </dd>
      </div>
      <div>
        <dt>مجلد النسخ</dt>
        <dd class="backup-path">
          <bdi class="backup-path__value">{{ history?.backup_dir || "—" }}</bdi>
          <v-btn
            v-if="canPickFolder && can('backups.create')"
            size="small"
            variant="text"
            prepend-icon="mdi-folder-edit-outline"
            @click="changeFolder"
            >تغيير المجلد</v-btn
          >
        </dd>
      </div>
    </dl>

    <h3 class="backup-subtitle">سجل النسخ</h3>
    <p v-if="!history?.jobs?.length" class="backup-empty">
      لا توجد نسخ مسجّلة بعد.
    </p>
    <div v-else class="backup-history">
      <v-table density="compact">
        <caption class="d-sr-only">
          سجل النسخ الاحتياطية والاسترجاع
        </caption>
        <thead>
          <tr>
            <th scope="col">النوع</th>
            <th scope="col">الحالة</th>
            <th scope="col" class="text-end">الحجم</th>
            <th scope="col">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="job in history.jobs"
            :key="job.id"
            :title="job.error || job.file_path || undefined"
          >
            <td>{{ jobType(job.type) }}</td>
            <td>
              <v-chip
                size="small"
                label
                :color="statusColor(job.status)"
                variant="tonal"
                >{{ jobStatus(job.status) }}</v-chip
              >
            </td>
            <td class="text-end">{{ fmtSize(job.file_size) }}</td>
            <td>
              <bdi>{{ fmt(job.created_at) }}</bdi>
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <v-dialog
      v-model="restoreOpen"
      width="520"
      :persistent="restoring"
      aria-labelledby="restore-title"
    >
      <v-card>
        <v-card-title id="restore-title">استرجاع نسخة احتياطية</v-card-title>
        <v-divider />
        <v-card-text>
          <v-alert
            type="warning"
            variant="tonal"
            class="mb-3"
            text="الاسترجاع يستبدل البيانات الحالية. تُحفظ نسخة منها في مجلد النسخ قبل الاستبدال."
          />
          <v-select
            v-model="restoreScope"
            :items="scopes"
            label="نطاق الاسترجاع"
            hide-details
            class="mb-3"
          />
          <div class="backup-file">
            <v-btn
              variant="tonal"
              prepend-icon="mdi-file-upload-outline"
              @click="pickFile"
              >اختيار ملف النسخة</v-btn
            >
            <bdi v-if="restoreFileName" class="backup-path__value">{{
              restoreFileName
            }}</bdi>
            <span v-else class="backup-empty">لم يُختر ملف بعد.</span>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept=".zip,.dalaly-enc"
            hidden
            @change="onFileChange"
          />
          <template v-if="encrypted">
            <v-alert
              type="info"
              variant="tonal"
              class="mt-3"
              text="نسخة مشفّرة من قاعدة البيانات فقط، كالتي تُرسل بالبريد: تُسترجع البيانات، وتبقى الصور والمستندات الموجودة على هذا الجهاز كما هي."
            />
            <v-text-field
              v-model="restorePassword"
              class="mt-3"
              label="كلمة مرور تشفير النسخة"
              type="password"
              autocomplete="off"
            />
          </template>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn
            color="error"
            variant="flat"
            :loading="restoring"
            :disabled="
              (!restoreFilePath && !restoreData) ||
              (encrypted && !restorePassword)
            "
            @click="confirmRestore"
            >استرجاع</v-btn
          >
          <v-btn
            variant="text"
            :disabled="restoring"
            @click="restoreOpen = false"
            >إلغاء</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </SettingsSection>
</template>

<style scoped>
.backup-facts {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 0 24px;
  margin: 0 0 12px;
}
.backup-facts > div {
  min-width: 0;
  padding: 6px 0;
  border-bottom: 1px solid var(--dal-stroke);
}
.backup-facts dt {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.backup-facts dd {
  margin: 0;
  font-weight: 600;
}
.backup-path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}
.backup-path__value {
  overflow-wrap: anywhere;
  font-weight: 600;
}
.backup-subtitle {
  margin: 8px 0 6px;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 700;
}
.backup-empty {
  margin: 0;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
.backup-history {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
}
.backup-file {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
@media (max-width: 760px) {
  .backup-facts {
    grid-template-columns: 1fr;
  }
}
</style>
