<script setup lang="ts">
defineProps<{ html?: string | null; text?: string | null }>();
</script>
<template>
  <iframe
    v-if="html"
    class="document-frame"
    :srcdoc="html"
    sandbox=""
    title="معاينة العقد العربي بحجم A4"
  />
  <v-sheet v-else class="legacy-preview">{{ text }}</v-sheet>
</template>
<style scoped>
.document-frame {
  width: 100%;
  height: 70vh;
  min-height: 480px;
  border: 1px solid #d5dce0;
  background: white;
}
.legacy-preview {
  white-space: pre-wrap;
  direction: rtl;
  line-height: 2;
}
</style>
