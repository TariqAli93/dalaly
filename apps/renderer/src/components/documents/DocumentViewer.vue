<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { platform } from "../../platform";
import { getErrorMessage } from "../../services/api.service";
import * as documentsService from "../../services/documents.service";
import type { DocumentRecord } from "../../types";

/**
 * يعرض ملف المستمسك داخل البرنامج: يُجلب بترويسة المصادقة فلا يُفتح رابط
 * يحمل رمز الجلسة في متصفح النظام. الصور وملفات PDF تُعرض، وغيرها يُحفظ.
 */
const props = defineProps<{ document: DocumentRecord | null }>();
const emit = defineEmits<{ close: [] }>();

const loading = ref(false);
const error = ref("");
const objectUrl = ref("");
let blob: Blob | null = null;

const open = computed({
  get: () => Boolean(props.document),
  set: (value) => {
    if (!value) emit("close");
  },
});
const kind = computed(() => {
  const type = props.document?.file_type ?? "";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  return "other";
});

function release() {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
  objectUrl.value = "";
  blob = null;
}

watch(
  () => props.document?.id,
  async (id) => {
    release();
    error.value = "";
    if (!id) return;
    loading.value = true;
    try {
      const file = await documentsService.fetchFile(id);
      if (props.document?.id !== id) return;
      blob = file;
      objectUrl.value = URL.createObjectURL(file);
    } catch (cause) {
      error.value = getErrorMessage(cause);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
onBeforeUnmount(release);

function fileName(document: DocumentRecord) {
  const extension = document.file_path.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? "";
  const base = document.document_name.replace(/[\\/:*?"<>|]+/g, " ").trim();
  return `${base || document.code}${extension}`;
}

async function save() {
  if (!props.document || !blob) return;
  const name = fileName(props.document);
  const extension = name.split(".").pop() ?? "";
  const result = await platform.saveFile({
    data: new Uint8Array(await blob.arrayBuffer()),
    suggestedName: name,
    title: "حفظ المستمسك",
    filters: extension ? [{ name: "الملف", extensions: [extension] }] : [],
  });
  if (!result.ok && !result.canceled)
    error.value = result.message ?? "تعذر حفظ الملف.";
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="960"
    aria-labelledby="document-viewer-title"
  >
    <v-card class="document-viewer">
      <v-card-title id="document-viewer-title" class="document-viewer__title">
        <span>{{ document?.document_name }}</span>
        <span v-if="document?.person_name" class="document-viewer__person">
          {{ document.person_name }}
        </span>
      </v-card-title>
      <v-divider />
      <v-card-text class="document-viewer__body">
        <v-progress-linear v-if="loading" indeterminate />
        <v-alert v-else-if="error" type="error" variant="tonal">
          {{ error }}
        </v-alert>
        <template v-else-if="objectUrl">
          <img
            v-if="kind === 'image'"
            :src="objectUrl"
            :alt="document?.document_name"
            class="document-viewer__image"
          />
          <iframe
            v-else-if="kind === 'pdf'"
            :src="objectUrl"
            :title="document?.document_name"
            class="document-viewer__frame"
          />
          <p v-else class="document-viewer__note">
            لا يمكن عرض هذا النوع من الملفات هنا. احفظه لفتحه بالبرنامج المناسب.
          </p>
        </template>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="tonal"
          prepend-icon="mdi-content-save-outline"
          :disabled="!objectUrl"
          @click="save"
          >حفظ نسخة</v-btn
        >
        <v-btn variant="text" @click="emit('close')">إغلاق</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.document-viewer__title {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.document-viewer__person {
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface-variant));
}
.document-viewer__body {
  display: flex;
  justify-content: center;
  min-height: 240px;
}
.document-viewer__image {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}
.document-viewer__frame {
  width: 100%;
  height: 70vh;
  border: 0;
}
.document-viewer__note {
  align-self: center;
}
</style>
