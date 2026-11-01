<script setup lang="ts">
import { computed } from "vue";
import { usePermissions } from "../../composables/usePermissions";
import { dealStageLabel } from "../../constants/deals";
import {
  followupTypeLabel,
  taskPriorityColor,
  taskPriorityLabel,
} from "../../constants/crm";
import {
  daysSince,
  formatAmount,
  formatNumber,
  formatShortDate,
  formatTime,
  pluralizeDays,
} from "../../utils/format";
import type { BusinessSummary } from "../../types";
import { isZeroAmount } from "../../utils/money";

/**
 * ما يحتاج انتباهاً اليوم، من /dashboard/business: المهام (المتأخرة واليوم
 * والأسبوع)، والصفقات (قيد التفاوض والمتوقفة والرابحة حديثاً)، والزبائن بلا
 * تواصل، والإيجارات (تنتهي قريباً وأقساط متأخرة)، ومال الشهر. كل رقم وكل
 * سطر رابط إلى سجلاته، ولا تظهر لوحة إلا لمن يملك صلاحية مجالها.
 *
 * عمودان ثابتان لا شبكة بطاقات متساوية: الأشخاص والمواعيد (المهام ثم الزبائن)
 * والعقود والمال (الإيجارات ثم الصفقات ثم مال الشهر). كل لوح يأخذ ارتفاع
 * محتواه، وكل سطر بالتشريح نفسه: ما هو ومن، ثم قيمة واحدة في الطرف تُقرأ
 * عمودياً (الموعد، المبلغ، المدة).
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
const isPressing = (priority: string) =>
  priority === "urgent" || priority === "high";
const dealRows = computed(() =>
  deals.value?.stalled.items.length
    ? deals.value.stalled.items
    : (deals.value?.negotiating.items ?? []),
);
const showingStalled = computed(() => !!deals.value?.stalled.items.length);
const monthLink = computed(() =>
  money.value
    ? `/reports?report=income-statement&from=${money.value.from}&to=${money.value.to}`
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
      <div v-for="n in 2" :key="n" class="biz__stack" aria-busy="true">
        <div class="dal-panel biz__panel">
          <div class="dal-panel__header">
            <v-skeleton-loader type="text" width="96" class="biz__bone" />
          </div>
          <v-skeleton-loader type="list-item-two-line@3" class="biz__bone" />
        </div>
      </div>
    </template>

    <!-- الأشخاص والمواعيد -->
    <div v-if="tasks || customers" class="biz__stack">
      <section
        v-if="tasks"
        class="dal-panel biz__panel"
        aria-labelledby="biz-tasks"
      >
        <header class="dal-panel__header biz__head">
          <h2 id="biz-tasks" class="dal-section-title">المهام</h2>
          <router-link to="/tasks" class="biz__all">كل المهام</router-link>
        </header>
        <div class="biz__figures">
          <router-link
            to="/tasks?due=overdue"
            class="biz__figure"
            :class="
              tasks.overdue.total ? 'biz__figure--bad' : 'biz__figure--zero'
            "
            ><strong>{{ formatNumber(tasks.overdue.total, 0) }}</strong
            ><span>فات موعدها</span></router-link
          >
          <router-link
            to="/tasks?due=today"
            class="biz__figure"
            :class="{ 'biz__figure--zero': !tasks.today.total }"
            ><strong>{{ formatNumber(tasks.today.total, 0) }}</strong
            ><span>اليوم</span></router-link
          >
          <router-link
            to="/tasks?due=week"
            class="biz__figure"
            :class="{ 'biz__figure--zero': !tasks.week.total }"
            ><strong>{{ formatNumber(tasks.week.total, 0) }}</strong
            ><span>خلال 7 أيام</span></router-link
          >
        </div>
        <p v-if="!taskRows.length" class="biz__empty">
          <v-icon
            icon="mdi-check-circle-outline"
            size="16"
            color="success"
            aria-hidden="true"
          />
          لا مهام متأخرة ولا مهام اليوم.
        </p>
        <ul v-else class="biz__rows">
          <li v-for="task in taskRows" :key="`${task.source}:${task.id}`">
            <router-link :to="taskLink(task)" class="biz__row">
              <span class="biz__row-text">
                <span class="biz__row-main"
                  >{{ followupTypeLabel(task.type) }}
                  <template v-if="task.person_name">
                    · {{ task.person_name }}</template
                  ><template v-else-if="task.listing_code">
                    · <bdi>{{ task.listing_code }}</bdi></template
                  >
                  <v-chip
                    v-if="isPressing(task.priority)"
                    :color="taskPriorityColor(task.priority)"
                    size="x-small"
                    variant="tonal"
                    label
                    class="biz__tag"
                    >{{ taskPriorityLabel(task.priority) }}</v-chip
                  ></span
                >
                <span v-if="task.notes" class="biz__row-sub">{{
                  task.notes
                }}</span>
              </span>
              <span
                v-if="task.scheduled_at"
                class="biz__row-meta"
                :class="{ 'biz__row-meta--bad': task.overdue }"
              >
                <span v-if="task.overdue"
                  >فات
                  <bdi dir="rtl">{{
                    formatShortDate(task.scheduled_at)
                  }}</bdi></span
                >
                <span v-else>اليوم</span>
                <small
                  ><bdi dir="rtl">{{
                    formatTime(task.scheduled_at)
                  }}</bdi></small
                >
              </span>
            </router-link>
          </li>
        </ul>
      </section>

      <section
        v-if="customers"
        class="dal-panel biz__panel"
        aria-labelledby="biz-customers"
      >
        <header class="dal-panel__header biz__head">
          <h2 id="biz-customers" class="dal-section-title">
            زبائن بحاجة إلى تواصل
          </h2>
          <router-link
            :to="reports ? '/reports?report=customers' : '/people'"
            class="biz__all"
            >الكل</router-link
          >
        </header>
        <div class="biz__figures">
          <router-link
            :to="reports ? '/reports?report=customers' : '/people'"
            class="biz__figure biz__figure--wide"
            :class="
              customers.needing_contact.total
                ? 'biz__figure--warn'
                : 'biz__figure--zero'
            "
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
          <v-icon
            icon="mdi-check-circle-outline"
            size="16"
            color="success"
            aria-hidden="true"
          />
          تواصل المكتب مع كل من له ما هو مفتوح.
        </p>
        <ul v-else class="biz__rows">
          <li
            v-for="person in customers.needing_contact.rows"
            :key="person.person_id"
          >
            <router-link :to="`/clients/${person.person_id}`" class="biz__row">
              <span class="biz__row-text">
                <span class="biz__row-main">{{ person.person_name }}</span>
                <span class="biz__row-sub">
                  <template v-if="person.phone"
                    ><bdi>{{ person.phone }}</bdi> ·
                  </template>
                  <template v-if="person.open_deals"
                    >صفقات مفتوحة {{ person.open_deals }}</template
                  ><template v-if="person.open_deals && person.open_requests">
                    · </template
                  ><template v-if="person.open_requests"
                    >طلبات مفتوحة {{ person.open_requests }}</template
                  >
                </span>
              </span>
              <!-- بلا لون: اللوح كله عمّن ينتظر تواصلاً، فتلوين كل سطر لا يضيف شيئاً. -->
              <span class="biz__row-meta">
                <template v-if="person.last_contact">
                  <small>آخر تواصل</small>
                  <bdi dir="rtl">{{
                    formatShortDate(person.last_contact)
                  }}</bdi>
                </template>
                <small v-else>لم يُتواصل معه</small>
              </span>
            </router-link>
          </li>
        </ul>
      </section>
    </div>

    <!-- العقود والمال -->
    <div v-if="leases || deals || money" class="biz__stack">
      <section
        v-if="leases"
        class="dal-panel biz__panel"
        aria-labelledby="biz-leases"
      >
        <header class="dal-panel__header biz__head">
          <h2 id="biz-leases" class="dal-section-title">الإيجارات السارية</h2>
          <router-link to="/leases" class="biz__all">كل الإيجارات</router-link>
        </header>
        <div class="biz__figures">
          <router-link
            to="/leases?view=overdue"
            class="biz__figure"
            :class="
              leases.overdue.total ? 'biz__figure--bad' : 'biz__figure--zero'
            "
            ><strong>{{ formatNumber(leases.overdue.total, 0) }}</strong
            ><span>أقساط متأخرة</span></router-link
          >
          <router-link
            :to="
              reports
                ? `/reports?report=leases&days=${leases.expiring_days}`
                : '/leases'
            "
            class="biz__figure"
            :class="
              leases.expiring.total ? 'biz__figure--warn' : 'biz__figure--zero'
            "
            ><strong>{{ formatNumber(leases.expiring.total, 0) }}</strong
            ><span
              >تنتهي خلال {{ leases.expiring_days }} يوماً</span
            ></router-link
          >
        </div>
        <p v-if="leases.overdue.by_currency.length" class="biz__note">
          <span>متأخر على المستأجرين</span>
          <bdi
            v-for="row in leases.overdue.by_currency"
            :key="row.currency"
            class="biz__note-amount"
            >{{ formatAmount(row.left, row.currency) }}</bdi
          >
        </p>
        <template v-if="leases.overdue.items.length">
          <p class="biz__caption">أقساط متأخرة</p>
          <ul class="biz__rows">
            <li v-for="item in leases.overdue.items" :key="`i${item.id}`">
              <router-link :to="`/leases/${item.lease_id}`" class="biz__row">
                <span class="biz__row-text">
                  <span class="biz__row-main"
                    ><bdi>{{ item.lease_code }}</bdi> ·
                    {{ item.tenant_name ?? "" }}</span
                  >
                  <span class="biz__row-sub"
                    >القسط {{ item.seq }} · متأخر
                    {{ item.days_overdue }} يوماً</span
                  >
                </span>
                <span class="biz__row-meta biz__row-meta--bad">
                  <bdi>{{ formatAmount(item.left, item.currency) }}</bdi>
                </span>
              </router-link>
            </li>
          </ul>
        </template>
        <template v-if="leases.expiring.items.length">
          <p class="biz__caption">تنتهي قريباً</p>
          <ul class="biz__rows">
            <li v-for="item in leases.expiring.items" :key="`e${item.id}`">
              <router-link :to="`/leases/${item.id}`" class="biz__row">
                <span class="biz__row-text">
                  <span class="biz__row-main"
                    ><bdi>{{ item.code }}</bdi> ·
                    {{ item.tenant_name ?? "" }}</span
                  >
                  <span class="biz__row-sub"
                    >ينتهي
                    <bdi dir="rtl">{{
                      formatShortDate(item.end_date)
                    }}</bdi></span
                  >
                </span>
                <span class="biz__row-meta biz__row-meta--warn"
                  >بعد {{ item.days_left }} يوماً</span
                >
              </router-link>
            </li>
          </ul>
        </template>
        <p
          v-if="!leases.overdue.items.length && !leases.expiring.items.length"
          class="biz__empty"
        >
          <v-icon
            icon="mdi-check-circle-outline"
            size="16"
            color="success"
            aria-hidden="true"
          />
          لا أقساط متأخرة ولا إيجار ينتهي قريباً.
        </p>
      </section>

      <section
        v-if="deals"
        class="dal-panel biz__panel"
        aria-labelledby="biz-deals"
      >
        <header class="dal-panel__header biz__head">
          <h2 id="biz-deals" class="dal-section-title">الصفقات</h2>
          <router-link to="/deals" class="biz__all">كل الصفقات</router-link>
        </header>
        <div class="biz__figures">
          <router-link
            to="/deals"
            class="biz__figure"
            :class="{ 'biz__figure--zero': !deals.negotiating.total }"
            ><strong>{{ formatNumber(deals.negotiating.total, 0) }}</strong
            ><span>قيد التفاوض</span></router-link
          >
          <router-link
            to="/deals?stalled=1"
            class="biz__figure"
            :class="
              deals.stalled.total ? 'biz__figure--warn' : 'biz__figure--zero'
            "
            ><strong>{{ formatNumber(deals.stalled.total, 0) }}</strong
            ><span>راكدة منذ {{ deals.stalled_days }} يوماً</span></router-link
          >
          <router-link
            :to="reports ? '/reports?report=deals' : '/deals'"
            class="biz__figure"
            :class="
              deals.recently_won.total
                ? 'biz__figure--good'
                : 'biz__figure--zero'
            "
            ><strong>{{ formatNumber(deals.recently_won.total, 0) }}</strong
            ><span>رُبحت خلال {{ deals.recent_days }} يوماً</span></router-link
          >
        </div>
        <p v-if="!dealRows.length" class="biz__empty">
          <v-icon
            icon="mdi-check-circle-outline"
            size="16"
            color="success"
            aria-hidden="true"
          />
          لا صفقات قيد التفاوض ولا راكدة.
        </p>
        <template v-else>
          <p class="biz__caption">
            {{
              showingStalled
                ? "الراكدة، الأقدم أولاً"
                : "قيد التفاوض، الأحدث أولاً"
            }}
          </p>
          <ul class="biz__rows">
            <li v-for="deal in dealRows" :key="deal.id">
              <router-link :to="`/deals/${deal.id}`" class="biz__row">
                <span class="biz__row-text">
                  <span class="biz__row-main"
                    ><bdi>{{ deal.code }}</bdi> ·
                    {{ deal.title ?? deal.client_name ?? "" }}</span
                  >
                  <span class="biz__row-sub"
                    >{{ dealStageLabel(deal.stage) }}
                    <template v-if="deal.user_name">
                      · {{ deal.user_name }}</template
                    >
                  </span>
                </span>
                <span
                  class="biz__row-meta"
                  :class="{ 'biz__row-meta--warn': showingStalled }"
                >
                  <small>في المرحلة</small>
                  <span>{{
                    pluralizeDays(daysSince(deal.stage_changed_at))
                  }}</span>
                </span>
              </router-link>
            </li>
          </ul>
        </template>
      </section>

      <section
        v-if="money"
        class="dal-panel biz__panel"
        aria-labelledby="biz-money"
      >
        <header class="dal-panel__header biz__head">
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
                :to="`/reports?report=commissions&from=${money.from}&to=${money.to}`"
                >عمولات مقبوضة</router-link
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
                to="/accounting?state=open"
                >عمولات متبقية ({{ row.commissions_open }})</router-link
              >
              <template v-else
                >عمولات متبقية ({{ row.commissions_open }})</template
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
            <dt><router-link :to="monthLink">المصروفات</router-link></dt>
            <dd>
              <bdi>{{ formatAmount(row.expenses, row.currency) }}</bdi>
            </dd>
          </div>
          <div>
            <dt><router-link :to="monthLink">صافي الربح</router-link></dt>
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
      </section>
    </div>
  </section>
</template>

<style scoped>
/* عمودان يقرّرهما عرض العمود الرئيسي نفسه: ينزلان إلى عمود واحد حين لا يتّسع
   كلاهما لـ 20rem، وعمود واحد ظاهر (صلاحيات ناقصة) يأخذ العرض كله. */
