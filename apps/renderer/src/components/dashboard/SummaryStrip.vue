<script setup lang="ts">
import type { DashboardSection, KpiItem } from "../../utils/dashboardPriority";
import { formatNumber } from "../../utils/format";

/**
 * شريط الملخّص: صف واحد مفصول بخطوط رفيعة، لكل رقم وسمه وسطر يشرحه، وكل رقم
 * زر يفتح قسمه وينقل التركيز إليه. هنا وحده يظهر كل عدد في اللوحة. null يعني
 * أن قسمه لم يُحمَّل بعد؛ ما لا يملك المستخدم صلاحيته لا يُمرَّر أصلاً.
 * اللون للحالة لا للزينة: الرقم الذي يحتاج عملاً اليوم وحده بلون التنبيه.
 */
defineProps<{ items: KpiItem[] }>();
const emit = defineEmits<{ select: [DashboardSection] }>();
</script>

<template>
  <section class="dal-panel summary" aria-label="ملخّص اليوم">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="summary__item"
      :aria-label="`${item.label}: ${item.value ?? 'قيد التحميل'}${item.note ? '، ' + item.note : ''}`"
      @click="emit('select', item.target)"
    >
      <span class="summary__label">{{ item.label }}</span>
      <strong
        v-if="item.value !== null"
        class="summary__value"
        :class="{
          'summary__value--alert': item.tone === 'error' && item.value > 0,
          'summary__value--zero': item.value === 0,
        }"
        >{{ formatNumber(item.value, 0) }}</strong
      >
      <v-skeleton-loader
        v-else
        type="text"
        width="48"
        class="summary__skeleton"
      />
      <span v-if="item.note" class="summary__note">{{ item.note }}</span>
    </button>
  </section>
</template>

<style scoped>
.summary {
  display: flex;
  flex-wrap: wrap;
}
.summary__item {
  flex: 1 1 160px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "label value"
    "note value";
  align-items: center;
  column-gap: 12px;
  min-width: 0;
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
.summary__label {
  grid-area: label;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
}
.summary__note {
  grid-area: note;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary__value {
  grid-area: value;
  font-size: calc(20px * var(--dal-font-scale));
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--v-theme-primary-text));
}
.summary__value--alert {
  color: rgb(var(--v-theme-error));
}
.summary__value--zero {
  color: var(--dal-muted);
}
.summary__skeleton {
  grid-area: value;
  background: transparent;
}
.summary__skeleton :deep(.v-skeleton-loader__text) {
  margin: 0;
  height: 18px;
}
</style>
