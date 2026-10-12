<script setup lang="ts">
import { computed, ref } from "vue";
import type { PersonRecord } from "../../types";
import PersonEditor from "../people/PersonEditor.vue";
import { usePermissions } from "../../composables/usePermissions";
const props = defineProps<{
  modelValue: number | null;
  people: PersonRecord[];
  label: string;
  errorMessages?: string[];
}>();
const emit = defineEmits<{
  "update:modelValue": [number | null];
  created: [PersonRecord];
}>();
const { can } = usePermissions();
const editOpen = ref(false),
  editing = ref<PersonRecord | null>(null);
const selected = computed(
  () => props.people.find((p) => p.id === props.modelValue) ?? null,
);
function saved(person: PersonRecord) {
  emit("created", person);
  emit("update:modelValue", person.id);
}
</script>
<template>
  <v-autocomplete
    :model-value="props.modelValue"
    :items="props.people"
    item-title="full_name"
    item-value="id"
    :label="props.label"
    :error-messages="props.errorMessages"
    clearable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #append-inner
      ><v-btn
        v-if="can('people.create')"
        icon="mdi-account-plus-outline"
        size="small"
        variant="text"
        title="إضافة شخص"
        @click.stop="
          editing = null;
          editOpen = true;
        "
    /></template>
  </v-autocomplete>
  <v-sheet v-if="selected" class="mb-3 pa-3" border rounded>
    <div>{{ selected.full_name }}</div>
    <div class="text-body-2">
      {{ selected.phone_primary || "الهاتف غير مسجل" }} ·
      {{ selected.national_id || "الهوية غير مسجلة" }}
    </div>
    <div class="text-body-2">
      {{
        [
          selected.governorate,
          selected.district,
          selected.neighborhood,
          selected.address,
        ]
          .filter(Boolean)
          .join("، ") || "عنوان السكن غير مسجل"
      }}
    </div>
    <v-btn
      v-if="can('people.update')"
      size="small"
      variant="text"
      prepend-icon="mdi-account-edit-outline"
      @click="
        editing = selected;
        editOpen = true;
      "
      >استكمال بيانات الطرف</v-btn
    >
  </v-sheet>
  <PersonEditor v-model="editOpen" :person="editing" inline @saved="saved" />
</template>
