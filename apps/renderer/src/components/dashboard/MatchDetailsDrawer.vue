<script setup lang="ts">
import { computed } from "vue";
import SideSheet from "../shared/SideSheet.vue";
import RequestMatchesList from "./RequestMatchesList.vue";
import type { DashboardMatch, OperationsKind } from "../../types";
import { RENT_PERIOD_LABELS } from "../../constants/domain";
import {
  areaRangeText,
  budgetText,
  countsText,
  locationText,
  offerCountsText,
  priceText,
  propertyTypeText,
} from "../../utils/listingText";
import { daysSince, formatNumber, pluralizeDays } from "../../utils/format";

/** تفاصيل مطابقة: الطلب والعرض جنباً إلى جنب، كل شرط وما تحقق منه، وبقية العروض. */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  match: DashboardMatch | null;
  canFollowup: boolean;
  canOpenPerson: boolean;
}>();
const emit = defineEmits<{
  customer: [number];
  listing: [{ kind: OperationsKind; id: number }];
  request: [{ kind: OperationsKind; id: number }];
  followup: [DashboardMatch];
}>();

const request = computed(() => props.match?.request ?? null);
const offer = computed(() => props.match?.offer ?? null);
const requirements = computed(() => {
  const r = request.value;
  if (!r) return [];
  return [
    { label: "النوع", value: propertyTypeText(r.kind, r.property_type) },
    r.rent_period
      ? {
          label: "نوع الإيجار",
          value: RENT_PERIOD_LABELS[r.rent_period] ?? r.rent_period,
        }
      : null,
    {
      label: "الموقع",
      value:
        locationText(r.governorate, r.district, r.neighborhood) || "أي موقع",
    },
    {
      label: "الميزانية",
      value: budgetText(r.budget_min, r.budget_max) ?? "غير محددة",
    },
    {
      label: "المساحة",
      value: areaRangeText(r.area_min, r.area_max, r.area_unit) ?? "غير محددة",
    },
    { label: "الأعداد", value: countsText(r) || "غير محددة" },
    r.other_requirements
      ? { label: "متطلبات أخرى", value: r.other_requirements }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
});
const listing = computed(() => {
  const o = offer.value;
  if (!o) return [];
  return [
    { label: "النوع", value: propertyTypeText(o.kind, o.property_type) },
    {
      label: "السعر",
      value:
        priceText(o.kind, o.price, o.rent_period) +
        (o.is_negotiable ? " · قابل للتفاوض" : ""),
    },
    {
      label: "الموقع",
      value:
        locationText(o.governorate, o.district, o.neighborhood) || "غير مسجّل",
    },
    { label: "المساحة", value: `${formatNumber(o.area_value)} ${o.area_unit}` },
    { label: "الأعداد", value: offerCountsText(o) || "غير مسجّلة" },
  ];
});
</script>

<template>
  <SideSheet
    v-model="open"
    :title="
      match ? `مطابقة ${match.request.code} ← ${match.offer.code}` : 'المطابقة'
    "
    :subtitle="
      match ? `${match.request.person_name} · ${match.offer.name}` : undefined
    "
    :width="480"
  >
    <template v-if="match && request && offer">
      <section class="details-block">
        <h3>الطلب</h3>
        <dl class="details-grid">
          <div v-for="item in requirements" :key="item.label">
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </div>
        </dl>
        <p class="details-muted">
          آخر تحديث للطلب {{ pluralizeDays(daysSince(request.updated_at)) }}. لا
          يسجّل النظام تاريخ آخر تواصل مع الزبون.
        </p>
      </section>
      <section class="details-block">
        <h3>العرض</h3>
        <dl class="details-grid">
          <div v-for="item in listing" :key="item.label">
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </div>
        </dl>
      </section>
      <section class="details-block">
        <h3>سبب المطابقة</h3>
        <table class="details-reasons">
          <tbody>
            <tr v-for="reason in match.match.reasons" :key="reason.field">
              <td>
                <v-icon
                  :icon="
                    reason.matched
                      ? 'mdi-check-circle'
                      : 'mdi-close-circle-outline'
                  "
                  :color="reason.matched ? 'success' : undefined"
                  size="16"
                />
              </td>
              <td>{{ reason.label }}</td>
              <td>{{ reason.detail }}</td>
              <td class="details-kind">
                {{ reason.required ? "أساسي" : "تفضيل" }}
              </td>
            </tr>
          </tbody>
        </table>
        <p class="details-muted">
          الشروط الأساسية تقرّر المطابقة، والتفضيلات ترتّب العروض فقط. لا نسبة
          مئوية: التفضيلات المتحققة {{ match.match.preferences_met }} من
          {{ match.match.preferences_total }}.
        </p>
      </section>
      <section class="details-block">
        <h3>كل العروض لهذا الطلب</h3>
        <RequestMatchesList
          :kind="request.kind"
          :request-id="request.id"
          @open="emit('listing', $event)"
        />
      </section>
    </template>
    <template #actions>
      <template v-if="match">
        <v-btn
          v-if="canFollowup"
          color="primary"
          variant="flat"
          prepend-icon="mdi-phone-plus-outline"
          @click="emit('followup', match)"
          >تسجيل متابعة</v-btn
        >
        <v-btn
          variant="tonal"
          @click="
            emit('listing', { kind: match.offer.kind, id: match.offer.id })
          "
          >فتح العرض</v-btn
        >
        <v-btn
          v-if="canOpenPerson"
          variant="text"
          @click="emit('customer', match.request.person_id)"
          >ملف الزبون</v-btn
        >
        <v-btn
          variant="text"
          @click="
            emit('request', { kind: match.request.kind, id: match.request.id })
          "
          >فتح الطلب</v-btn
        >
      </template>
    </template>
  </SideSheet>
</template>

<style scoped>
.details-block + .details-block {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--dal-stroke);
}
.details-block h3 {
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 700;
  margin: 0 0 6px;
}
.details-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  margin: 0;
}
.details-grid dt {
  font-size: calc(11px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.details-grid dd {
  margin: 0;
  font-size: calc(12.5px * var(--dal-font-scale));
  overflow-wrap: anywhere;
}
.details-muted {
  margin: 6px 0 0;
  font-size: calc(11px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.details-reasons {
  width: 100%;
  border-collapse: collapse;
  font-size: calc(12px * var(--dal-font-scale));
}
.details-reasons td {
  padding: 4px 4px;
  border-bottom: 1px solid var(--dal-stroke);
  vertical-align: top;
}
.details-kind {
  color: var(--dal-muted);
  white-space: nowrap;
}
</style>
