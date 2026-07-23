<script setup lang="ts">
import { ref } from "vue";
import { getErrorMessage } from "../../services/api.service";
import { commitImport, validateImport } from "../../services/import.service";
import { useSnackbar } from "../../composables/useSnackbar";
import {
  autoMap,
  buildMappedRows,
  IMPORT_FIELDS,
  parseXlsx,
  type ParsedSheet,
} from "../../utils/excel";
import type { ImportValidation } from "../../types";

const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ imported: [] }>();

const { notifySuccess, notifyError } = useSnackbar();

const step = ref(1);
const fileInput = ref<HTMLInputElement | null>(null);
const sheet = ref<ParsedSheet | null>(null);
const mapping = ref<Record<string, string>>({});
const validation = ref<ImportValidation | null>(null);
const committing = ref(false);
const result = ref<{ inserted: number; skipped: number } | null>(null);

function reset() {
  step.value = 1;
  sheet.value = null;
  mapping.value = {};
  validation.value = null;
  result.value = null;
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    sheet.value = await parseXlsx(file);
    mapping.value = autoMap(sheet.value.headers);
    step.value = 2;
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function runValidate() {
  if (!sheet.value) return;
  try {
    const rows = buildMappedRows(sheet.value.rows, mapping.value);
    validation.value = await validateImport(rows);
    step.value = 3;
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function runCommit() {
  if (!sheet.value) return;
  committing.value = true;
  try {
    const rows = buildMappedRows(sheet.value.rows, mapping.value);
    result.value = await commitImport(rows);
    step.value = 4;
    notifySuccess(`تم استيراد ${result.value.inserted} عرض.`);
    emit("imported");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    committing.value = false;
  }
}

function close() {
  open.value = false;
  setTimeout(reset, 300);
}
</script>

<template>
  <v-dialog v-model="open" width="640" scrollable persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <span>استيراد عروض من Excel</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="close" />
      </v-card-title>
      <v-card-text style="max-height: 60vh">
        <!-- 1: اختيار الملف -->
        <div v-if="step === 1" class="text-center pa-4">
          <v-icon icon="mdi-file-excel-outline" size="48" color="success" />
          <div class="text-body-2 my-3">
            اختر ملف Excel (.xlsx) يحتوي على العروض.
          </div>
          <v-btn
            color="primary"
            prepend-icon="mdi-upload"
            @click="fileInput?.click()"
          >
            اختيار ملف
          </v-btn>
          <input
            ref="fileInput"
            type="file"
            accept=".xlsx,.xls"
            hidden
            @change="onFile"
          />
        </div>

        <!-- 2: ربط الأعمدة -->
        <div v-else-if="step === 2 && sheet">
          <v-alert
            variant="tonal"
            class="mb-3"
            :text="`تم العثور على ${sheet.rows.length} صف. اربط الأعمدة بالحقول.`"
          />
          <v-select
            v-for="field in IMPORT_FIELDS"
            :key="field.key"
            v-model="mapping[field.key]"
            :items="sheet.headers"
            :label="
              field.label +
              (field.default ? ` (افتراضي: ${field.default})` : '')
            "
            density="compact"
            clearable
            hide-details
            class="mb-2"
          />
        </div>

        <!-- 3: تقرير التحقق -->
        <div v-else-if="step === 3 && validation">
          <div class="d-flex ga-3 mb-3 flex-wrap">
            <v-chip color="success" variant="tonal"
              >صالح: {{ validation.valid_count }}</v-chip
            >
            <v-chip color="warning" variant="tonal"
              >مكرر: {{ validation.duplicate_count }}</v-chip
            >
            <v-chip color="error" variant="tonal"
              >خطأ: {{ validation.error_count }}</v-chip
            >
          </div>
          <v-alert
            v-if="validation.errors.length"
            type="error"
            variant="tonal"
            class="mb-2"
          >
            <div class="text-subtitle-2 mb-1">أخطاء:</div>
            <div
              v-for="e in validation.errors.slice(0, 10)"
              :key="e.row"
              class="text-caption"
            >
              صف {{ e.row }}: {{ e.message }}
            </div>
          </v-alert>
          <v-alert
            v-if="validation.duplicates.length"
            type="warning"
            variant="tonal"
          >
            <div class="text-subtitle-2 mb-1">مكررات (ستُتجاهل):</div>
            <div
              v-for="d in validation.duplicates.slice(0, 10)"
              :key="d.row"
              class="text-caption"
            >
              صف {{ d.row }}: {{ d.reason }}
            </div>
          </v-alert>
        </div>

        <!-- 4: النتيجة -->
        <div v-else-if="step === 4 && result" class="text-center pa-4">
          <v-icon icon="mdi-check-circle" size="48" color="success" />
          <div class="text-h6 my-2">اكتمل الاستيراد</div>
          <div>
            تم إدراج {{ result.inserted }} عرض، وتم تجاهل {{ result.skipped }}.
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-btn v-if="step > 1 && step < 4" variant="text" @click="step -= 1"
          >السابق</v-btn
        >
        <v-spacer />
        <v-btn v-if="step === 2" color="primary" @click="runValidate"
          >تحقق</v-btn
        >
        <v-btn
          v-else-if="step === 3 && validation && validation.valid_count > 0"
          color="primary"
          :loading="committing"
          @click="runCommit"
        >
          استيراد {{ validation.valid_count }} عرض
        </v-btn>
        <v-btn v-else-if="step === 4" color="primary" @click="close"
          >إغلاق</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
