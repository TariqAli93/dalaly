<script setup lang="ts">
import { computed } from "vue";
import { usePermissions } from "../../composables/usePermissions";
import { dealStageLabel } from "../../constants/deals";
import { followupTypeLabel } from "../../constants/crm";
import {
  daysSince,
  formatAmount,
  formatNumber,
  formatShortDate,
  formatTime,
  pluralizeDays,
} from "../../utils/format";
import type { BusinessSummary } from "../../types";

/**
 * ما يحتاج انتباهاً اليوم، من /dashboard/business: المهام (المتأخرة واليوم
 * والأسبوع)، والصفقات (قيد التفاوض والمتوقفة والرابحة حديثاً)، والزبائن بلا
 * تواصل، والإيجارات (تنتهي قريباً وأقساط متأخرة)، ومال الشهر. كل رقم وكل
 * سطر رابط إلى سجلاته، ولا تظهر لوحة إلا لمن يملك صلاحية مجالها.
 */
const props = defineProps<{
  summary: BusinessSummary | null;
  loading: boolean;
  error: string | null;
}>();
const emit = defineEmits<{ retry: [] }>();
const { can } = usePermissions();

const tasks = computed(() => props.summary?.tasks ?? null);
const deals = computed(() => props.summary?.deals ?? null);
const customers = computed(() => props.summary?.customers ?? null);
const leases = computed(() => props.summary?.leases ?? null);
const money = computed(() => props.summary?.money ?? null);
const any = computed(
  () =>
    tasks.value ||
    deals.value ||
    customers.value ||
    leases.value ||
    money.value,
);
const reports = computed(() => can("reports.operations"));
const isZero = (value: string) => /^-?0(\.0+)?$/.test(value);

