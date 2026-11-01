<script setup lang="ts">
import type { CurrencyAmount } from "../../composables/useAccountingSummary";
import { formatAmount, formatNumber } from "../../utils/format";

/**
 * شريط أرقام المال: خلايا متساوية بخطوط رفيعة بينها، في كل خلية وسمها فوق
 * مبلغها (سطر لكل عملة، فلا يُجمع دينار إلى دولار) وسطر يشرح ما يشمله. الخلية
 * التي تفتح قائمتها زر. اللون للحالة وحدها: أوكر لما ينتظر قبضاً.
 */
export type MoneyCell = {
  key: string;
  label: string;
  values: CurrencyAmount[];
  /** A count (deals, listings) in place of amounts. */
  count?: number | null;
  note?: string;
  /** warning: money still owed to the office. */
  tone?: "warning";
  /** The cell opens its list. */
  action?: boolean;
};

defineProps<{ cells: MoneyCell[]; loading?: boolean; label: string }>();
const emit = defineEmits<{ select: [string] }>();

const isZero = (values: CurrencyAmount[]) =>
  !values.length || values.every((value) => /^-?0+(\.0+)?$/.test(value.amount));
</script>

<template>
  <section class="dal-panel money" :aria-label="label">
    <component
      :is="cell.action ? 'button' : 'div'"
      v-for="cell in cells"
      :key="cell.key"
      :type="cell.action ? 'button' : undefined"
      class="money__cell"
      :class="{
        'money__cell--action': cell.action,
        'money__cell--waiting': cell.tone === 'warning' && !isZero(cell.values),
      }"
      @click="cell.action && emit('select', cell.key)"
    >
      <span class="money__label">{{ cell.label }}</span>
      <template
        v-if="
          loading &&
          (cell.count === undefined ? !cell.values.length : cell.count === null)
        "
      >
        <v-skeleton-loader type="text" width="96" class="money__skeleton" />
      </template>
      <bdi
        v-else-if="cell.count !== undefined"
        class="money__value"
        :class="{ 'money__value--zero': !cell.count }"
        >{{ cell.count === null ? "—" : formatNumber(cell.count, 0) }}</bdi
      >
      <template v-else>
        <bdi
          v-for="value in cell.values"
          :key="value.currency"
          class="money__value"
          >{{ formatAmount(value.amount, value.currency) }}</bdi
        >
        <bdi
          v-if="!cell.values.length"
          class="money__value money__value--zero"
          >{{ formatAmount("0.00", "IQD") }}</bdi
        >
      </template>
      <span v-if="cell.note" class="money__note">{{ cell.note }}</span>
    </component>
  </section>
</template>

<style scoped>
.money {
  display: flex;
  flex-wrap: wrap;
}
.money__cell {
  flex: 1 1 170px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  padding: 10px 16px;
  text-align: start;
  border-inline-start: 1px solid var(--dal-stroke);
}
.money__cell:first-child {
  border-inline-start: none;
}
.money__cell--action {
  transition: background-color 150ms ease;
}
.money__cell--action:hover {
  background: var(--dal-hover);
}
.money__cell--action:focus-visible {
  outline-offset: -2px;
}
.money__label {
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.4;
}
.money__value {
  font-size: calc(20px * var(--dal-font-scale));
  font-weight: 700;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: rgb(var(--v-theme-primary-text));
}
.money__value--zero {
  color: var(--dal-muted);
}
.money__cell--waiting .money__value {
  color: rgb(var(--v-theme-warning));
}
.money__note {
  font-size: calc(12px * var(--dal-font-scale));
  line-height: 1.4;
  color: var(--dal-muted);
}
.money__skeleton {
  background: transparent;
}
.money__skeleton :deep(.v-skeleton-loader__text) {
  margin: 4px 0;
  height: 20px;
}
</style>
