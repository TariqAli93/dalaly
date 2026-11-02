<script setup lang="ts">
import { computed } from "vue";
import { usePermissions } from "../../composables/usePermissions";
import { formatAmount, formatNumber } from "../../utils/format";
import { isZeroAmount } from "../../utils/money";
import { periodText } from "../../utils/periods";
import type { BusinessSummary } from "../../types";

/**
 * ملخّص العمل: عدد الصفقات في كل حال، ومال هذا الشهر بكل عملة وحدها، من
 * /dashboard/business. لا قوائم هنا: المتأخر وما ينتظر في «يحتاج متابعتك»،
 * والتفاصيل في الصفقات والحسابات والتقارير. لا يُجمع الدينار إلى الدولار، ولا
 * تدخل أمانات الزبائن في الإيراد (الخادم يحسب الأرقام).
 */
const props = defineProps<{ summary: BusinessSummary | null }>();
const { can } = usePermissions();

const deals = computed(() => props.summary?.deals ?? null);
const money = computed(() => props.summary?.money ?? null);
const reports = computed(() => can("reports.operations"));
const monthLink = computed(() =>
  money.value
    ? `/reports?report=income-statement&from=${money.value.from}&to=${money.value.to}`
    : "",
);
</script>

<template>
  <section
    v-if="deals || money"
    class="dal-panel work"
    aria-labelledby="work-title"
  >
    <header class="dal-panel__header">
      <h2 id="work-title" class="dal-section-title">ملخّص العمل</h2>
    </header>

    <template v-if="deals">
      <div class="work__caption">
        <span>الصفقات المفتوحة الآن</span>
        <router-link to="/deals" class="work__all">كل الصفقات</router-link>
      </div>
      <div class="work__figures">
        <router-link
          to="/deals"
          class="work__figure"
          :class="{ 'work__figure--zero': !deals.negotiating.total }"
          ><strong>{{ formatNumber(deals.negotiating.total, 0) }}</strong
          ><span>قيد التفاوض</span></router-link
        >
        <router-link
          to="/deals?stalled=1"
          class="work__figure"
          :class="
            deals.stalled.total ? 'work__figure--warn' : 'work__figure--zero'
          "
          ><strong>{{ formatNumber(deals.stalled.total, 0) }}</strong
          ><span
            >بلا تقدّم منذ {{ deals.stalled_days }} يوماً</span
          ></router-link
        >
        <router-link
          :to="reports ? '/reports?report=deals' : '/deals'"
          class="work__figure"
          :class="
            deals.recently_won.total
              ? 'work__figure--good'
              : 'work__figure--zero'
          "
          ><strong>{{ formatNumber(deals.recently_won.total, 0) }}</strong
          ><span>رُبحت خلال {{ deals.recent_days }} يوماً</span></router-link
        >
      </div>
    </template>

    <template v-if="money">
      <div class="work__caption">
        <span
          >مال هذا الشهر
          <small>{{ periodText(money.from, money.to) }}</small></span
        >
        <router-link :to="monthLink" class="work__all"
          >الإيرادات والمصروفات</router-link
        >
      </div>
      <p v-if="!money.currencies.length" class="work__empty">
        لا حركة مالية هذا الشهر.
      </p>
      <dl
        v-for="row in money.currencies"
        :key="row.currency"
        class="work__money"
      >
        <p v-if="money.currencies.length > 1" class="work__currency">
          {{ row.currency === "USD" ? "بالدولار" : "بالدينار" }}
        </p>
        <div>
          <dt>
            <router-link
              :to="`/reports?report=commissions&from=${money.from}&to=${money.to}`"
              >عمولات قُبضت هذا الشهر</router-link
            >
          </dt>
          <dd
            :class="{
              'text-success': !isZeroAmount(row.commissions_collected),
            }"
          >
            <bdi>{{
              formatAmount(row.commissions_collected, row.currency)
            }}</bdi>
          </dd>
        </div>
        <div>
          <dt>
            <router-link
              v-if="can('commissions.read')"
              to="/accounting?view=commissions&state=open"
              >عمولات لم تُقبض حتى اليوم ({{
                row.commissions_open
              }})</router-link
            >
            <template v-else
              >عمولات لم تُقبض حتى اليوم ({{ row.commissions_open }})</template
            >
          </dt>
          <dd
            :class="{
              'text-warning': !isZeroAmount(row.commissions_outstanding),
            }"
          >
            <bdi>{{
              formatAmount(row.commissions_outstanding, row.currency)
            }}</bdi>
          </dd>
        </div>
        <div>
          <dt><router-link :to="monthLink">مصروفات الشهر</router-link></dt>
          <dd>
            <bdi>{{ formatAmount(row.expenses, row.currency) }}</bdi>
          </dd>
        </div>
        <div>
          <dt><router-link :to="monthLink">صافي ربح الشهر</router-link></dt>
          <dd
            :class="
              isZeroAmount(row.net)
                ? undefined
                : row.net.startsWith('-')
                  ? 'text-error'
                  : 'text-success'
            "
          >
            <bdi>{{ formatAmount(row.net, row.currency) }}</bdi>
          </dd>
        </div>
      </dl>
      <p class="work__note">
        أمانات الزبائن (عربون، إيجار للمؤجر) ليست من إيراد المكتب ولا تدخل هنا.
      </p>
    </template>
  </section>