.biz {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: var(--dal-gutter);
  align-items: start;
}
.biz__wide {
  grid-column: 1 / -1;
}
.biz__stack {
  display: grid;
  gap: var(--dal-gutter);
  align-content: start;
  min-width: 0;
}
.biz__panel {
  min-width: 0;
}
.biz__bone {
  background: transparent;
}
.biz__head {
  justify-content: space-between;
}
.biz__all {
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  white-space: nowrap;
  color: rgb(var(--v-theme-primary-text));
  text-decoration: none;
}
.biz__all:hover {
  text-decoration: underline;
}

/* أرقام اللوح: شريط خلايا بفواصل رفيعة مثل شريط الملخّص، الرقم فوق وسمه. */
.biz__figures {
  display: flex;
  border-bottom: 1px solid var(--dal-stroke);
}
.biz__figure {
  flex: 1 1 0;
  display: grid;
  align-content: start;
  min-width: 0;
  padding: 8px 12px;
  border-inline-start: 1px solid var(--dal-stroke);
  color: inherit;
  text-decoration: none;
  transition: background-color 150ms ease;
}
.biz__figure:first-child {
  border-inline-start: 0;
}
.biz__figure--wide {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 10px;
}
.biz__figure:hover {
  background: var(--dal-hover);
}
.biz__figure:focus-visible,
.biz__row:focus-visible {
  outline-offset: -2px;
}
.biz__figure strong {
  font-size: calc(18px * var(--dal-font-scale));
  font-weight: 700;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.biz__figure span {
  font-size: calc(12px * var(--dal-font-scale));
  line-height: 1.4;
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
.biz__figure--zero strong {
  color: var(--dal-muted);
}

/* سطور دفترية: النص في البداية وقيمة واحدة في الطرف، بفواصل رفيعة. */
.biz__rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.biz__rows li + li {
  border-top: 1px solid var(--dal-stroke);
}
.biz__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 12px;
  min-height: 44px;
  padding: 6px 12px;
  color: inherit;
  text-decoration: none;
  transition: background-color 150ms ease;
}
.biz__row:hover {
  background: var(--dal-hover);
}
.biz__row-text {
  display: grid;
  min-width: 0;
}
.biz__row-main,
.biz__row-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.biz__row-main {
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.5;
}
.biz__row-sub {
  font-size: calc(12px * var(--dal-font-scale));
  line-height: 1.45;
  color: var(--dal-muted);
}
.biz__tag {
  margin-inline-start: 6px;
  vertical-align: 1px;
}
.biz__row-meta {
  display: grid;
  justify-items: end;
  text-align: end;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.biz__row-meta small {
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 400;
  color: var(--dal-muted);
}
.biz__row-meta--bad {
  color: rgb(var(--v-theme-error));
}
.biz__row-meta--warn {
  color: rgb(var(--v-theme-warning));
}
.biz__caption {
  margin: 0;
  padding: 8px 12px 2px;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  color: var(--dal-muted);
}
.biz__caption + .biz__rows {
  border-bottom: 1px solid var(--dal-stroke);
}
.biz__caption + .biz__rows:last-child {
  border-bottom: 0;
}
.biz__note {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dal-stroke);
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.biz__note-amount {
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 700;
  color: rgb(var(--v-theme-error));
}
.biz__empty {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 12px;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}

/* مال الشهر: شبكة دفترية 2×2، الوسم فوق القيمة. */
.biz__money {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}
.biz__money + .biz__money {
  border-top: 1px solid var(--dal-stroke);
}
.biz__money > div {
  min-width: 0;
  padding: 8px 12px;
}
.biz__money > div:nth-of-type(even) {
  border-inline-start: 1px solid var(--dal-stroke);
}
.biz__money > div:nth-of-type(n + 3) {
  border-top: 1px solid var(--dal-stroke);
}
.biz__currency {
  grid-column: 1 / -1;
  margin: 0;
  padding: 8px 12px 0;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 700;
}
.biz__money dt {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.biz__money dt a {
  color: inherit;
  text-decoration: none;
}
.biz__money dt a:hover {
  color: rgb(var(--v-theme-primary-text));
  text-decoration: underline;
}
.biz__money dd {
  margin: 0;
  font-size: calc(15px * var(--dal-font-scale));
  font-weight: 700;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}
</style>
