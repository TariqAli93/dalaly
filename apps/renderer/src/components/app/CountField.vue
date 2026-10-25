<script setup lang="ts">
import { normalizeDigits } from "../../utils/digits";

/**
 * عدد صحيح اختياري (غرف، حمامات، طوابق). الحقل الممسوح null لا "": الخادم
 * يحوّل "" إلى 0 فيُحفظ «0 غرف» لعرض لم يُذكر فيه العدد.
 */
defineOptions({ inheritAttrs: false });
const model = defineModel<number | null>();

function onInput(value: string | null) {
  const digits = normalizeDigits(value ?? "").replace(/\D/g, "");
  model.value = digits === "" ? null : Number(digits);
}
</script>

<template>
  <v-text-field
    v-bind="$attrs"
    :model-value="model ?? ''"
    inputmode="numeric"
    @update:model-value="onInput"
  />
</template>
