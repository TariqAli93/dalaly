<script setup lang="ts">
import { computed } from "vue";
import type { DashboardOverview } from "../../types";
import { formatMoney, formatNumber } from "../../utils/format";

/**
 * حالة العروض من السجلات المحفوظة فقط: صف للبيع وصف للإيجار، والمراحل
 * المفتوحة الآن مفصولة عمّا أُنجز خلال المدة. كل رقم يفتح قائمته مصفّاة.
 * كان هذا القسم ولوح «عمليات الإيجار» يعدّان حالات الإيجار مرتين؛ القيم
 * الشهرية للإيجار هنا الآن. لا عمولات ولا عقود إيجار مسجّلة، فلا نسب تحويل
 * ولا تجديدات.
 */
const props = defineProps<{ overview: DashboardOverview | null }>();
const emit = defineEmits<{
  open: [{ kind: "sale" | "rental"; status: string }];
}>();

const rows = computed(() => {
  const overview = props.overview;
  if (!overview) return [];
  const result = [];
  if (overview.sale)
    result.push({
      kind: "sale" as const,
      title: "البيع",
      available: overview.sale.counts.available,
      value: overview.sale.available_value,
      valueLabel: "قيمتها",
      negotiating: overview.sale.counts.negotiating,
      reserved: overview.sale.counts.reserved,
      closed: overview.sale.closed_recently,
      doneStatus: "sold",
      done: overview.sale.counts.sold,
      doneLabel: "مباع",
    });
  if (overview.rental)
    result.push({
      kind: "rental" as const,
      title: "الإيجار",
      available: overview.rental.counts.available,
      value: overview.rental.available_monthly_value,
      valueLabel: "شهرياً",
      negotiating: overview.rental.counts.negotiating,
      reserved: overview.rental.counts.reserved,
      closed: overview.rental.closed_recently,
      doneStatus: "rented",
      done: overview.rental.counts.rented,
      doneLabel: "مؤجر",
    });
  return result;
});
</script>

<template>
  <section class="dal-panel performance" aria-labelledby="performance-title">
    <header class="dal-panel__header">
      <h2 id="performance-title" class="dal-section-title">حالة العروض</h2>
    </header>
    <div v-if="!overview" class="performance__loading">
      <v-skeleton-loader type="table-row@2" />
    </div>
    <p v-else-if="!rows.length" class="performance__note">
      أرقام العروض والإيجارات غير متاحة لحسابك.
    </p>
    <table v-else class="performance__table">
      <caption class="d-sr-only">
        عدد العروض في كل حالة، والمُنجز خلال آخر
        {{
          overview.recent_days
        }}
        يوماً
      </caption>
      <thead>
        <tr>
          <th scope="col"><span class="d-sr-only">النوع</span></th>
          <th scope="col">متاحة</th>
          <th scope="col">قيد التفاوض</th>
          <th scope="col">محجوزة</th>
          <th scope="col">مباعة أو مؤجرة الآن</th>
          <th scope="col">مُنجز خلال {{ overview.recent_days }} يوماً</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.kind">
          <th scope="row">{{ row.title }}</th>
          <td>
            <button
              type="button"
              class="performance__link"
              @click="emit('open', { kind: row.kind, status: 'available' })"
            >
              {{ formatNumber(row.available, 0) }}
            </button>
            <small
              >{{ row.valueLabel }}
              <span class="money">{{ formatMoney(row.value) }}</span>
              د.ع</small
            >
          </td>
          <td>
            <button
              type="button"
              class="performance__link"
              @click="emit('open', { kind: row.kind, status: 'negotiating' })"
            >
              {{ formatNumber(row.negotiating, 0) }}
            </button>
          </td>
          <td>
            <button
              type="button"
              class="performance__link"
              @click="emit('open', { kind: row.kind, status: 'reserved' })"
            >
              {{ formatNumber(row.reserved, 0) }}
            </button>
          </td>
          <td>
            <button
              type="button"
              class="performance__link"
              :aria-label="`${row.doneLabel} الآن: ${row.done}`"
              @click="emit('open', { kind: row.kind, status: row.doneStatus })"
            >
              {{ formatNumber(row.done, 0) }}
            </button>
          </td>
          <td class="performance__done">
            {{ formatNumber(row.closed, 0) }}
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="overview && rows.length" class="performance__note">
      «المُنجز» ما حالته الآن مباع أو مؤجر وسُجّل تغييرها إليها خلال المدة.
      القيمة الشهرية للإيجار: السنوي ÷ 12 ونصف السنوي ÷ 6. لا يسجّل دلالي
      العمولات ولا عقود الإيجار ودفعاتها، فلا نسب تحويل ولا تجديدات هنا.
    </p>
  </section>
</template>

<style scoped>
.performance {
  min-width: 0;
}
.performance__loading {
  padding: 4px 8px;
}
.performance__table {
  width: 100%;
  border-collapse: collapse;
  font-size: calc(13px * var(--dal-font-scale));
  font-variant-numeric: tabular-nums;
}
.performance__table th,
.performance__table td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--dal-stroke);
  text-align: start;
  vertical-align: middle;
}
.performance__table thead th {
  height: var(--dal-head-height);
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  color: var(--dal-muted);
  background: var(--dal-hover);
}
.performance__table tbody th {
  font-weight: 700;
}
.performance__table td small {
  display: block;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.performance__link {
  padding: 0 6px;
  margin-inline-start: -6px;
  border-radius: var(--dal-radius-control);
  color: rgb(var(--v-theme-primary-text));
  font-weight: 700;
}
.performance__link:hover {
  background: var(--dal-hover);
  text-decoration: underline;
}
.performance__done {
  color: rgb(var(--v-theme-success));
  font-weight: 700;
}
.performance__note {
  margin: 0;
  padding: 8px 12px;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>
