<script setup lang="ts">
import { computed } from "vue";
import type {
  DashboardAppointment,
  DashboardMatching,
  DashboardOverview,
  DashboardRequest,
  DashboardStaleListing,
} from "../../types";
import {
  budgetText,
  locationText,
  priceText,
  propertyTypeText,
} from "../../utils/listingText";
import {
  daysSince,
  formatNumber,
  formatShortDate,
  pluralizeDays,
} from "../../utils/format";
import { followupTypeLabel } from "../../constants/crm";

/**
 * فرص قد تضيع، كل فئة بتعريفها المكتوب وأمثلة منها: طلبات بلا عرض مطابق،
 * عروض متاحة بلا نشاط مسجّل، ومعاينات مضى موعدها بلا متابعة لاحقة.
 */
const props = defineProps<{
  matching: DashboardMatching | null;
  overview: DashboardOverview | null;
  staleOptions: readonly number[];
}>();
const staleDays = defineModel<number>("staleDays", { required: true });
const emit = defineEmits<{
  request: [DashboardRequest];
  listing: [{ kind: "sale" | "rental"; id: number }];
  /** «عرض الكل»: القائمة الكاملة التي تحوي هذه الفئة. */
  all: [{ section: "unmatched" | "stale"; kind: "sale" | "rental" }];
}>();

const EXAMPLES = 3;
const stale = computed(() => {
  const sale = props.overview?.stale_listings.sale;
  const rental = props.overview?.stale_listings.rental;
  if (!sale && !rental) return null;
  const items: DashboardStaleListing[] = [
    ...(sale?.items ?? []),
    ...(rental?.items ?? []),
  ]
    .sort(
      (a, b) =>
        new Date(a.last_followup_at ?? a.updated_at).getTime() -
        new Date(b.last_followup_at ?? b.updated_at).getTime(),
    )
    .slice(0, EXAMPLES);
  return { total: (sale?.total ?? 0) + (rental?.total ?? 0), items };
});
const viewings = computed(
  () => props.overview?.viewings_without_outcome ?? null,
);
function lastActivity(item: DashboardStaleListing) {
  const last =
    item.last_followup_at && item.last_followup_at > item.updated_at
      ? item.last_followup_at
      : item.updated_at;
  return pluralizeDays(daysSince(last));
}
function openViewing(item: DashboardAppointment) {
  emit("listing", { kind: item.kind, id: item.listing_id });
}
</script>

