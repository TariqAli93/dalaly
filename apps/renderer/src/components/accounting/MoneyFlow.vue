<script setup lang="ts">
import { formatAmount } from "../../utils/format";
import type { CashFlowSection, Currency } from "../../types";

/**
 * من أين جاء المال وأين صُرف خلال الفترة: فئات التدفق النقدي (ما دخل وما خرج
 * لكل فئة) ثم المصروفات بتصنيفها، كما يحسبها الخادم لكل عملة. لا جمع هنا.
 */
defineProps<{
  flows: CashFlowSection[];
  expenseCategories: Array<{
    currency: Currency;
    rows: Array<{
      category_id: number | null;
      category_name: string | null;
      amount: string;
    }>;
  }>;
  loading?: boolean;
  periodLabel: string;
}>();

const zero = (amount: string) => /^-?0+(\.0+)?$/.test(amount);
const currencyTitle = (currency: Currency) =>
  currency === "USD" ? "بالدولار" : "بالدينار";
</script>

<template>
  <section class="dal-panel flow" aria-labelledby="flow-title">
    <header class="dal-panel__header">
      <h2 id="flow-title" class="dal-section-title">
        من أين جاء المال وأين صُرف
      </h2>
      <span class="flow__period">{{ periodLabel }}</span>
    </header>
    <v-progress-linear v-if="loading && !flows.length" indeterminate />
    <p v-else-if="!flows.length" class="flow__empty">
      لا حركة على الصناديق والمصارف في هذه الفترة.
    </p>
    <div v-for="section in flows" :key="section.currency" class="flow__section">
      <p v-if="flows.length > 1" class="flow__currency">
        {{ currencyTitle(section.currency) }}
      </p>
      <table class="flow__table">
        <caption class="d-sr-only">
          {{
            `حركة المال ${currencyTitle(section.currency)}`
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">الفئة</th>
            <th scope="col" class="flow__amount">دخل</th>
            <th scope="col" class="flow__amount">خرج</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in section.categories" :key="row.category">
            <th scope="row">{{ row.category_name }}</th>
            <td class="flow__amount flow__in">
              <bdi v-if="!zero(row.money_in)">{{
                formatAmount(row.money_in, section.currency)
              }}</bdi>
            </td>
            <td class="flow__amount flow__out">
              <bdi v-if="!zero(row.money_out)">{{
                formatAmount(row.money_out, section.currency)
              }}</bdi>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">المجموع</th>
            <td class="flow__amount">
              <bdi>{{
                formatAmount(section.totals.money_in, section.currency)
              }}</bdi>
            </td>
            <td class="flow__amount">
              <bdi>{{
                formatAmount(section.totals.money_out, section.currency)
              }}</bdi>
            </td>
          </tr>
        </tfoot>
      </table>
      <template
        v-for="group in expenseCategories.filter(
          (item) => item.currency === section.currency && item.rows.length,
        )"
        :key="group.currency"
      >
        <h3 class="flow__subtitle">المصروفات بتصنيفها</h3>
        <ul class="flow__list">
          <li v-for="row in group.rows" :key="row.category_id ?? 'none'">
            <span>{{ row.category_name ?? "بلا تصنيف" }}</span>
            <bdi>{{ formatAmount(row.amount, group.currency) }}</bdi>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.flow__period {
  margin-inline-start: auto;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.flow__empty {
  margin: 0;
  padding: 12px 16px;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
.flow__section + .flow__section {
  border-top: 1px solid var(--dal-stroke);
}
.flow__currency {
  margin: 0;
  padding: 8px 12px 0;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 700;
  color: var(--dal-muted);
}
.flow__table {
  width: 100%;
  border-collapse: collapse;
  font-size: calc(13px * var(--dal-font-scale));
}
.flow__table th,
.flow__table td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--dal-stroke);
  text-align: start;
  font-weight: 400;
}
.flow__table thead th {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
}
.flow__table tfoot th,
.flow__table tfoot td {
  font-weight: 700;
  border-bottom: none;
}
.flow__amount {
  text-align: end !important;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.flow__in bdi {
  color: rgb(var(--v-theme-success));
}
.flow__out bdi {
  color: rgb(var(--v-theme-error));
}
.flow__subtitle {
  margin: 0;
  padding: 10px 12px 4px;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 700;
  color: var(--dal-muted);
}
.flow__list {
  margin: 0;
  padding: 0 0 8px;
  list-style: none;
  font-size: calc(13px * var(--dal-font-scale));
}
.flow__list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 12px;
}
.flow__list bdi {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
