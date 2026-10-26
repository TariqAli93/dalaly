<script setup lang="ts">
import { ref, watch } from "vue";
import SideSheet from "../shared/SideSheet.vue";
import RequestMatchesList from "./RequestMatchesList.vue";
import { getPerson } from "../../services/people.service";
import { getErrorMessage } from "../../services/api.service";
import type {
  DashboardCustomer,
  OperationsKind,
  PersonRecord,
} from "../../types";
import { daysSince, formatNumber, pluralizeDays } from "../../utils/format";
import { propertyTypeText } from "../../utils/listingText";

/**
 * ملف الزبون في سياق اللوحة: الاتصال والملاحظات من سجله، وطلباته المفتوحة
 * وعروضها المطابقة. السجل يُطلب فقط لمن يملك people.read؛ غيره يرى ما
 * أرسلته اللوحة (الاسم والهاتف والطلبات).
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  customer: DashboardCustomer | null;
  canReadPerson: boolean;
}>();
const emit = defineEmits<{
  person: [number];
  listing: [{ kind: OperationsKind; id: number }];
  request: [{ kind: OperationsKind; id: number }];
}>();

const person = ref<PersonRecord | null>(null);
const error = ref<string | null>(null);
const expanded = ref<string | null>(null);
let generation = 0;

watch(
  () => [open.value, props.customer?.person_id] as const,
  async ([isOpen, personId]) => {
    if (!isOpen || !personId) return;
    const current = ++generation;
    person.value = null;
    error.value = null;
    expanded.value = props.customer?.requests[0]
      ? `${props.customer.requests[0].kind}-${props.customer.requests[0].id}`
      : null;
    if (!props.canReadPerson) return;
    try {
      const record = await getPerson(personId);
      if (current === generation) person.value = record;
    } catch (cause) {
      if (current === generation) error.value = getErrorMessage(cause);
    }
  },
  { immediate: true },
);
</script>

<template>
  <SideSheet
    v-model="open"
    :title="customer?.person_name ?? 'الزبون'"
    :subtitle="customer ? `زبون ${customer.person_code}` : undefined"
  >
    <template v-if="customer">
      <section class="customer-block">
        <dl class="customer-grid">
          <div>
            <dt>الهاتف</dt>
            <dd>
              <bdi dir="ltr">{{
                person?.phone_primary ?? customer.person_phone ?? "—"
              }}</bdi>
            </dd>
          </div>
          <div v-if="person?.phone_secondary">
            <dt>هاتف آخر</dt>
            <dd>
              <bdi dir="ltr">{{ person.phone_secondary }}</bdi>
            </dd>
          </div>
          <div>
            <dt>طلبات مفتوحة</dt>
            <dd>{{ formatNumber(customer.open_requests, 0) }}</dd>
          </div>
          <div>
            <dt>أقدم طلب مفتوح</dt>
            <dd>{{ pluralizeDays(daysSince(customer.oldest_request_at)) }}</dd>
          </div>
        </dl>
        <v-alert
          v-if="error"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-2"
        >
          {{ error }}
        </v-alert>
        <div v-if="person?.notes" class="customer-notes">
          <div class="customer-label">ملاحظات</div>
          <p>{{ person.notes }}</p>
        </div>
        <p class="customer-muted">
          لا يسجّل النظام سجلّ تواصل لكل زبون؛ المتابعات تُسجَّل على العروض.
        </p>
      </section>

      <section class="customer-block">
        <h3>الطلبات المفتوحة</h3>
        <div
          v-for="request in customer.requests"
          :key="`${request.kind}-${request.id}`"
          class="customer-request"
        >
          <button
            type="button"
            class="customer-request__head"
            :aria-expanded="expanded === `${request.kind}-${request.id}`"
            @click="
              expanded =
                expanded === `${request.kind}-${request.id}`
                  ? null
                  : `${request.kind}-${request.id}`
            "
          >
            <v-icon
              :icon="
                expanded === `${request.kind}-${request.id}`
                  ? 'mdi-chevron-down'
                  : 'mdi-chevron-left'
              "
              size="16"
            />
            <span class="customer-request__title">
              {{ request.kind === "sale" ? "شراء" : "إيجار" }}
              {{ propertyTypeText(request.kind, request.property_type) }}
              · <bdi>{{ request.code }}</bdi>
            </span>
            <v-chip
              size="x-small"
              :color="request.match_count ? 'primary' : 'warning'"
              variant="tonal"
              label
            >
              {{
                request.match_count
                  ? `مطابقات ${request.match_count}`
                  : "بلا مطابقة"
              }}
            </v-chip>
          </button>
          <div
            v-if="expanded === `${request.kind}-${request.id}`"
            class="customer-request__body"
          >
            <RequestMatchesList
              :kind="request.kind"
              :request-id="request.id"
              @open="emit('listing', $event)"
            />
            <v-btn
              size="small"
              variant="text"
              class="mt-1"
              @click="emit('request', { kind: request.kind, id: request.id })"
              >فتح الطلب</v-btn
            >
          </div>
        </div>
      </section>
    </template>
    <template #actions>
      <v-btn
        v-if="customer && canReadPerson"
        color="primary"
        variant="flat"
        prepend-icon="mdi-account-outline"
        @click="emit('person', customer.person_id)"
        >ملف الزبون الكامل</v-btn
      >
    </template>
  </SideSheet>
</template>

<style scoped>
.customer-block + .customer-block {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--dal-stroke);
}
.customer-block h3 {
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 700;
  margin: 0 0 6px;
}
.customer-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  margin: 0;
}
.customer-grid dt,
.customer-label {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.customer-grid dd {
  margin: 0;
  font-size: calc(13px * var(--dal-font-scale));
}
.customer-notes {
  margin-top: 8px;
}
.customer-notes p {
  margin: 2px 0 0;
  font-size: calc(12.5px * var(--dal-font-scale));
  white-space: pre-line;
}
.customer-muted {
  margin: 8px 0 0;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.customer-request + .customer-request {
  border-top: 1px solid var(--dal-stroke);
}
.customer-request__head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 4px;
  text-align: start;
}
.customer-request__title {
  flex: 1;
  min-width: 0;
  font-size: calc(12.5px * var(--dal-font-scale));
}
.customer-request__body {
  padding: 0 4px 8px 24px;
}
</style>
