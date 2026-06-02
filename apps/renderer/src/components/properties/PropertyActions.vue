<script setup lang="ts">
import { usePermissions } from "../../composables/usePermissions";
import FavoriteButton from "./FavoriteButton.vue";
import type { PropertyRecord } from "../../types";

defineProps<{ property: PropertyRecord }>();

const emit = defineEmits<{
  view: [PropertyRecord];
  edit: [PropertyRecord];
  archive: [PropertyRecord];
  restore: [PropertyRecord];
  delete: [PropertyRecord];
}>();

const { can } = usePermissions();
</script>

<template>
  <div class="d-flex ga-1 justify-end">
    <FavoriteButton :property-id="property.id" />
    <v-btn
      icon="mdi-eye"
      size="small"
      variant="text"
      title="عرض"
      @click="emit('view', property)"
    />
    <v-btn
      v-if="can('properties.update')"
      icon="mdi-pencil"
      size="small"
      variant="text"
      title="تعديل"
      @click="emit('edit', property)"
    />
    <v-btn
      v-if="property.status === 'archived' && can('properties.restore')"
      icon="mdi-archive-arrow-up-outline"
      color="success"
      size="small"
      variant="text"
      title="إرجاع من الأرشيف"
      @click="emit('restore', property)"
    />
    <v-btn
      v-else-if="property.status !== 'archived' && can('properties.archive')"
      icon="mdi-archive-arrow-down-outline"
      color="warning"
      size="small"
      variant="text"
      title="أرشفة"
      @click="emit('archive', property)"
    />
    <v-btn
      v-if="can('properties.delete')"
      icon="mdi-delete-outline"
      size="small"
      variant="text"
      color="error"
      title="حذف"
      @click="emit('delete', property)"
    />
  </div>
</template>
