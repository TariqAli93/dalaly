<script setup lang="ts">
import { computed } from "vue";

/**
 * حقل رقمي يعرض الأرقام بفواصل آلاف لاتينية (112,345,123) أثناء الكتابة،
 * بينما يُخزّن القيمة الخام (بدون فواصل) في الـ v-model.
 * يمرّر بقية الخصائص (label, rules, density, clearable...) إلى v-text-field.
 */
defineOptions({ inheritAttrs: false });

const model = defineModel<string | number | null>();
const props = withDefaults(defineProps<{ decimals?: boolean }>(), {
  decimals: true,
});

function group(raw: string): string {
  if (raw === "") return "";
  const [intPart, decPart] = raw.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
}

const display = computed(() => {
  if (model.value === null || model.value === undefined || model.value === "") {
    return "";
  }
  let raw = String(model.value);
  if (!props.decimals) raw = raw.split(".")[0];
  return group(raw);
});

function onInput(value: string) {
  let cleaned = (value ?? "").replace(/[^\d.]/g, "");
  if (!props.decimals) {
    cleaned = cleaned.replace(/\./g, "");
  } else {
    // فاصلة عشرية واحدة فقط
    const dot = cleaned.indexOf(".");
    if (dot !== -1) {
      cleaned =
        cleaned.slice(0, dot + 1) +
        cleaned.slice(dot + 1).replace(/\./g, "");
    }
  }
  model.value = cleaned;
}
</script>

<template>
  <v-text-field
    v-bind="$attrs"
    :model-value="display"
    inputmode="decimal"
    @update:model-value="onInput"
  />
</template>
