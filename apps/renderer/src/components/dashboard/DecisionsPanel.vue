<script setup lang="ts">
import EmptyState from "../shared/EmptyState.vue";
import type {
  DashboardAppointment,
  DashboardCustomer,
  DashboardMatching,
  DashboardOverview,
} from "../../types";
import { followupTypeIcon, followupTypeLabel } from "../../constants/crm";
import {
  daysSince,
  formatNumber,
  formatShortDate,
  formatTime,
  pluralizeDays,
} from "../../utils/format";
import { propertyTypeText } from "../../utils/listingText";

/**
 * من يحتاج قراراً الآن: الزبائن ذوو الطلبات المفتوحة (من لديه عروض مطابقة
 * أولاً، ثم من ينتظر أطول)، ومواعيد المتابعة القادمة. التبويب يملكه الأب
 * لأن المؤشرات والأولوية تفتحه.
 */
defineProps<{
  matching: DashboardMatching | null;
  overview: DashboardOverview | null;
}>();
const tab = defineModel<"customers" | "appointments">("tab", {
  required: true,
});
const emit = defineEmits<{
  customer: [DashboardCustomer];
  appointment: [DashboardAppointment];
}>();

function pendingAction(customer: DashboardCustomer) {
  return customer.requests_with_matches
    ? "تواصل لعرض الخيارات المطابقة"
    : "لا عرض مطابق: راجع الشروط أو ابحث عن عرض";
}
function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}
</script>

