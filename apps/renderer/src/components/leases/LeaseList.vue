<script setup lang="ts">
import { ref, watch } from "vue";
import * as leasesService from "../../services/leases.service";
import { getErrorMessage } from "../../services/api.service";
import { leasePerPeriod, leaseStateOf } from "../../constants/leases";
import { formatAmount, formatDate } from "../../utils/format";
import type { LeaseFilters, LeaseRecord } from "../../types";
import { isZeroAmount } from "../../utils/money";

/**
 * إيجارات عرض أو زبون، الأحدث أولاً: كل منها بطرفه الآخر وبدله ومدته
 * وحالته، والمتأخر عليه إن كان المكتب يقبض إيجاره. يُستعمل في صفحة عرض
 * الإيجار وفي ملف الزبون.
 */
const props = defineProps<{
  filters: Pick<LeaseFilters, "person_id" | "rental_id">;
  /** On a customer's page: say which side of each lease they are. */
  personId?: number;
}>();

const leases = ref<LeaseRecord[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const page = await leasesService.listLeasesPage(props.filters, {
      page: 1,
      page_size: 20,
      sort_by: "start_date",
      sort_order: "desc",
    });
    leases.value = page.items;
    total.value = page.total;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
watch(() => [props.filters.person_id, props.filters.rental_id], load, {
  immediate: true,
});
defineExpose({ reload: load, total });

const owed = (lease: LeaseRecord) =>
  lease.office_collects && !isZeroAmount(lease.outstanding);

/** The other side, as the customer's page reads it. */
function otherSide(lease: LeaseRecord) {
  if (props.personId === lease.landlord_person_id)
    return `مؤجر لـ ${lease.tenant_name ?? "—"}`;
  if (props.personId === lease.tenant_person_id)
    return `مستأجر من ${lease.landlord_name ?? "—"}`;
  return lease.tenant_name ?? "—";
}
</script>

<template>
  <div>
    <v-progress-linear v-if="loading && !leases.length" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal" density="compact">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>
    <p v-else-if="!leases.length" class="lease-list__empty">لا إيجارات.</p>
    <ul v-else class="lease-list">
      <li v-for="lease in leases" :key="lease.id">
        <router-link :to="`/leases/${lease.id}`"
          ><bdi>{{ lease.code }}</bdi></router-link
        >
        <span class="lease-list__who">{{ otherSide(lease) }}</span>
        <span class="text-medium-emphasis lease-list__dates"
          >{{ formatDate(lease.start_date) }} ←
          {{ formatDate(lease.end_date) }}</span
        >
        <bdi class="lease-list__amount"
          >{{ formatAmount(lease.rent_amount, lease.currency) }}
          {{ leasePerPeriod(lease.frequency) }}</bdi
        >
        <span v-if="owed(lease)" class="lease-list__owed text-error"
          >متأخر
          <bdi>{{ formatAmount(lease.outstanding, lease.currency) }}</bdi></span
        >
        <v-chip
          size="x-small"
          variant="tonal"
          label
          :color="leaseStateOf(lease.state).color"
          >{{ leaseStateOf(lease.state).title }}</v-chip
        >
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lease-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  font-size: 0.875rem;
}
.lease-list li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.lease-list__who {
  flex: 1;
  min-width: 8rem;
}
.lease-list__dates,
.lease-list__amount,
.lease-list__owed {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.lease-list__amount {
  font-weight: 700;
}
.lease-list__empty {
  margin: 0;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