<template>
  <section class="dal-panel risks" aria-labelledby="risks-title">
    <header class="dal-panel__header">
      <h2 id="risks-title" class="dal-section-title">فرص معرّضة للضياع</h2>
    </header>

    <div v-if="!matching && !overview">
      <v-skeleton-loader v-for="n in 3" :key="n" type="list-item-two-line" />
    </div>

    <template v-else>
      <section v-if="matching?.kinds.length" id="risk-unmatched" class="risk">
        <div class="risk__head">
          <strong
            class="risk__count"
            :class="{ 'risk__count--zero': !matching.unmatched.total }"
            >{{ formatNumber(matching.unmatched.total, 0) }}</strong
          >
          <div>
            <div class="risk__title">طلبات بلا عرض مطابق</div>
            <div class="risk__text">
              طلبات مفتوحة لا يحقق أي عرض متاح شروطها الأساسية. ابحث عن عرض جديد
              أو راجع الشروط مع الزبون.
            </div>
          </div>
        </div>
        <button
          v-for="request in matching.unmatched.items.slice(0, EXAMPLES)"
          :key="`${request.kind}-${request.id}`"
          type="button"
          class="risk__row"
          @click="emit('request', request)"
        >
          <span class="risk__row-main">
            {{ request.person_name }} ·
            {{ request.kind === "sale" ? "شراء" : "إيجار" }}
            {{ propertyTypeText(request.kind, request.property_type) }}
          </span>
          <span class="risk__row-sub">
            {{
              [
                locationText(
                  request.governorate,
                  request.district,
                  request.neighborhood,
                ),
                budgetText(request.budget_min, request.budget_max),
              ]
                .filter(Boolean)
                .join(" · ") || "بلا شروط موقع أو ميزانية"
            }}
            · مفتوح {{ pluralizeDays(daysSince(request.created_at)) }}
          </span>
        </button>
        <div v-if="matching.unmatched.total > EXAMPLES" class="risk__all">
          <span>تظهر {{ EXAMPLES }} من {{ matching.unmatched.total }}.</span>
          <v-btn
            v-for="kind in matching.kinds"
            :key="kind"
            size="small"
            variant="text"
            @click="emit('all', { section: 'unmatched', kind })"
            >كل طلبات
            {{ kind === "sale" ? "الشراء" : "الإيجار" }} المفتوحة</v-btn
          >
        </div>
      </section>

      <section v-if="stale" id="risk-stale" class="risk">
        <div class="risk__head">
          <strong
            class="risk__count"
            :class="{ 'risk__count--zero': !stale.total }"
            >{{ formatNumber(stale.total, 0) }}</strong
          >
          <div class="risk__head-copy">
            <div class="risk__title">
              عروض بلا نشاط منذ
              <v-select
                v-model="staleDays"
                :items="
                  staleOptions.map((days) => ({
                    title: `${days} يوماً`,
                    value: days,
                  }))
                "
                density="compact"
                variant="plain"
                hide-details
                class="risk__days"
                aria-label="مدة الركود"
              />
            </div>
            <div class="risk__text">
              عروض متاحة لم تُعدَّل ولم تُسجَّل عليها متابعة خلال المدة. حدّث
              السعر أو تواصل مع المالك.
            </div>
          </div>
        </div>
        <button
          v-for="item in stale.items"
          :key="`${item.kind}-${item.id}`"
          type="button"
          class="risk__row"
          @click="emit('listing', { kind: item.kind, id: item.id })"
        >
          <span class="risk__row-main">
            <bdi>{{ item.code }}</bdi> · {{ item.name }}
          </span>
          <span class="risk__row-sub">
            {{ propertyTypeText(item.kind, item.property_type) }} ·
            {{ priceText(item.kind, item.price, item.rent_period) }} · آخر نشاط
            {{ lastActivity(item) }}
          </span>
        </button>
        <div v-if="stale.total > EXAMPLES" class="risk__all">
          <span
            >تظهر {{ EXAMPLES }} من {{ stale.total }}. القائمة الكاملة مرتّبة
            بأقدم تعديل، وهو تقريب: لا تُحسب فيه المتابعات.</span
          >
          <v-btn
            v-if="overview?.stale_listings.sale?.total"
            size="small"
            variant="text"
            @click="emit('all', { section: 'stale', kind: 'sale' })"
            >عروض البيع المتاحة</v-btn
          >
          <v-btn
            v-if="overview?.stale_listings.rental?.total"
            size="small"
            variant="text"
            @click="emit('all', { section: 'stale', kind: 'rental' })"
            >عروض الإيجار المتاحة</v-btn
          >
        </div>
      </section>

      <section v-if="viewings" id="risk-viewings" class="risk">
        <div class="risk__head">
          <strong
            class="risk__count"
            :class="{ 'risk__count--zero': !viewings.total }"
            >{{ formatNumber(viewings.total, 0) }}</strong
          >
          <div>
            <div class="risk__title">معاينات بلا متابعة لاحقة</div>
            <div class="risk__text">
              معاينات مضى موعدها خلال آخر {{ viewings.days }} يوماً ولم يُسجَّل
              بعدها شيء على العرض. سجّل رأي الزبون.
            </div>
          </div>
        </div>
        <button
          v-for="item in viewings.items.slice(0, EXAMPLES)"
          :key="`${item.kind}-${item.id}`"
          type="button"
          class="risk__row"
          @click="openViewing(item)"
        >
          <span class="risk__row-main">
            <bdi>{{ item.listing_code }}</bdi> · {{ item.listing_name }}
          </span>
          <span class="risk__row-sub">
            {{ followupTypeLabel(item.type) }}
            {{ formatShortDate(item.scheduled_at) }}
            <template v-if="item.user_name"> · {{ item.user_name }}</template>
          </span>
        </button>
      </section>
    </template>
  </section>
</template>

<style scoped>
.risks {
  min-width: 0;
}
.risk__all {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  padding: 4px 0 0;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.risk {
  padding: 10px 14px;
  border-bottom: 1px solid var(--dal-stroke);
}
.risk:last-child {
  border-bottom: 0;
}
.risk__head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 4px;
}
.risk__head-copy {
  min-width: 0;
  flex: 1;
}
.risk__count {
  min-width: 36px;
  font-size: calc(20px * var(--dal-font-scale));
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--v-theme-warning));
}
.risk__count--zero {
  color: var(--dal-muted);
}
.risk__title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
}
.risk__days {
  flex: 0 0 auto;
  max-width: 110px;
}
.risk__days :deep(.v-field__input) {
  padding-top: 0;
  padding-bottom: 0;
  min-height: 24px;
  font-weight: 600;
  color: rgb(var(--v-theme-primary-text));
}
.risk__text {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.risk__row {
  display: grid;
  width: 100%;
  gap: 1px;
  padding: 6px 8px;
  margin-inline-start: 40px;
  max-width: calc(100% - 40px);
  text-align: start;
  border-radius: var(--dal-radius-control);
}
.risk__row:hover {
  background: var(--dal-hover);
}
.risk__row-main {
  font-size: calc(12px * var(--dal-font-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.risk__row-sub {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