<template>
  <section class="dal-panel decisions" aria-label="الزبائن والمواعيد">
    <v-tabs
      v-model="tab"
      density="compact"
      color="primary"
      grow
      class="dal-panel__tabs"
    >
      <v-tab value="customers">
        زبائن بانتظار قرار
        <span v-if="matching?.customers.total" class="dal-count ms-2">{{
          formatNumber(matching.customers.total, 0)
        }}</span>
      </v-tab>
      <v-tab v-if="overview?.appointments !== null" value="appointments">
        المواعيد
        <v-chip
          v-if="overview?.appointments?.today"
          size="x-small"
          color="error"
          variant="tonal"
          label
          class="ms-2"
          >اليوم {{ overview.appointments.today }}</v-chip
        >
      </v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item value="customers">
        <div v-if="!matching">
          <v-skeleton-loader
            v-for="n in 4"
            :key="n"
            type="list-item-two-line"
          />
        </div>
        <EmptyState
          v-else-if="!matching.kinds.length"
          icon="mdi-lock-outline"
          title="الطلبات غير متاحة لحسابك"
        />
        <EmptyState
          v-else-if="!matching.customers.items.length"
          icon="mdi-account-check-outline"
          title="لا زبائن بطلبات مفتوحة"
          text="تظهر هنا طلبات الشراء والإيجار المفتوحة لزبائن نشطين."
        />
        <ul v-else class="decisions__list">
          <li
            v-for="customer in matching.customers.items"
            :key="customer.person_id"
          >
            <button
              type="button"
              class="decision"
              @click="emit('customer', customer)"
            >
              <span class="decision__body">
                <span class="decision__head">
                  <strong>{{ customer.person_name }}</strong>
                  <v-chip
                    v-if="customer.requests_with_matches"
                    size="x-small"
                    color="primary"
                    variant="tonal"
                    label
                    >مطابقات
                    {{ formatNumber(customer.total_matches, 0) }}</v-chip
                  >
                  <v-chip
                    v-else
                    size="x-small"
                    color="warning"
                    variant="tonal"
                    label
                    >بلا مطابقة</v-chip
                  >
                </span>
                <span class="decision__line">
                  {{
                    customer.requests
                      .slice(0, 2)
                      .map(
                        (request) =>
                          `${request.kind === "sale" ? "شراء" : "إيجار"} ${propertyTypeText(request.kind, request.property_type)}`,
                      )
                      .join("، ")
                  }}<template v-if="customer.requests.length > 2">
                    و{{ customer.requests.length - 2 }} غيرها</template
                  >
                </span>
                <span class="decision__line decision__line--muted">
                  {{ pendingAction(customer) }}
                </span>
              </span>
              <!-- كم انتظر: عمود في الطرف يُقرأ من أعلى إلى أسفل. -->
              <span class="decision__meta">
                <small>أقدم طلب</small>
                {{ pluralizeDays(daysSince(customer.oldest_request_at)) }}
              </span>
            </button>
          </li>
        </ul>
        <div
          v-if="
            matching &&
            matching.customers.total > matching.customers.items.length
          "
          class="decisions__more"
        >
          يظهر {{ matching.customers.items.length }} من
          {{ formatNumber(matching.customers.total, 0) }}؛ ابحث بالاسم أو الهاتف
          في مساحة المطابقة.
        </div>
      </v-window-item>

      <v-window-item value="appointments">
        <div v-if="!overview">
          <v-skeleton-loader
            v-for="n in 4"
            :key="n"
            type="list-item-two-line"
          />
        </div>
        <EmptyState
          v-else-if="!overview.appointments?.items.length"
          icon="mdi-calendar-check-outline"
          title="لا مواعيد خلال الأيام القادمة"
          text="يُضاف الموعد من متابعات العرض أو الإيجار."
        />
        <ul v-else class="decisions__list">
          <li
            v-for="item in overview.appointments.items"
            :key="`${item.kind}-${item.id}`"
          >
            <button
              type="button"
              class="decision"
              @click="emit('appointment', item)"
            >
              <span class="decision__body">
                <span class="decision__head">
                  <v-icon
                    :icon="followupTypeIcon(item.type)"
                    size="16"
                    class="text-medium-emphasis"
                    aria-hidden="true"
                  />
                  <strong>{{ followupTypeLabel(item.type) }}</strong>
                </span>
                <span class="decision__line">
                  {{ item.kind === "sale" ? "عرض" : "إيجار" }}
                  <bdi>{{ item.listing_code }}</bdi> · {{ item.listing_name }}
                </span>
                <span
                  v-if="item.notes"
                  class="decision__line decision__line--muted"
                  >{{ item.notes }}</span
                >
              </span>
              <span
                class="decision__meta"
                :class="{ 'decision__meta--today': isToday(item.scheduled_at) }"
              >
                <span>{{
                  isToday(item.scheduled_at)
                    ? "اليوم"
                    : formatShortDate(item.scheduled_at)
                }}</span>
                <small
                  ><bdi dir="rtl">{{
                    formatTime(item.scheduled_at)
                  }}</bdi></small
                >
              </span>
            </button>
          </li>
        </ul>
        <div v-if="overview?.appointments" class="decisions__more">
          خلال {{ overview.appointments.days }} أيام:
          {{ formatNumber(overview.appointments.next_days, 0) }}
        </div>
      </v-window-item>
    </v-window>
  </section>
</template>

<style scoped>
.decisions {
  min-width: 0;
}
.decisions__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 520px;
  overflow-y: auto;
}
.decisions__list li + li {
  border-top: 1px solid var(--dal-stroke);
}
.decision {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  column-gap: 12px;
  width: 100%;
  padding: 10px 12px;
  text-align: start;
  transition: background-color 150ms ease;
}
.decision:hover {
  background: var(--dal-hover);
}
.decision:focus-visible {
  outline-offset: -2px;
}
.decision__body {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.decision__head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: calc(13px * var(--dal-font-scale));
}
.decision__head strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.decision__meta {
  display: grid;
  justify-items: end;
  text-align: end;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.decision__meta small {
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 400;
  color: var(--dal-muted);
}
.decision__meta--today {
  color: rgb(var(--v-theme-error));
}
.decision__line {
  font-size: calc(12px * var(--dal-font-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.decision__line--muted {
  color: var(--dal-muted);
}
.decisions__more {
  padding: 8px 12px;
  border-top: 1px solid var(--dal-stroke);
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>
