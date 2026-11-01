<script setup lang="ts">
import type { DashboardSection, KpiItem } from "../../utils/dashboardPriority";
import { formatNumber } from "../../utils/format";

/**
 * شريط الملخّص: صف واحد مفصول بخطوط رفيعة، لكل رقم وسمه وسطر يشرحه، وكل رقم
 * زر يفتح قسمه وينقل التركيز إليه. هنا وحده يظهر كل عدد في اللوحة. null يعني
 * أن قسمه لم يُحمَّل بعد؛ ما لا يملك المستخدم صلاحيته لا يُمرَّر أصلاً.
 * الرقم بجانب وسمه لا في طرف الخلية الآخر، فلا تقفز العين عبر 300px في شاشة
 * عريضة. اللون للحالة لا للزينة: أحمر لما فات موعده، وأوكر لما ينتظر قراراً،
 * وأساسي لفرصة عمل، وباهت للصفر.
 */
defineProps<{ items: KpiItem[] }>();
const emit = defineEmits<{ select: [DashboardSection] }>();

function toneClass(item: KpiItem) {
  if (item.value === null) return undefined;
  if (item.value === 0) return "summary__item--zero";
  if (item.tone === "error") return "summary__item--alert";
  if (item.tone === "warning") return "summary__item--waiting";
  return undefined;
}
</script>

<template>
  <section class="dal-panel summary" aria-label="ملخّص اليوم">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="summary__item"
      :class="toneClass(item)"
      :aria-label="`${item.label}: ${item.value ?? 'قيد التحميل'}${item.note ? '، ' + item.note : ''}`"
      @click="emit('select', item.target)"
    >
      <strong v-if="item.value !== null" class="summary__value">{{
        formatNumber(item.value, 0)
      }}</strong>
      <v-skeleton-loader
        v-else
        type="text"
        width="32"
        class="summary__skeleton"
      />
      <span class="summary__label">{{ item.label }}</span>
      <span v-if="item.note" class="summary__note">{{ item.note }}</span>
    </button>
  </section>
</template>

<style scoped>
.summary {
  display: flex;
  flex-wrap: wrap;
}
/* أساس 150px: خمس خلايا في صف واحد حتى لوح بعرض 760px تقريباً (1366px بتكبير
   125% والقائمة موسّعة)؛ كان 172px يُسقط الخامسة وحدها إلى سطر كامل. */
.summary__item {
  flex: 1 1 150px;
  display: grid;
  /* عمود الرقم بعرض ثابت فتصطفّ الوسوم في الخلايا كلها. */
  grid-template-columns: 2.4em minmax(0, 1fr);
  grid-template-areas:
    "value label"
    "value note";
  align-items: center;
  column-gap: 10px;
  min-width: 0;
  min-height: 56px;
  padding: 8px 16px;
  text-align: start;
  border-inline-start: 1px solid var(--dal-stroke);
  transition: background-color 150ms ease;
}
.summary__item:first-child {
  border-inline-start: none;
}
.summary__item:hover {
  background: var(--dal-hover);
}
.summary__item:active {
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.summary__item:focus-visible {
  outline-offset: -2px;
}
.summary__value {
  grid-area: value;
  font-size: calc(22px * var(--dal-font-scale));
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--v-theme-primary-text));
}
/* الوسم يلتفّ إلى سطرين في خلية ضيقة بدل أن يُقصّ: هو ما يُقرأ أولاً. */
.summary__label {
  grid-area: label;
  align-self: end;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.4;
  text-wrap: balance;
}
.summary__note {
  grid-area: note;
  align-self: start;
  font-size: calc(12px * var(--dal-font-scale));
  line-height: 1.4;
  color: var(--dal-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* خلية بلا سطر شارح: الوسم في منتصف الرقم لا فوقه. */
.summary__item:not(:has(.summary__note)) .summary__label {
  grid-row: 1 / span 2;
  align-self: center;
}
.summary__item--alert .summary__value {
  color: rgb(var(--v-theme-error));
}
.summary__item--waiting .summary__value {
  color: rgb(var(--v-theme-warning));
}
.summary__item--zero .summary__value {
  color: var(--dal-muted);
}
.summary__skeleton {
  grid-area: value;
  background: transparent;
}
.summary__skeleton :deep(.v-skeleton-loader__text) {
  margin: 0;
  height: 20px;
}
</style>
