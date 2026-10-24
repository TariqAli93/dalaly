<script setup lang="ts">
import { computed } from "vue";
import type { DashboardMatching, DashboardOverview } from "../../types";
import { formatNumber } from "../../utils/format";
import { moneyText } from "../../utils/listingText";

/**
 * أداء المكتب من السجلات المحفوظة فقط، والمراحل المفتوحة الآن مفصولة عمّا
 * أُنجز. "التواصل" و"المعاينة" ليستا حالتين يسجّلهما النظام لكل فرصة، ولا
 * عمولات مسجّلة، فلا نسب تحويل ولا مبالغ عمولة هنا.
 */
const props = defineProps<{
  overview: DashboardOverview | null;
  matching: DashboardMatching | null;
}>();
const emit = defineEmits<{
  open: [{ kind: "sale" | "rental"; status: string }];
  matches: ["sale" | "rental"];
}>();

const rows = computed(() => {
  const overview = props.overview;
  if (!overview) return [];
  const result = [];
  if (overview.sale)
    result.push({
      kind: "sale" as const,
      title: "البيع",
      matched: props.matching?.counts.sale?.with_matches ?? null,
      negotiating: overview.sale.counts.negotiating,
      reserved: overview.sale.counts.reserved,
      closed: overview.sale.closed_recently,
      closedLabel: "بِيع",
      closedStatus: "sold",
      current: overview.sale.counts.sold,
      currentLabel: "مباع حالياً",
    });
  if (overview.rental)
    result.push({
      kind: "rental" as const,
      title: "الإيجار",
      matched: props.matching?.counts.rental?.with_matches ?? null,
      negotiating: overview.rental.counts.negotiating,
      reserved: overview.rental.counts.reserved,
      closed: overview.rental.closed_recently,
      closedLabel: "أُجّر",
      closedStatus: "rented",
      current: overview.rental.counts.rented,
      currentLabel: "مؤجر حالياً",
    });
  return result;
});
</script>

<template>
  <section class="dal-panel performance" aria-labelledby="performance-title">
    <header class="dal-panel__header">
      <h2 id="performance-title" class="dal-section-title">أداء المكتب</h2>
      <v-spacer />
      <span v-if="overview?.sale" class="performance__value">
        عروض البيع المتاحة:
        {{ formatNumber(overview.sale.counts.available, 0) }}
        · قيمتها
        <strong class="money">{{
          moneyText(overview.sale.available_value)
        }}</strong>
      </span>
    </header>
    <div v-if="!overview">
      <v-skeleton-loader type="table-row" />
      <v-skeleton-loader type="table-row" />
    </div>
    <div v-else-if="!rows.length" class="performance__empty">
      أرقام العروض والإيجارات غير متاحة لحسابك.
    </div>
    <div
      v-else
      class="performance__table"
      role="table"
      aria-label="مراحل الصفقات"
    >
      <div class="performance__row performance__row--head" role="row">
        <span role="columnheader"></span>
        <span role="columnheader">طلبات لها مطابقة</span>
        <span role="columnheader">قيد التفاوض</span>
        <span role="columnheader">محجوز</span>
        <span role="columnheader" class="performance__done"
          >مُنجز خلال {{ overview.recent_days }} يوماً</span
        >
        <span role="columnheader">الحالة الآن</span>
      </div>
      <div
        v-for="row in rows"
        :key="row.kind"
        class="performance__row"
        role="row"
      >
        <strong role="rowheader">{{ row.title }}</strong>
        <button
          type="button"
          role="cell"
          :disabled="row.matched === null"
          @click="emit('matches', row.kind)"
        >
          {{ row.matched === null ? "—" : formatNumber(row.matched, 0) }}
        </button>
        <button
          type="button"
          role="cell"
          @click="emit('open', { kind: row.kind, status: 'negotiating' })"
        >
          {{ formatNumber(row.negotiating, 0) }}
        </button>
        <button
          type="button"
          role="cell"
          @click="emit('open', { kind: row.kind, status: 'reserved' })"
        >
          {{ formatNumber(row.reserved, 0) }}
        </button>
        <span role="cell" class="performance__done"
          >{{ row.closedLabel }} {{ formatNumber(row.closed, 0) }}</span
        >
        <button
          type="button"
          role="cell"
          @click="emit('open', { kind: row.kind, status: row.closedStatus })"
        >
          {{ row.currentLabel }} {{ formatNumber(row.current, 0) }}
        </button>
      </div>
    </div>
    <p v-if="overview && rows.length" class="performance__note">
      المراحل المفتوحة حالات مسجّلة الآن. "المُنجز" يعدّ ما حالته الآن مباع أو
      مؤجر وسُجّل تغييرها إليها خلال المدة. لا يسجّل النظام التواصل والمعاينة
      مرحلةً لكل فرصة، ولا العمولات، فلا تظهر نسب تحويل أو مبالغ عمولة.
    </p>
  </section>
</template>

<style scoped>
.performance__value {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.performance__value strong {
  color: rgb(var(--v-theme-on-surface));
}
.performance__empty {
  padding: 12px 16px;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.performance__table {
  display: grid;
  overflow-x: auto;
}
.performance__row {
  display: grid;
  grid-template-columns: 90px repeat(5, minmax(110px, 1fr));
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--dal-stroke);
  font-size: calc(13px * var(--dal-font-scale));
  font-variant-numeric: tabular-nums;
}
.performance__row--head {
  font-size: calc(11.5px * var(--dal-font-scale));
  color: var(--dal-muted);
  background: var(--dal-canvas);
}
.performance__row button {
  text-align: start;
  padding: 2px 6px;
  margin-inline-start: -6px;
  border-radius: 4px;
  color: rgb(var(--v-theme-primary-text));
}
.performance__row button:hover:not(:disabled) {
  background: var(--dal-hover);
  text-decoration: underline;
}
.performance__row button:disabled {
  color: var(--dal-muted);
}
.performance__done {
  color: rgb(var(--v-theme-success));
  font-weight: 600;
}
.performance__row--head .performance__done {
  font-weight: 400;
}
.performance__note {
  margin: 0;
  padding: 8px 16px;
  font-size: calc(11px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>