/** The overdue first, then today's, up to five. */
const taskRows = computed(() => {
  if (!tasks.value) return [];
  const seen = new Set<string>();
  return [...tasks.value.overdue.items, ...tasks.value.today.items]
    .filter((task) => {
      const key = `${task.source}:${task.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
});
const taskLink = (task: { person_id: number | null }) =>
  task.person_id && can("people.read")
    ? `/clients/${task.person_id}`
    : "/tasks";
const monthLink = computed(() =>
  money.value
    ? `/reports/financial?report=income-statement&from=${money.value.from}&to=${money.value.to}`
    : "",
);
</script>

<template>
  <section
    v-if="any || loading || error"
    class="biz"
    aria-label="ما يحتاج انتباهاً"
  >
    <v-alert
      v-if="error && !summary"
      type="warning"
      variant="tonal"
      density="compact"
      class="biz__wide"
      role="status"
    >
      تعذّر تحميل المهام والصفقات والإيجارات والمال: {{ error }}
      <template #append>
        <v-btn size="small" variant="text" @click="emit('retry')"
          >إعادة المحاولة</v-btn
        >
      </template>
    </v-alert>
    <template v-else-if="!summary">
      <div v-for="n in 3" :key="n" class="dal-panel biz__panel">
        <v-skeleton-loader type="list-item-two-line@3" />
      </div>
    </template>

    <!-- المهام -->
    <section
      v-if="tasks"
      class="dal-panel biz__panel"
      aria-labelledby="biz-tasks"
    >
      <header class="biz__head">
        <h2 id="biz-tasks" class="dal-section-title">المهام</h2>
        <router-link to="/tasks" class="biz__all">كل المهام</router-link>
      </header>
      <div class="biz__figures">
        <router-link
          to="/tasks?due=overdue"
          class="biz__figure"
          :class="{ 'biz__figure--bad': tasks.overdue.total }"
          ><strong>{{ formatNumber(tasks.overdue.total, 0) }}</strong
          ><span>فات موعدها</span></router-link
        >
        <router-link to="/tasks?due=today" class="biz__figure"
          ><strong>{{ formatNumber(tasks.today.total, 0) }}</strong
          ><span>اليوم</span></router-link
        >
        <router-link to="/tasks?due=week" class="biz__figure"
          ><strong>{{ formatNumber(tasks.week.total, 0) }}</strong
          ><span>خلال 7 أيام</span></router-link
        >
      </div>
      <p v-if="!taskRows.length" class="biz__empty">
        لا مهام متأخرة ولا مهام اليوم.
      </p>
      <router-link
        v-for="task in taskRows"
        :key="`${task.source}:${task.id}`"
        :to="taskLink(task)"
        class="biz__row"
      >
        <span class="biz__row-main"
          >{{ followupTypeLabel(task.type) }}
          <template v-if="task.person_name"> · {{ task.person_name }}</template
          ><template v-else-if="task.listing_code">
            · {{ task.listing_code }}</template
          ></span
        >
        <span class="biz__row-sub" :class="{ 'text-error': task.overdue }">
          {{
            task.scheduled_at
              ? task.overdue
                ? `فات ${formatShortDate(task.scheduled_at)} ${formatTime(task.scheduled_at)}`
                : `اليوم ${formatTime(task.scheduled_at)}`
              : ""
          }}
          <template v-if="task.notes"> · {{ task.notes }}</template>
        </span>
      </router-link>
    </section>

    <!-- الصفقات -->
    <section
      v-if="deals"
      class="dal-panel biz__panel"
      aria-labelledby="biz-deals"
    >
      <header class="biz__head">
        <h2 id="biz-deals" class="dal-section-title">الصفقات</h2>
        <router-link to="/deals" class="biz__all">كل الصفقات</router-link>
      </header>
      <div class="biz__figures">
        <router-link to="/deals" class="biz__figure"
          ><strong>{{ formatNumber(deals.negotiating.total, 0) }}</strong
          ><span>قيد التفاوض</span></router-link
        >
        <router-link
          to="/deals?stalled=1"
          class="biz__figure"
          :class="{ 'biz__figure--warn': deals.stalled.total }"
          ><strong>{{ formatNumber(deals.stalled.total, 0) }}</strong
          ><span>راكدة منذ {{ deals.stalled_days }} يوماً</span></router-link
        >
        <router-link
          :to="reports ? '/reports/operations?report=deals' : '/deals'"
          class="biz__figure biz__figure--good"
          ><strong>{{ formatNumber(deals.recently_won.total, 0) }}</strong
          ><span>رُبحت خلال {{ deals.recent_days }} يوماً</span></router-link
        >
      </div>
      <p
        v-if="!deals.stalled.items.length && !deals.negotiating.items.length"
        class="biz__empty"
      >
        لا صفقات قيد التفاوض ولا راكدة.
      </p>
      <router-link
        v-for="deal in deals.stalled.items.length
          ? deals.stalled.items
          : deals.negotiating.items"
        :key="deal.id"
        :to="`/deals/${deal.id}`"
        class="biz__row"
      >
        <span class="biz__row-main"
          ><bdi>{{ deal.code }}</bdi> ·
          {{ deal.title ?? deal.client_name ?? "" }}</span
        >
        <span class="biz__row-sub"
          >{{ dealStageLabel(deal.stage) }} ·
          {{ pluralizeDays(daysSince(deal.stage_changed_at)) }}
          <template v-if="deal.user_name"> · {{ deal.user_name }}</template>
        </span>
      </router-link>
    </section>

    <!-- الزبائن بلا تواصل -->
    <section
      v-if="customers"
      class="dal-panel biz__panel"
      aria-labelledby="biz-customers"
    >
      <header class="biz__head">
        <h2 id="biz-customers" class="dal-section-title">
          زبائن بحاجة إلى تواصل
        </h2>
        <router-link
          :to="reports ? '/reports/operations?report=customers' : '/people'"
          class="biz__all"
          >الكل</router-link
        >
      </header>
      <div class="biz__figures">
        <router-link
          :to="reports ? '/reports/operations?report=customers' : '/people'"
          class="biz__figure"
          :class="{ 'biz__figure--warn': customers.needing_contact.total }"
          ><strong>{{
            formatNumber(customers.needing_contact.total, 0)
          }}</strong
          ><span
            >لهم صفقة أو طلب مفتوح ولا تواصل منذ
            {{ customers.contact_days }} يوماً</span
          ></router-link
        >
      </div>
      <p v-if="!customers.needing_contact.rows.length" class="biz__empty">
        تواصل المكتب مع كل من له ما هو مفتوح.
      </p>
      <router-link
        v-for="person in customers.needing_contact.rows"
        :key="person.person_id"
        :to="`/clients/${person.person_id}`"
        class="biz__row"
      >
        <span class="biz__row-main">{{ person.person_name }}</span>
        <span class="biz__row-sub">
          {{
            person.last_contact
              ? `آخر تواصل ${formatShortDate(person.last_contact)}`
              : "لم يُتواصل معه"
          }}
          <template v-if="person.open_deals">
            · صفقات مفتوحة {{ person.open_deals }}</template
          >
          <template v-if="person.open_requests">
            · طلبات مفتوحة {{ person.open_requests }}</template
          >
        </span>
      </router-link>
    </section>

    <!-- الإيجارات -->
    <section
      v-if="leases"
      class="dal-panel biz__panel"
      aria-labelledby="biz-leases"
    >
      <header class="biz__head">
        <h2 id="biz-leases" class="dal-section-title">الإيجارات السارية</h2>
        <router-link to="/leases" class="biz__all">كل الإيجارات</router-link>
      </header>
      <div class="biz__figures">
        <router-link
          to="/leases?view=overdue"
          class="biz__figure"
          :class="{ 'biz__figure--bad': leases.overdue.total }"
          ><strong>{{ formatNumber(leases.overdue.total, 0) }}</strong
          ><span>أقساط متأخرة</span></router-link
        >
        <router-link
          :to="
            reports
              ? `/reports/operations?report=leases&days=${leases.expiring_days}`
              : '/leases'
          "
          class="biz__figure"
          :class="{ 'biz__figure--warn': leases.expiring.total }"
          ><strong>{{ formatNumber(leases.expiring.total, 0) }}</strong
          ><span>تنتهي خلال {{ leases.expiring_days }} يوماً</span></router-link
        >
      </div>
      <p
        v-for="row in leases.overdue.by_currency"
        :key="row.currency"
        class="biz__note text-error"
      >
        متأخر على المستأجرين
        <bdi>{{ formatAmount(row.left, row.currency) }}</bdi>
      </p>
      <router-link
        v-for="item in leases.overdue.items"
        :key="`i${item.id}`"
        :to="`/leases/${item.lease_id}`"
        class="biz__row"
      >
        <span class="biz__row-main"
          ><bdi>{{ item.lease_code }}</bdi> · {{ item.tenant_name ?? "" }}</span
        >
        <span class="biz__row-sub text-error"
          >القسط {{ item.seq }} متأخر {{ item.days_overdue }} يوماً ·
          <bdi>{{ formatAmount(item.left, item.currency) }}</bdi></span
        >
      </router-link>
      <router-link
        v-for="item in leases.expiring.items"
        :key="`e${item.id}`"
        :to="`/leases/${item.id}`"
        class="biz__row"
      >
        <span class="biz__row-main"
          ><bdi>{{ item.code }}</bdi> · {{ item.tenant_name ?? "" }}</span
        >
        <span class="biz__row-sub"
          >ينتهي {{ formatShortDate(item.end_date) }} (بعد
          {{ item.days_left }} يوماً)</span
        >
      </router-link>
      <p
        v-if="!leases.overdue.items.length && !leases.expiring.items.length"
        class="biz__empty"
      >
        لا أقساط متأخرة ولا إيجار ينتهي قريباً.
      </p>
    </section>

    <!-- مال الشهر -->
    <section
      v-if="money"
      class="dal-panel biz__panel"
      aria-labelledby="biz-money"
    >
      <header class="biz__head">
        <h2 id="biz-money" class="dal-section-title">مال هذا الشهر</h2>
        <router-link :to="monthLink" class="biz__all"
          >الإيرادات والمصروفات</router-link
        >
      </header>
      <p v-if="!money.currencies.length" class="biz__empty">
        لا حركة مالية هذا الشهر.
      </p>
      <dl
        v-for="row in money.currencies"
        :key="row.currency"
        class="biz__money"
      >
        <p v-if="money.currencies.length > 1" class="biz__currency">
          {{ row.currency === "USD" ? "بالدولار" : "بالدينار" }}
        </p>
        <div>
          <dt>
            <router-link
              :to="`/reports/financial?report=commissions&from=${money.from}&to=${money.to}`"
              >عمولات محصَّلة</router-link
            >
          </dt>
          <dd class="text-success">
            <bdi>{{
              formatAmount(row.commissions_collected, row.currency)
            }}</bdi>
          </dd>
        </div>
        <div>
          <dt>
            <router-link
              v-if="can('commissions.read')"
              to="/accounting/commissions?state=open"
              >عمولات لم تُحصَّل ({{ row.commissions_open }})</router-link
            >
            <template v-else
              >عمولات لم تُحصَّل ({{ row.commissions_open }})</template
            >
          </dt>
          <dd :class="{ 'text-warning': !isZero(row.commissions_outstanding) }">
            <bdi>{{
              formatAmount(row.commissions_outstanding, row.currency)
            }}</bdi>
          </dd>
        </div>
        <div>
          <dt><router-link :to="monthLink">المصروفات</router-link></dt>
          <dd>
            <bdi>{{ formatAmount(row.expenses, row.currency) }}</bdi>
          </dd>
        </div>
        <div>
          <dt><router-link :to="monthLink">صافي الربح</router-link></dt>
          <dd :class="row.net.startsWith('-') ? 'text-error' : 'text-success'">
            <bdi>{{ formatAmount(row.net, row.currency) }}</bdi>
          </dd>
        </div>
      </dl>
    </section>
  </section>
</template>

<style scoped>
.biz {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: var(--dal-gutter);
  align-items: start;
}
.biz__wide {
  grid-column: 1 / -1;
}
.biz__panel {
  padding: 10px 14px;
  min-width: 0;
}
.biz__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.biz__all {
  font-size: calc(12px * var(--dal-font-scale));
  white-space: nowrap;
}
.biz__figures {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-bottom: 6px;
}
.biz__figure {
  display: grid;
  color: inherit;
  text-decoration: none;
  border-radius: var(--dal-radius-control);
  padding: 2px 4px;
}
.biz__figure:hover,
.biz__figure:focus-visible {
  background: var(--dal-hover);
}
.biz__figure strong {
  font-size: calc(20px * var(--dal-font-scale));
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.biz__figure span {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.biz__figure--bad strong {
  color: rgb(var(--v-theme-error));
}
.biz__figure--warn strong {
  color: rgb(var(--v-theme-warning));
}
.biz__figure--good strong {
  color: rgb(var(--v-theme-success));
}
.biz__row {
  display: grid;
  gap: 1px;
  padding: 5px 6px;
  color: inherit;
  text-decoration: none;
  border-radius: var(--dal-radius-control);
}
.biz__row:hover,
.biz__row:focus-visible {
  background: var(--dal-hover);
}
.biz__row-main,
.biz__row-sub {
  font-size: calc(12px * var(--dal-font-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.biz__row-sub {
  color: var(--dal-muted);
}
.biz__empty,
.biz__note {
  margin: 4px 0;
  font-size: calc(12px * var(--dal-font-scale));
}
.biz__empty {
  color: var(--dal-muted);
}
.biz__money {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 0 0 6px;
}
.biz__currency {
  grid-column: 1 / -1;
  margin: 0;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 700;
}
.biz__money dt {
  font-size: calc(12px * var(--dal-font-scale));
}
.biz__money dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
