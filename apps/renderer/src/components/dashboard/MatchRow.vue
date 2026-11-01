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
// مقياس التفضيلات يرسم العددين المرسلين نفسيهما (المتحقق من المجموع)، لا نسبة.
const prefSlots = computed(() =>
  Math.min(props.item.match.preferences_total, 8),
);
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
      <span
        v-if="others > 0"
        class="match__more"
        :title="`و${formatNumber(others, 0)} عروض أخرى مطابقة في التفاصيل`"
        >+{{ formatNumber(others, 0) }}</span
      >
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
        <strong class="match__price">{{
          priceText(offer.kind, offer.price, offer.rent_period)
        }}</strong>
        · {{ propertyTypeText(offer.kind, offer.property_type) }}
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

    <!-- الدليل ثم الأوامر: الشروط الأساسية سطر هادئ واحد (كلها متحققة في كل
         صف هنا)، والتفضيلات وحدها تفرّق بين صف وآخر فتأخذ المقياس والعلامات. -->
    <div class="match__why">
      <span class="match__verdict">
        <v-icon
          icon="mdi-check-decagram-outline"
          size="16"
          color="success"
          aria-hidden="true"
        />
        <span>الشروط الأساسية متحققة:</span>
        <span class="match__required">
          <span
            v-for="(reason, index) in required"
            :key="reason.field"
            :title="reason.detail"
            >{{ reason.label
            }}{{ index < required.length - 1 ? "، " : "" }}</span
          >
        </span>
      </span>
      <template v-if="preferences.length">
        <span class="match__divider" aria-hidden="true" />
        <span class="match__prefs">
          <span class="match__meter" aria-hidden="true">
            <i
              v-for="n in prefSlots"
              :key="n"
              :class="{ 'match__meter-on': n <= item.match.preferences_met }"
            />
          </span>
          التفضيلات {{ item.match.preferences_met }} من
          {{ item.match.preferences_total }}
        </span>
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
            aria-hidden="true"
          />
          {{ reason.label }}
        </span>
      </template>
      <span class="match__actions">
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
      </span>
    </div>
  </article>
</template>

<style scoped>
.match {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px minmax(0, 1fr);
  gap: 4px 12px;
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--dal-stroke);
  transition: background-color 150ms ease;
}
.match:last-child {
  border-bottom: 0;
}
/* تتبّع الصف تحت المؤشر في قائمة طويلة؛ الصف نفسه ليس زراً فالتظليل خفيف. */
.match:hover {
  background: rgba(var(--v-theme-on-surface), 0.025);
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
  min-height: 20px;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.match__title {
  font-size: calc(15px * var(--dal-font-scale));
  font-weight: 700;
  line-height: 1.5;
  text-align: start;
  color: rgb(var(--v-theme-primary-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  border-radius: var(--dal-radius-control);
}
.match__title:hover {
  text-decoration: underline;
}
.match__line {
  font-size: calc(13px * var(--dal-font-scale));
  line-height: 1.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.match__line--muted {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.match__price {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.match__link {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 4px;
  color: rgb(var(--v-theme-primary-text));
  font-size: calc(12px * var(--dal-font-scale));
  font-variant-numeric: tabular-nums;
}
.match__link::before,
.match__link::after {
  content: "";
  width: 1px;
  height: 18px;
  background: var(--dal-stroke);
}
.match__more {
  padding: 0 6px;
  border-radius: 9999px;
  background: var(--dal-hover);
  color: var(--dal-muted);
  font-weight: 600;
  line-height: 18px;
}
.match__why {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--dal-stroke);
}
.match__verdict {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  color: rgb(var(--v-theme-success));
}
.match__required {
  font-weight: 400;
  color: rgb(var(--v-theme-on-surface));
}
.match__prefs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  color: var(--dal-muted);
  font-variant-numeric: tabular-nums;
}
/* مقطع لكل تفضيل؛ المتحقق بلون التطابق والناقص خط فارغ. */
.match__meter {
  display: inline-flex;
  gap: 2px;
}
.match__meter i {
  width: 10px;
  height: 4px;
  background: var(--dal-stroke);
}
.match__meter i.match__meter-on {
  background: rgb(var(--v-theme-success));
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
  border-radius: var(--dal-radius-control);
  font-size: calc(12px * var(--dal-font-scale));
  line-height: 20px;
  border: 1px solid var(--dal-stroke);
}
.reason--met .v-icon {
  color: rgb(var(--v-theme-success));
}
.reason--missed {
  color: var(--dal-muted);
  border-style: dashed;
  text-decoration: line-through;
  text-decoration-color: rgba(var(--v-theme-on-surface), 0.3);
}
.match__actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-inline-start: auto;
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
