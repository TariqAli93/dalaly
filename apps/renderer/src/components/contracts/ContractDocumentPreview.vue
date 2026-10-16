<script setup lang="ts">
import { ref } from "vue";
import DocxDocumentPreview from "./DocxDocumentPreview.vue";
defineProps<{ html?: string | null; text?: string | null; docxData?: string; loadPdf?: () => Promise<{ data: string }> }>();
const zoom = ref(1);
</script>
<template>
  <DocxDocumentPreview v-if="docxData" :data="docxData" :load-pdf="loadPdf" />
  <v-sheet v-else-if="html" class="document-viewer" border rounded>
    <v-toolbar density="compact" color="transparent" aria-label="حجم المعاينة">
      <v-toolbar-title class="text-body-2">معاينة A4</v-toolbar-title>
      <v-btn
        icon="mdi-magnify-minus-outline"
        aria-label="تصغير المعاينة"
        :disabled="zoom <= 0.5"
        @click="zoom = Math.max(0.5, zoom - 0.1)"
      />
      <v-btn variant="text" aria-label="إعادة حجم المعاينة" @click="zoom = 1"
        >{{ Math.round(zoom * 100) }}%</v-btn
      >
      <v-btn
        icon="mdi-magnify-plus-outline"
        aria-label="تكبير المعاينة"
        :disabled="zoom >= 1.5"
        @click="zoom = Math.min(1.5, zoom + 0.1)"
      />
    </v-toolbar>
    <v-sheet class="document-viewport">
      <iframe
        v-if="html"
        class="document-frame"
        :style="{
          width: `${100 / zoom}%`,
          height: `${70 / zoom}vh`,
          transform: `scale(${zoom})`,
        }"
        :srcdoc="html"
        sandbox=""
        title="معاينة العقد العربي بحجم A4"
      /> </v-sheet
  ></v-sheet>
  <v-sheet v-else class="legacy-preview">{{ text }}</v-sheet>
</template>
<style scoped>
.document-frame {
  width: 100%;
  height: 70vh;
  border: 0;
  transform-origin: top right;
  background: white;
}
.document-viewport {
  overflow: auto;
  height: 70vh;
  min-height: 480px;
  background: #e8e8e8;
}
.legacy-preview {
  white-space: pre-wrap;
  direction: rtl;
  line-height: 2;
}
</style>