</template>

<style scoped>
.work {
  min-width: 0;
}
.work__caption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px 4px;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 700;
}
.work__caption small {
  margin-inline-start: 4px;
  font-weight: 400;
  color: var(--dal-muted);
}
.work__all {
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  white-space: nowrap;
  color: rgb(var(--v-theme-primary-text));
  text-decoration: none;
}
.work__all:hover {
  text-decoration: underline;
}
.work__figures {
  display: flex;
  border-bottom: 1px solid var(--dal-stroke);
}
.work__figure {
  flex: 1 1 0;
  display: grid;
  align-content: start;
  min-width: 0;
  padding: 6px 12px 8px;
  border-inline-start: 1px solid var(--dal-stroke);
  color: inherit;
  text-decoration: none;
  transition: background-color 150ms ease;
}
.work__figure:first-child {
  border-inline-start: 0;
}
.work__figure:hover {
  background: var(--dal-hover);
}
.work__figure:focus-visible {
  outline-offset: -2px;
}
.work__figure strong {
  font-size: calc(18px * var(--dal-font-scale));
  font-weight: 700;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.work__figure span {
  font-size: calc(12px * var(--dal-font-scale));
  line-height: 1.4;
  color: var(--dal-muted);
}
.work__figure--warn strong {
  color: rgb(var(--v-theme-warning));
}
.work__figure--good strong {
  color: rgb(var(--v-theme-success));
}
.work__figure--zero strong {
  color: var(--dal-muted);
}
.work__empty {
  margin: 0;
  padding: 8px 12px 12px;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
/* شبكة دفترية 2×2 لكل عملة، الوسم فوق القيمة. */
.work__money {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}
.work__money + .work__money {
  border-top: 1px solid var(--dal-stroke);
}
.work__money > div {
  min-width: 0;
  padding: 6px 12px;
}
.work__money > div:nth-of-type(even) {
  border-inline-start: 1px solid var(--dal-stroke);
}
.work__money > div:nth-of-type(n + 3) {
  border-top: 1px solid var(--dal-stroke);
}
.work__currency {
  grid-column: 1 / -1;
  margin: 0;
  padding: 8px 12px 0;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 700;
}
.work__money dt {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.work__money dt a {
  color: inherit;
  text-decoration: none;
}
.work__money dt a:hover {
  color: rgb(var(--v-theme-primary-text));
  text-decoration: underline;
}
.work__money dd {
  margin: 0;
  font-size: calc(15px * var(--dal-font-scale));
  font-weight: 700;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}
.work__note {
  margin: 0;
  padding: 6px 12px 8px;
  border-top: 1px solid var(--dal-stroke);
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>
