<script setup lang="ts">
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    clearable?: boolean;
  }>(),
  { clearable: true },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const menu = ref(false);

const displayValue = computed(() => {
  if (!props.modelValue) return "";
  const date = new Date(`${props.modelValue}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? props.modelValue
    : date.toLocaleDateString("ar-IQ", { numberingSystem: "latn" });
});

function dateValue(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
}

function update(value: unknown) {
  emit("update:modelValue", dateValue(value));
  menu.value = false;
}
</script>

<template>
  <v-menu v-model="menu" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props: menuProps }">
      <v-text-field
        v-bind="menuProps"
        :model-value="displayValue"
        :label="props.label"
        prepend-inner-icon="mdi-calendar-outline"
        readonly
        :clearable="props.clearable"
        @click:clear="emit('update:modelValue', '')"
      />
    </template>
    <v-date-picker
      :model-value="props.modelValue || null"
      hide-header
      show-adjacent-months
      @update:model-value="update"
    />
  </v-menu>
</template>
