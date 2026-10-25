<script setup lang="ts">
import { normalizeDigits } from "../../utils/digits";

/**
 * رقم هاتف: type=tel فيتّجه LTR (قاعدة tel في styles.css) ولا تنقلب مجموعات
 * الأرقام، وتُحوَّل الأرقام العربية الهندية الملصقة أو المكتوبة إلى لاتينية.
 * يمرّر بقية الخصائص (label, rules, ...) إلى v-text-field.
 */
defineOptions({ inheritAttrs: false });
const model = defineModel<string | null>();

function onInput(value: string | null) {
  model.value = value === null ? null : normalizeDigits(value);
}
</script>

<template>
  <v-text-field
    v-bind="$attrs"
    :model-value="model"
    type="tel"
    inputmode="tel"
    autocomplete="off"
    @update:model-value="onInput"
  />
</template>
