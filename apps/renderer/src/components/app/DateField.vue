<script setup lang="ts">
import { computed, ref, useAttrs, watch } from "vue";
import {
  formatDateInput,
  parseDateInput,
  withinBounds,
  type DateInputKind,
} from "../../utils/dateInput";

/**
 * حقل تاريخ أو وقت أو شهر بأرقام لاتينية، بدل <input type="date|time|month">:
 * Chromium يرسم الحقل الأصلي بلغة التطبيق (ar) فتظهر أرقامه هندية وعناوينه
 * الفارغة مقلوبة («قنس/رهش/موي»)، ولا يغيّر ذلك lang الحقل ولا CSS. القيمة
 * كما كانت ("YYYY-MM-DD"، "HH:MM"، "YYYY-MM"، أو "")، فيحلّ محلّه دون تغيير
 * في البيانات. يُكتب بأي أرقام وفواصل، أو يُختار من تقويم النظام بزرّه أو
 * Alt+↓ (حقل أصلي مخفي، بحدود min وmax). نص لا يكوّن قيمة صحيحة يُرسل ""
 * ويُظهر رسالة، فلا تبقى قيمة قديمة دون أن يُعرف. بقية الخصائص (label،
 * clearable، density، rules…) لـ v-text-field، وما في append-inner قبل زر
 * التقويم.
 */
defineOptions({ inheritAttrs: false });

const model = defineModel<string | null | undefined>();
const props = withDefaults(
  defineProps<{ kind?: DateInputKind; min?: string; max?: string }>(),
  { kind: "date", min: undefined, max: undefined },
);
const attrs = useAttrs();

// علامة LRM حول الفاصل: كل كلمة في موضع أرقامها من الحقل (يسار إلى يمين).
const PLACEHOLDER: Record<DateInputKind, string> = {
  date: "يوم\u200E/\u200Eشهر\u200E/\u200Eسنة",
  time: "ساعة\u200E:\u200Eدقيقة",
  month: "شهر\u200E/\u200Eسنة",
};
const INVALID: Record<DateInputKind, string> = {
  date: "اكتب التاريخ يوماً/شهراً/سنة، مثل 2/11/2026",
  time: "اكتب الوقت ساعة:دقيقة، مثل 09:30",
  month: "اكتب الشهر شهراً/سنة، مثل 11/2026",
};

const text = ref(formatDateInput(model.value, props.kind));
// ما أرسله الحقل نفسه، فلا يمحو تحديثُه النصَّ الذي يُكتب.
let emitted: string | null | undefined;
watch(model, (value) => {
  if (value === emitted) return;
  text.value = formatDateInput(value, props.kind);
});

const parsed = computed(() => parseDateInput(text.value, props.kind));
function emit(value: string) {
  if (value === (model.value ?? "")) return;
  emitted = value;
  model.value = value;
}
function onInput(value: string | null) {
  text.value = value ?? "";
  emit(parsed.value ?? "");
}
function onBlur() {
  if (parsed.value) text.value = formatDateInput(parsed.value, props.kind);
}

const validity = () => {
  if (parsed.value === null) return INVALID[props.kind];
  if (parsed.value && !withinBounds(parsed.value, props.min, props.max))
    return props.kind === "time"
      ? "الوقت خارج المدة المسموحة"
      : "التاريخ خارج المدة المسموحة";
  return true;
};
const rules = computed(() => [
  ...((attrs.rules as Array<(value: unknown) => true | string>) ?? []),
  validity,
]);

const flag = (value: unknown) => value !== undefined && value !== false;
const locked = computed(() => flag(attrs.disabled) || flag(attrs.readonly));

const native = ref<HTMLInputElement | null>(null);
function openPicker() {
  if (locked.value) return;
  try {
    native.value?.showPicker();
  } catch {
    // لا تقويم بلا تفاعل مباشر من المستخدم؛ الكتابة تبقى متاحة.
  }
}
function onPicked(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  text.value = formatDateInput(value, props.kind);
  emit(value);
}
function onKeydown(event: KeyboardEvent) {
  if (event.altKey && event.key === "ArrowDown") {
    event.preventDefault();
    openPicker();
  }
}
</script>

<template>
  <v-text-field
    v-bind="$attrs"
    :model-value="text"
    :rules="rules"
    :placeholder="($attrs.placeholder as string) ?? PLACEHOLDER[kind]"
    dir="ltr"
    :inputmode="kind === 'time' ? 'numeric' : 'text'"
    autocomplete="off"
    class="date-field"
    @update:model-value="onInput"
    @blur="onBlur"
    @keydown="onKeydown"
  >
    <template #append-inner>
      <slot name="append-inner" />
      <v-btn
        v-if="!locked"
        :icon="kind === 'time' ? 'mdi-clock-outline' : 'mdi-calendar-month'"
        size="x-small"
        variant="text"
        tabindex="-1"
        :aria-label="kind === 'time' ? 'اختيار الوقت' : 'اختيار من التقويم'"
        :title="`${kind === 'time' ? 'اختيار الوقت' : 'التقويم'} (Alt+↓)`"
        @mousedown.prevent
        @click.stop="openPicker"
      />
      <input
        ref="native"
        :type="kind"
        class="date-field__native"
        :value="model ?? ''"
        :min="min"
        :max="max"
        tabindex="-1"
        aria-hidden="true"
        @change="onPicked"
      />
    </template>
  </v-text-field>
</template>

<style scoped>
/* الحقل الأصلي للتقويم فقط: حاضر ليُفتح showPicker تحته، غير ظاهر ولا يُنقر. */
.date-field__native {
  position: absolute;
  inset-inline-end: 0;
  bottom: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.date-field :deep(input) {
  font-variant-numeric: tabular-nums;
}
</style>
