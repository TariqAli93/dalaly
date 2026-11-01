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
    <!-- الحالات صفوف والنوعان عمودان: يتّسع الجدول للعمود الجانبي (نحو 380px)
         وتُقارَن أرقام البيع والإيجار في الحالة نفسها على سطر واحد. -->
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
          <th scope="col"><span class="d-sr-only">الحالة</span></th>
          <th v-for="row in rows" :key="row.kind" scope="col">
            {{ row.title }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">متاحة</th>
          <td v-for="row in rows" :key="row.kind">
            <button
              type="button"
              class="performance__link"
              @click="emit('open', { kind: row.kind, status: 'available' })"
            >
              {{ formatNumber(row.available, 0) }}
            </button>
          </td>
        </tr>
        <tr class="performance__sub">
          <th scope="row">قيمة المتاحة</th>
          <td v-for="row in rows" :key="row.kind">
            <span class="money">{{ formatMoney(row.value) }}</span> د.ع
            <template v-if="row.kind === 'rental'">{{
              row.valueLabel
            }}</template>
          </td>
        </tr>
        <tr>
          <th scope="row">قيد التفاوض</th>
          <td v-for="row in rows" :key="row.kind">
            <button
              type="button"
              class="performance__link"
              @click="emit('open', { kind: row.kind, status: 'negotiating' })"
            >
              {{ formatNumber(row.negotiating, 0) }}
            </button>
          </td>
        </tr>
        <tr>
          <th scope="row">محجوزة</th>
          <td v-for="row in rows" :key="row.kind">
            <button
              type="button"
              class="performance__link"
              @click="emit('open', { kind: row.kind, status: 'reserved' })"
            >
              {{ formatNumber(row.reserved, 0) }}
            </button>
          </td>
        </tr>
        <tr>
          <th scope="row">مباعة أو مؤجرة الآن</th>
          <td v-for="row in rows" :key="row.kind">
            <button
              type="button"
              class="performance__link"
              :aria-label="`${row.doneLabel} الآن: ${row.done}`"
              @click="emit('open', { kind: row.kind, status: row.doneStatus })"
            >
              {{ formatNumber(row.done, 0) }}
            </button>
          </td>
        </tr>
        <tr>
          <th scope="row">مُنجز خلال {{ overview.recent_days }} يوماً</th>
          <td
            v-for="row in rows"
            :key="row.kind"
            :class="row.closed ? 'performance__done' : 'performance__zero'"
          >
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
/* أعمدة الأرقام بعرض متساوٍ في الطرف، فيصطفّ البيع تحت البيع. */
.performance__table thead th:not(:first-child),
.performance__table td {
  width: 30%;
  text-align: end;
}
.performance__table thead th {
  height: var(--dal-head-height);
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  color: var(--dal-muted);
  background: var(--dal-hover);
}
.performance__table tbody th {
  font-weight: 600;
}
.performance__table tbody tr:last-child > * {
  border-bottom: 0;
}
/* قيمة المتاحة سطر تابع لـ«متاحة»: أصغر وباهت وبلا فاصل بينهما. */
.performance__table tr:has(+ .performance__sub) > * {
  border-bottom: 0;
  padding-bottom: 0;
}
.performance__table .performance__sub > * {
  padding-top: 0;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 400;
  color: var(--dal-muted);
}
.performance__link {
  padding: 0 6px;
  margin-inline-end: -6px;
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
.performance__zero {
  color: var(--dal-muted);
  font-weight: 700;
}
.performance__table + .performance__note {
  border-top: 1px solid var(--dal-stroke);
}
.performance__note {
  margin: 0;
  padding: 8px 12px;
  text-wrap: pretty;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>
