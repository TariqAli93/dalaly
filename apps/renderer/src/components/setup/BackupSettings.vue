<script setup lang="ts">
import { onMounted, ref } from "vue";
import * as backupService from "../../services/backup.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { useConfirm } from "../../composables/useConfirm";
import { useRefresh } from "../../composables/useRefresh";
import type { BackupHistory } from "../../types";

const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();
const { openConfirm } = useConfirm();
const { setRefreshHandler } = useRefresh();

const history = ref<BackupHistory | null>(null);
const creating = ref(false);
const exporting = ref(false);
const canExport = Boolean(window.dalalyConfig?.chooseExportPath);
const restoreOpen = ref(false);
const restoreScope = ref<
  "full" | "properties" | "images" | "users" | "settings"
>("full");
const restoreFilePath = ref("");
const restoreData = ref("");
const restoreFileName = ref("");
const restoring = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

console.log(window.dalalyConfig);

const SCOPES = [
  { title: "استرجاع كامل", value: "full" },
  { title: "العقارات فقط", value: "properties" },
  { title: "الصور فقط", value: "images" },
  { title: "المستخدمون فقط", value: "users" },
  { title: "الإعدادات فقط", value: "settings" },
];

function fmt(value: string | null) {
  return value
    ? new Date(value).toLocaleString("ar-IQ", { numberingSystem: "latn" })
    : "—";
}
function fmtSize(bytes: number | null) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

async function load() {
  try {
    history.value = await backupService.fetchBackupHistory();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

const canPickFolder = Boolean(window.dalalyConfig?.pickFolder);

// تصدير يدوي: يفتح حوار حفظ Electron ثم يكتب ZIP في المسار المختار.
async function exportManualBackup() {
  if (!window.dalalyConfig?.chooseExportPath) {
    notifyError("التصدير اليدوي متاح فقط داخل تطبيق سطح المكتب.");
    return;
  }
  const selected = await window.dalalyConfig.chooseExportPath();
  if (selected?.canceled || !selected?.filePath) return;

  exporting.value = true;
  try {
    const result = await backupService.exportBackup(selected.filePath);
    notifySuccess(`تم تصدير النسخة الاحتياطية بنجاح إلى: ${result.file_path}`);
    await load();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    exporting.value = false;
  }
}

async function changeFolder() {
  if (!window.dalalyConfig?.pickFolder) return;
  try {
    const result = await window.dalalyConfig.pickFolder();
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
  restoreFileName.value = "";
  restoreOpen.value = true;
}

async function pickFile() {
  // في تطبيق Electron نستخدم حوار النظام لاختيار الملف بالمسار.
  if (window.dalalyConfig?.pickBackupFile) {
    const result = await window.dalalyConfig.pickBackupFile();
    if (result?.path) {
      restoreFilePath.value = result.path;
      restoreFileName.value = result.path;
    }
    return;
  }
  fileInput.value?.click();
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  restoreFileName.value = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    restoreData.value = String(reader.result);
  };
  reader.readAsDataURL(file);
}

function confirmRestore() {
  openConfirm({
    title: "تأكيد الاسترجاع",
    body: "سيتم استبدال البيانات الحالية بمحتوى النسخة الاحتياطية. هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟",
    confirmText: "استرجاع",
    color: "error",
    onConfirm: runRestore,
  });
}

async function runRestore() {
  restoring.value = true;
  try {
    await backupService.restoreBackup({
      scope: restoreScope.value,
      file_path: restoreFilePath.value || undefined,
      data: restoreData.value || undefined,
    });
    restoreOpen.value = false;
    notifySuccess("تم الاسترجاع بنجاح. قد تحتاج لإعادة تسجيل الدخول.");
    await load();
  } catch (error) {
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
  <v-card rounded="lg" variant="flat" border>
    <v-card-title class="d-flex align-center">
      <span>النسخ الاحتياطي</span>
      <v-spacer />
      <v-btn
        v-if="can('backups.create')"
        color="primary"
        prepend-icon="mdi-database-export"
        :loading="creating"
        @click="create"
      >
        إنشاء نسخة
      </v-btn>
      <v-btn
        v-if="can('backups.create') && canExport"
        class="ms-2"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-content-save-move-outline"
        :loading="exporting"
        @click="exportManualBackup"
      >
        تصدير نسخة احتياطية
      </v-btn>
      <v-btn
        v-if="can('backups.restore')"
        class="ms-2"
        variant="tonal"
        prepend-icon="mdi-database-import"
        @click="openRestore"
      >
        استرجاع
      </v-btn>
    </v-card-title>
    <v-card-text>
      <div class="d-flex flex-wrap ga-4 mb-3">
        <div>
          <div class="text-body-2 text-medium-emphasis">آخر نسخة احتياطية</div>
          <div class="font-weight-bold">
            {{ fmt(history?.last_backup_at ?? null) }}
          </div>
        </div>
        <div>
          <div class="text-body-2 text-medium-emphasis">مجلد النسخ</div>
          <div class="font-weight-bold" style="word-break: break-all">
            {{ history?.backup_dir || "—" }}
            <v-btn
              v-if="canPickFolder && can('backups.create')"
              size="x-small"
              variant="text"
              prepend-icon="mdi-folder-edit-outline"
              @click="changeFolder"
            >
              تغيير
            </v-btn>
          </div>
        </div>
      </div>

      <div class="text-subtitle-2 mb-1">سجل النسخ</div>
      <v-empty-state
        v-if="!history?.jobs?.length"
        icon="mdi-history"
        title="لا يوجد سجل"
      />
      <v-table v-else density="compact">
        <thead>
          <tr>
            <th>النوع</th>
            <th>الحالة</th>
            <th>الحجم</th>
            <th>التاريخ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in history.jobs" :key="job.id">
            <td>{{ job.type }}</td>
            <td>
              <v-chip
                size="x-small"
                :color="job.status === 'success' ? 'success' : 'error'"
                variant="tonal"
              >
                {{ job.status }}
              </v-chip>
            </td>
            <td>{{ fmtSize(job.file_size) }}</td>
            <td>{{ fmt(job.created_at) }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card-text>

    <v-dialog v-model="restoreOpen" width="520">
      <v-card rounded="lg">
        <v-card-title>استرجاع نسخة احتياطية</v-card-title>
        <v-card-text>
          <v-alert
            type="warning"
            variant="tonal"
            class="mb-3"
            text="الاسترجاع يستبدل البيانات الحالية. تأكد من اختيار النطاق الصحيح."
          />
          <v-select
            v-model="restoreScope"
            :items="SCOPES"
            label="نطاق الاسترجاع"
            class="mb-2"
          />
          <v-btn
            variant="tonal"
            prepend-icon="mdi-file-upload-outline"
            @click="pickFile"
          >
            اختيار ملف النسخة
          </v-btn>
          <span v-if="restoreFileName" class="ms-2 text-caption">{{
            restoreFileName
          }}</span>
          <input
            ref="fileInput"
            type="file"
            accept=".zip"
            hidden
            @change="onFileChange"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="restoreOpen = false">إلغاء</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="restoring"
            :disabled="!restoreFilePath && !restoreData"
            @click="confirmRestore"
          >
            استرجاع
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
