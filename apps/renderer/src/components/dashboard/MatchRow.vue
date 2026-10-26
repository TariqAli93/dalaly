<script setup lang="ts">
import { computed } from "vue";
import type { DashboardMatch } from "../../types";
import {
  areaRangeText,
  budgetText,
  countsText,
  locationText,
  offerCountsText,
  priceText,
  propertyTypeText,
} from "../../utils/listingText";
import { formatNumber, pluralizeDays, daysSince } from "../../utils/format";
import { RENT_PERIOD_LABELS } from "../../constants/domain";

/**
 * مطابقة واحدة: طلب الزبون بجانب أفضل عرض متاح يحقق شروطه الأساسية، ثم
 * ما تحقق وما لم يتحقق. الطلب يظهر مرة واحدة مهما كثرت عروضه.
 */
const props = defineProps<{ item: DashboardMatch; canFollowup: boolean }>();
const emit = defineEmits<{
  details: [DashboardMatch];
  customer: [number];
  listing: [DashboardMatch["offer"]];
  followup: [DashboardMatch];
}>();

const request = computed(() => props.item.request);
const offer = computed(() => props.item.offer);
const wanted = computed(() =>
  [
    locationText(
      request.value.governorate,
      request.value.district,
      request.value.neighborhood,
    ) || "أي موقع",
    budgetText(request.value.budget_min, request.value.budget_max) ??
      "بلا ميزانية محددة",
    areaRangeText(
      request.value.area_min,
      request.value.area_max,
      request.value.area_unit,
    ),
    countsText(request.value),
  ].filter(Boolean),
);
const preferences = computed(() =>
  props.item.match.reasons.filter((reason) => !reason.required),
);
const required = computed(() =>
  props.item.match.reasons.filter((reason) => reason.required),
);
const others = computed(() => request.value.match_count - 1);
</script>

<template>
  <article class="match" :aria-label="`مطابقة طلب ${request.code}`">
    <div class="match__side">
      <div class="match__eyebrow">
        طلب {{ request.kind === "sale" ? "شراء" : "إيجار" }}
        <bdi>{{ request.code }}</bdi>
      </div>
      <button
        type="button"
        class="match__title"
        @click="emit('customer', request.person_id)"
      >
        {{ request.person_name }}
      </button>
      <div class="match__line">
        {{ propertyTypeText(request.kind, request.property_type) }}
        <template v-if="request.rent_period">
          · {{ RENT_PERIOD_LABELS[request.rent_period] ?? request.rent_period }}
        </template>
        <template v-if="request.person_phone">
          · <bdi dir="ltr">{{ request.person_phone }}</bdi>
        </template>
      </div>
      <div class="match__line match__line--muted">{{ wanted.join(" · ") }}</div>
      <div class="match__line match__line--muted">
        آخر تحديث للطلب {{ pluralizeDays(daysSince(request.updated_at)) }}
      </div>
    </div>

    <div class="match__link" aria-hidden="true">
      <v-icon icon="mdi-arrow-left" size="18" />
      <span v-if="others > 0">+{{ formatNumber(others, 0) }}</span>
    </div>

    <div class="match__side">
      <div class="match__eyebrow">
        عرض {{ offer.kind === "sale" ? "بيع" : "إيجار" }}
        <bdi>{{ offer.code }}</bdi>
        <v-chip size="x-small" color="primary" variant="tonal" label
          >متاح</v-chip
        >
      </div>
      <button
        type="button"
        class="match__title"
        @click="emit('listing', offer)"
      >
        {{ offer.name }}
      </button>
      <div class="match__line">
        {{ propertyTypeText(offer.kind, offer.property_type) }} ·
        <strong>{{
          priceText(offer.kind, offer.price, offer.rent_period)
        }}</strong>
        <template v-if="offer.is_negotiable"> · قابل للتفاوض</template>
      </div>
      <div class="match__line match__line--muted">
        {{
          [
            locationText(offer.governorate, offer.district, offer.neighborhood),
            `${formatNumber(offer.area_value)} ${offer.area_unit}`,
            offerCountsText(offer),
          ]
            .filter(Boolean)
            .join(" · ")
        }}
      </div>
    </div>

    <div class="match__why">
      <span class="match__verdict">
        <v-icon icon="mdi-check-decagram-outline" size="16" color="success" />
        الشروط الأساسية متحققة
      </span>
      <span
        v-for="reason in required"
        :key="reason.field"
        class="reason reason--required"
        >{{ reason.label }}</span
      >
      <template v-if="preferences.length">
        <span class="match__divider" />
        <span class="match__prefs"
          >التفضيلات {{ item.match.preferences_met }} من
          {{ item.match.preferences_total }}</span
        >
        <span
          v-for="reason in preferences"
          :key="reason.field"
          class="reason"
          :class="reason.matched ? 'reason--met' : 'reason--missed'"
          :title="reason.detail"
        >
          <v-icon
            :icon="reason.matched ? 'mdi-check' : 'mdi-close'"
            size="12"
          />
          {{ reason.label }}
        </span>
      </template>
      <v-spacer />
      <v-btn
        size="small"
        variant="text"
        prepend-icon="mdi-text-box-search-outline"
        @click="emit('details', item)"
        >التفاصيل</v-btn
      >
      <v-btn
        v-if="canFollowup"
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-phone-plus-outline"
        @click="emit('followup', item)"
        >تسجيل متابعة</v-btn
      >
    </div>
  </article>
</template>

<style scoped>
.match {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr);
  gap: 4px 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dal-stroke);
}
.match:last-child {
  border-bottom: 0;
}
.match__side {
  display: grid;
  gap: 2px;
  align-content: start;
  min-width: 0;
}
.match__eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.match__title {
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
  text-align: start;
  color: rgb(var(--v-theme-primary-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.match__title:hover {
  text-decoration: underline;
}
.match__line {
  font-size: calc(12px * var(--dal-font-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.match__line--muted {
  color: var(--dal-muted);
}
.match__link {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 2px;
  color: rgb(var(--v-theme-primary));
  font-size: calc(12px * var(--dal-font-scale));
  font-variant-numeric: tabular-nums;
}
.match__link::before {
  content: "";
  width: 1px;
  height: 14px;
  background: var(--dal-stroke);
}
.match__link::after {
  content: "";
  width: 1px;
  height: 14px;
  background: var(--dal-stroke);
}
.match__why {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  margin-top: 6px;
}
.match__verdict {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  color: rgb(var(--v-theme-success));
}
.match__prefs {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.match__divider {
  width: 1px;
  height: 14px;
  background: var(--dal-stroke);
  margin-inline: 2px;
}
.reason {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: calc(12px * var(--dal-font-scale));
  line-height: 20px;
  border: 1px solid var(--dal-stroke);
}
.reason--required {
  background: rgba(var(--v-theme-success), 0.1);
  border-color: transparent;
  color: rgb(var(--v-theme-success));
}
.reason--met {
  color: rgb(var(--v-theme-success));
}
.reason--missed {
  color: var(--dal-muted);
  text-decoration: line-through;
  text-decoration-color: rgba(var(--v-theme-on-surface), 0.3);
}
.money {
  font-variant-numeric: tabular-nums;
}
@container (max-width: 560px) {
  .match {
    grid-template-columns: minmax(0, 1fr);
  }
  .match__link {
    display: none;
  }
}
</style>
