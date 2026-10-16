<script setup lang="ts">
import { onMounted, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import DocxDocumentPreview from "../components/contracts/DocxDocumentPreview.vue";
import * as service from "../services/contracts.service";
import { fileData } from "../services/formulations.service";
import type { ContractTemplateRecord } from "../types";
import { getErrorMessage } from "../services/api.service";
import { useSnackbar } from "../composables/useSnackbar";
import { platform } from "../platform";
const { notifyError, notifySuccess } = useSnackbar();
const items = ref<ContractTemplateRecord[]>([]),
  selected = ref<ContractTemplateRecord | null>(null);
const busy = ref(false),
  previewLoading = ref(false),
  previewData = ref(""),
  filename = ref("");
const input = ref<HTMLInputElement | null>(null),
  pending = ref(false),
  restoreOpen = ref(false);
let previewVersion = 0;
async function select(item: ContractTemplateRecord) {
  if (
    busy.value ||
    (pending.value && !window.confirm("تجاهل القالب المستورد غير المحفوظ؟"))
  )
    return;
  const version = ++previewVersion;
  selected.value = item;
  pending.value = false;
  previewData.value = "";
  previewLoading.value = true;
  try {
    const file = await service.templateFile(item.id);
    if (version === previewVersion) {
      previewData.value = file.data;
      filename.value = file.filename;
    }
  } catch (error) {
    if (version === previewVersion) notifyError(getErrorMessage(error));
  } finally {
    if (version === previewVersion) previewLoading.value = false;
  }
}
async function load() {
  try {
    items.value = (await service.listTemplates()).filter(
      (item) => item.is_active && item.docx_file_path,
    );
    if (items.value[0]) await select(items.value[0]);
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
async function imported(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  if (!file || !selected.value || busy.value) return;
  if (file.size > 12 * 1024 * 1024) {
    notifyError("الملف يتجاوز ١٢ ميغابايت.");
    return;
  }
  busy.value = true;
  try {
    const data = await fileData(file);
    await service.inspectTemplate(file.name, data);
    previewData.value = data;
    filename.value = file.name;
    pending.value = true;
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    busy.value = false;
  }
}
async function save(restore = false) {
  if (!selected.value || busy.value) return;
  busy.value = true;
  try {
    const row = restore
      ? await service.restoreTemplate(selected.value.id)
      : await service.importTemplate(
          selected.value.id,
          filename.value,
          previewData.value,
          selected.value.version,
        );
    items.value = items.value.map((item) => (item.id === row.id ? row : item));
    pending.value = false;
    restoreOpen.value = false;
    busy.value = false;
    await select(row);
    notifySuccess(
      restore
        ? "تم استعادة القالب الأصلي."
        : "تم حفظ القالب واستخدامه للعقود الجديدة.",
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    busy.value = false;
  }
}
async function download() {
  if (!selected.value || !previewData.value) return;
  try {
    const result = await platform.saveFile({
      data: Uint8Array.from(atob(previewData.value), (char) =>
        char.charCodeAt(0),
      ),
      suggestedName: filename.value,
      title: "تحميل قالب DOCX",
      filters: [{ name: "مستند Word", extensions: ["docx"] }],
    });
    if (!result.ok && !result.canceled) throw new Error(result.message);
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
onMounted(load);
onBeforeRouteLeave(() => !pending.value || window.confirm("تجاهل قالب DOCX المستورد غير المحفوظ؟"));
</script>
<template>
  <AppLayout
    title="قوالب العقود"
    subtitle="قالب DOCX للبيع وآخر للإيجار. يُستخدم القالب المناسب تلقائياً عند إنشاء العقد."
  >
    <v-row class="mb-3"
      ><v-col v-for="item in items" :key="item.id" cols="12" md="6">
        <v-card
          border
          flat
          :color="selected?.id === item.id ? 'surface-variant' : 'surface'"
          :title="
            item.contract_type === 'sale'
              ? 'قالب عقد البيع'
              : 'قالب عقد الإيجار'
          "
          :subtitle="`${item.docx_file_name} · إصدار ${item.version}`"
          @click="select(item)"
        >
          <v-card-text
            ><v-chip size="small" color="primary" variant="tonal"
              >يُستخدم تلقائياً</v-chip
            ></v-card-text
          >
        </v-card>
      </v-col></v-row
    >
    <v-alert v-if="!items.length" type="info" variant="tonal"
      >تُضاف القوالب الأصلية عند تهيئة قاعدة البيانات. أعد تشغيل التطبيق إذا لم
      تظهر بعد التحديث.</v-alert
    >
    <v-sheet v-if="selected" border rounded class="pa-4">
      <div class="d-flex align-center flex-wrap ga-2 mb-3">
        <h2 class="text-subtitle-1">{{ selected.name }}</h2>
        <v-spacer />
        <v-btn
          prepend-icon="mdi-import"
          variant="outlined"
          :disabled="busy || previewLoading"
          @click="input?.click()"
          >استيراد قالب</v-btn
        >
        <v-btn v-if="pending" color="primary" :loading="busy" @click="save()"
          >حفظ واستخدام</v-btn
        >
        <v-btn
          variant="text"
          prepend-icon="mdi-download-outline"
          :disabled="!previewData"
          @click="download"
          >تحميل DOCX</v-btn
        >
        <v-btn variant="text" :disabled="busy" @click="restoreOpen = true"
          >استعادة الأصلي</v-btn
        >
      </div>
      <input ref="input" type="file" accept=".docx" hidden @change="imported" />
      <v-alert
        v-if="pending"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-3"
        >{{ filename }} — عاين القالب ثم اضغط «حفظ واستخدام».</v-alert
      >
      <p class="text-body-2 mb-3">
        ضع المتغير <code dir="ltr" v-text="'{{legal_formulation}}'" /> في مكان
        البنود. يمكن استخدام
        <code dir="ltr" v-text="'{{seller_name}}'" /> و<code
          dir="ltr"
          v-text="'{{tenant_name}}'"
        />
        و<code dir="ltr" v-text="'{{contract_amount}}'" /> وغيرها من متغيرات
        الصيغ القانونية.
      </p>
      <v-progress-linear v-if="previewLoading" indeterminate />
      <DocxDocumentPreview
        v-if="previewData"
        :data="previewData"
        :load-pdf="() => service.templatePdf(filename, previewData)"
      />
    </v-sheet>
    <v-dialog v-model="restoreOpen" max-width="420"
      ><v-card title="استعادة القالب الأصلي؟"
        ><v-card-text
          >سيُستخدم القالب الأصلي للعقود الجديدة. تبقى نسخ العقود السابقة
          محفوظة.</v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn :disabled="busy" @click="restoreOpen = false"
            >إلغاء</v-btn
          ><v-btn color="primary" :loading="busy" @click="save(true)"
            >استعادة</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
  </AppLayout>
</template>
