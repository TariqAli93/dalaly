<script setup lang="ts">
import EmptyState from "./EmptyState.vue";
import { formatDateTime } from "../../utils/format";
defineProps<{
  notes: { label: string; text: string | null | undefined }[];
  updatedAt: string;
  canEdit?: boolean;
}>();
defineEmits<{ edit: [] }>();
</script>
<template>
  <!-- قسم داخل لوح السجل، لا بطاقة فوق بطاقة. -->
  <section class="record-notes" aria-labelledby="record-notes-title">
    <div class="record-notes__head">
      <h2 id="record-notes-title" class="record-notes__title">الملاحظات</h2>
      <v-spacer />
      <v-btn
        v-if="canEdit"
        variant="text"
        prepend-icon="mdi-pencil-outline"
        @click="$emit('edit')"
        >تعديل الملاحظات</v-btn
      >
    </div>
    <div v-if="notes.some((note) => note.text)">
      <v-timeline side="end" align="start" density="compact"
        ><v-timeline-item
          v-for="note in notes.filter((note) => note.text)"
          :key="note.label"
          dot-color="primary"
          size="x-small"
          ><strong>{{ note.label }}</strong>
          <p class="text-caption text-medium-emphasis mb-2">
            آخر تحديث للسجل: {{ formatDateTime(updatedAt) }}
          </p>
          <p class="note-text">{{ note.text }}</p></v-timeline-item
        ></v-timeline
      >
    </div>
    <EmptyState
      v-else
      icon="mdi-note-text-outline"
      title="لا توجد ملاحظات"
      text="يمكن تعديل الملاحظات ضمن بيانات السجل عند توفر صلاحية التعديل."
    />
  </section>
</template>
<style scoped>
.record-notes__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.record-notes__title {
  margin: 0;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
}
.note-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.9;
}
</style>
