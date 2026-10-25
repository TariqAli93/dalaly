<script setup lang="ts">
import type { DashboardSection, KpiItem } from "../../utils/dashboardPriority";
import { formatNumber } from "../../utils/format";

/**
 * صف المؤشرات التنفيذية: أرقام قليلة، كل منها زر يفتح السجلات التي يعدّها.
 * القيمة null تعني أن قسمها لم يُحمَّل بعد؛ المؤشر الذي لا يملك المستخدم
 * صلاحيته لا يُمرَّر أصلاً.
 */

defineProps<{ items: KpiItem[] }>();
const emit = defineEmits<{ select: [DashboardSection] }>();
</script>

<template>
  <section class="kpis" aria-label="المؤشرات الرئيسية">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="kpi"
      :class="`kpi--${item.tone}`"
      :aria-label="`${item.label}: ${item.value ?? 'قيد التحميل'}`"
      @click="emit('select', item.target)"
    >
      <v-icon :icon="item.icon" size="20" class="kpi__icon" />
      <span class="kpi__copy">
        <span class="kpi__label">{{ item.label }}</span>
        <strong v-if="item.value !== null" class="kpi__value">{{
          formatNumber(item.value, 0)
        }}</strong>
        <v-skeleton-loader
          v-else
          type="text"
          width="56"
          class="kpi__skeleton"
        />
        <span v-if="item.note" class="kpi__note">{{ item.note }}</span>
      </span>
      <v-icon icon="mdi-chevron-left" size="16" class="kpi__go" />
    </button>
  </section>
</template>

<style scoped>
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}
.kpi {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 12px 14px;
  text-align: start;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
  background: rgb(var(--v-theme-surface));
  border-inline-start: 3px solid var(--kpi-tone);
  transition: background-color 120ms ease;
}
.kpi:hover {
  background: var(--dal-hover);
}
.kpi--primary {
  --kpi-tone: rgb(var(--v-theme-primary));
}
.kpi--warning {
  --kpi-tone: rgb(var(--v-theme-warning));
}
.kpi--error {
  --kpi-tone: rgb(var(--v-theme-error));
}
.kpi--success {
  --kpi-tone: rgb(var(--v-theme-success));
}
.kpi__icon {
  color: var(--kpi-tone);
  margin-top: 2px;
}
.kpi__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.kpi__label {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.kpi__value {
  font-size: calc(24px * var(--dal-font-scale));
  line-height: 1.2;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.kpi__note {
  font-size: calc(11px * var(--dal-font-scale));
  color: var(--dal-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kpi__skeleton {
  background: transparent;
}
.kpi__skeleton :deep(.v-skeleton-loader__text) {
  margin: 8px 0;
  height: 20px;
}
.kpi__go {
  color: var(--dal-muted);
  align-self: center;
}
</style>
