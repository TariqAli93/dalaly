<script setup lang="ts">
import EmptyState from "./EmptyState.vue";
defineProps<{
  notes: { label: string; text: string | null | undefined }[];
  updatedAt: string;
  canEdit?: boolean;
}>();
defineEmits<{ edit: [] }>();
function when(value: string) {
  return new Date(value).toLocaleString("ar-IQ", { numberingSystem: "latn" });
}
</script>
<template>
  <v-card variant="flat" border>
    <v-card-title class="d-flex flex-wrap align-center ga-2"
      >الملاحظات الحالية<v-spacer /><v-btn
        v-if="canEdit"
        variant="tonal"
        prepend-icon="mdi-pencil-outline"
        @click="$emit('edit')"
        >تعديل الملاحظات</v-btn
      ></v-card-title
    >
    <v-card-text v-if="notes.some((note) => note.text)"
      ><v-timeline side="end" align="start" density="compact"
        ><v-timeline-item
          v-for="note in notes.filter((note) => note.text)"
          :key="note.label"
          dot-color="primary"
          size="x-small"
          ><strong>{{ note.label }}</strong>
          <p class="text-caption text-medium-emphasis mb-2">
            آخر تحديث للسجل: {{ when(updatedAt) }}
          </p>
          <p class="note-text">{{ note.text }}</p></v-timeline-item
        ></v-timeline
      ></v-card-text
    >
    <EmptyState
      v-else
      icon="mdi-note-text-outline"
      title="لا توجد ملاحظات"
      text="يمكن تعديل الملاحظات ضمن بيانات السجل عند توفر صلاحية التعديل."
    />
  </v-card>
</template>
<style scoped>
.note-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.9;
}
</style>
