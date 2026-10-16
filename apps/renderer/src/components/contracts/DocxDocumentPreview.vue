<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { getErrorMessage } from "../../services/api.service";
const props = defineProps<{
  data: string;
  loadPdf?: () => Promise<{ data: string }>;
}>();
const srcdoc = ref(""),
  pdfUrl = ref(""),
  error = ref(""),
  loading = ref(false),
  rendering = ref(false),
  zoom = ref(1);
let revision = 0;
const height = computed(() => `${Math.round(70 / zoom.value)}vh`);
const bytes = (data: string) =>
  Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
watch(
  () => props.data,
  async (data) => {
    const request = ++revision;
    if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
    pdfUrl.value = "";
    error.value = "";
    srcdoc.value = "";
    if (!data) return;
    rendering.value = true;
    try {
      const { renderAsync } = await import("docx-preview");
      const body = document.createElement("div"),
        styles = document.createElement("div");
      await renderAsync(bytes(data).buffer, body, styles, {
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
        useBase64URL: true,
        renderChanges: false,
        renderComments: false,
        renderAltChunks: false,
      });
      if (request !== revision) return;
      // Preview runs inside a script-free frame; no remote resources or navigation.
      body.querySelectorAll("a").forEach((a) => {
        a.removeAttribute("href");
        a.removeAttribute("target");
      });
      srcdoc.value = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'"><style>body{margin:0;background:#e8e8e8}.docx-wrapper{padding:16px!important}section.docx{margin-bottom:16px!important}</style>${styles.innerHTML}</head><body>${body.innerHTML}</body></html>`;
    } catch (cause) {
      if (request === revision) error.value = getErrorMessage(cause);
    } finally {
      if (request === revision) rendering.value = false;
    }
  },
  { immediate: true },
);
async function pdf() {
  if (!props.loadPdf || loading.value) return;
  loading.value = true;
  error.value = "";
  const request = revision;
  try {
    const result = await props.loadPdf();
    if (request !== revision) return;
    if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
    pdfUrl.value = URL.createObjectURL(
      new Blob([bytes(result.data)], { type: "application/pdf" }),
    );
  } catch (cause) {
    if (request === revision) error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
function showDocx() {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
  pdfUrl.value = "";
}
onBeforeUnmount(() => {
  revision++;
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
});
</script>
<template>
  <v-sheet border rounded>
    <v-toolbar density="compact" color="transparent">
      <v-toolbar-title class="text-body-2">{{
        pdfUrl ? "معاينة الطباعة PDF" : "معاينة DOCX"
      }}</v-toolbar-title>
      <v-btn
        v-if="loadPdf && !pdfUrl"
        variant="text"
        :loading="loading"
        @click="pdf"
        >معاينة الطباعة PDF</v-btn
      >
      <v-btn v-if="pdfUrl" variant="text" @click="showDocx">معاينة DOCX</v-btn>
      <v-btn
        v-if="!pdfUrl"
        icon="mdi-magnify-minus-outline"
        aria-label="تصغير"
        :disabled="zoom <= 0.5"
        @click="zoom = Math.max(0.5, zoom - 0.1)"
      />
      <span v-if="!pdfUrl" class="text-caption"
        >{{ Math.round(zoom * 100) }}%</span
      >
      <v-btn
        v-if="!pdfUrl"
        icon="mdi-magnify-plus-outline"
        aria-label="تكبير"
        :disabled="zoom >= 1.5"
        @click="zoom = Math.min(1.5, zoom + 0.1)"
      />
    </v-toolbar>
    <v-progress-linear v-if="rendering || loading" indeterminate />
    <v-alert
      v-if="error"
      type="warning"
      variant="tonal"
      density="compact"
      class="ma-3"
      >{{ error }}</v-alert
    >
    <div class="docx-viewport">
      <iframe
        v-if="pdfUrl"
        :src="pdfUrl"
        title="معاينة PDF للعقد"
        class="pdf-frame"
      />
      <iframe
        v-else-if="srcdoc"
        :srcdoc="srcdoc"
        sandbox=""
        title="معاينة ملف DOCX"
        class="docx-frame"
        :style="{
          width: `${100 / zoom}%`,
          height,
          transform: `scale(${zoom})`,
        }"
      />
    </div>
    <div v-if="!pdfUrl" class="text-caption text-medium-emphasis pa-3">
      قد تختلف الخطوط وتقسيم الصفحات في المعاينة السريعة. معاينة PDF تستخدم محرك
      المستندات المحلي وتطابق ملف الطباعة الناتج.
    </div>
  </v-sheet>
</template>
<style scoped>
.docx-viewport {
  height: 70vh;
  min-height: 420px;
  overflow: auto;
  background: #e8e8e8;
}
.docx-frame {
  border: 0;
  transform-origin: top right;
}
.pdf-frame {
  width: 100%;
  height: 70vh;
  border: 0;
}
</style>
