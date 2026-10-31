<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import FilterBar from "../components/shared/FilterBar.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import LeaseDialog from "../components/leases/LeaseDialog.vue";
import OverdueInstallments from "../components/leases/OverdueInstallments.vue";
import type {
  DataGridApi,
  FilterChip,
  GridHeader,
} from "../components/shared/grid";
import * as leasesService from "../services/leases.service";
import { createPagedList } from "../composables/usePagedList";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useNewFromQuery } from "../composables/useNewFromQuery";
import { useSnackbar } from "../composables/useSnackbar";
import {
  LEASE_STATES,
  leasePerPeriod,
  leaseStateOf,
} from "../constants/leases";
import { formatAmount, formatDate } from "../utils/format";
import type {
  LeaseDetail,
  LeaseRecord,
  LeaseSortKey,
  LeaseState,
  ListSortOption,
} from "../types";
import { isZeroAmount } from "../utils/money";

/**
 * الإيجارات السارية: كل إيجار بمستأجره ومؤجره وعرضه، وبدله لكل فترة،
 * ومدته وأقرب قسط مستحق والمتأخر عليه. يُفعَّل الإيجار من عقد إيجار صادر،
 * أو يُدخل يدوياً لعقد ليس في النظام. تبويب «الأقساط المتأخرة» يجمع ما حلّ
 * موعده ولم يُدفع في كل الإيجارات التي يقبضها المكتب (?view=overdue).
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifySuccess } = useSnackbar();
const grid = useTemplateRef<DataGridApi>("grid");

const view = ref<"leases" | "overdue">(
  route.query.view === "overdue" ? "overdue" : "leases",
);
watch(view, (value) => {
  void router.replace({
    query: {
      ...route.query,
      view: value === "overdue" ? "overdue" : undefined,
    },
  });
});
// How many installments are overdue, for the tab: one row is enough to count.
const overdueCount = ref<number | null>(null);
async function countOverdue() {
  try {
    overdueCount.value = (
      await leasesService.listOverdueInstallments({}, { page: 1, page_size: 1 })
    ).total;
  } catch {
    overdueCount.value = null;
  }
}
const overdue = useTemplateRef<{ reload: () => Promise<void> }>("overdue");

const search = ref<string | null>("");
const state = ref<LeaseState | null>(null);

const DEFAULT_SORT: ListSortOption<LeaseSortKey> = {
  value: "start_date",
  title: "تاريخ البدء",
  key: "start_date",
  order: "desc",
};
const list = createPagedList<LeaseRecord, LeaseSortKey>(
  (page, signal) =>
    leasesService.listLeasesPage(
      {
        q: search.value?.trim() || undefined,
        state: state.value ?? undefined,
      },
      page,
      signal,
    ),
  DEFAULT_SORT,
);
const { items, total, loading, error, page, pageSize, sortBy, onTableOptions } =
  list;
const apply = () => void list.loadFirstPage();

const chips = computed<FilterChip[]>(() => {
  const result: FilterChip[] = [];
  if (search.value) result.push({ key: "q", label: `بحث: ${search.value}` });
  if (state.value)
    result.push({ key: "state", label: leaseStateOf(state.value).title });
  return result;
});
function removeChip(key: string) {
  if (key === "q") search.value = "";
  else if (key === "state") state.value = null;
}
function clear() {
  search.value = "";
  state.value = null;
}

const headers: GridHeader[] = [
  { key: "code", title: "الإيجار", sortable: true },
  { key: "tenant_name", title: "المستأجر" },
  { key: "landlord_name", title: "المؤجر", priority: 2 },
  { key: "rental_name", title: "العرض", priority: 3 },
  { key: "rent_amount", title: "البدل", align: "end" },
  { key: "start_date", title: "المدة", sortable: true },
  { key: "next_due_date", title: "القسط القادم", priority: 2 },
  { key: "outstanding", title: "المتأخر", align: "end", priority: 2 },
  { key: "state", title: "الحالة" },
];
function openLease(lease: LeaseRecord) {
  grid.value?.remember(lease.id);
  void router.push(`/leases/${lease.id}`);
}

const dialog = ref(false);
useNewFromQuery(() => {
  if (can("leases.manage")) dialog.value = true;
});
function onCreated(lease: LeaseDetail) {
  notifySuccess(`سُجّل الإيجار ${lease.code}.`);
  void router.push(`/leases/${lease.id}`);
}

function onCollected() {
  void countOverdue();
  void list.reload();
}

onMounted(() => {
  setRefreshHandler(async () => {
    void countOverdue();
    if (view.value === "overdue") await overdue.value?.reload();
    else await list.reload();
  });
  void countOverdue();
});
// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void list.loadFirstPage();
</script>

<template>
  <AppPage title="الإيجارات السارية" :count="total || null">
    <template #header-actions>
      <v-btn
        v-if="can('leases.manage') && view === 'leases'"
        variant="tonal"
        prepend-icon="mdi-plus"
        @click="dialog = true"
        >إيجار بلا عقد في النظام</v-btn
      >
    </template>

    <v-tabs v-model="view" density="compact" class="mb-2">
      <v-tab value="leases">الإيجارات</v-tab>
      <v-tab value="overdue"
        >الأقساط المتأخرة
        <v-badge
          v-if="overdueCount"
          :content="overdueCount"
          color="error"
          inline
        />
      </v-tab>
    </v-tabs>

    <section
      v-if="view === 'overdue'"
      class="dal-panel dal-listpanel dal-fill"
      aria-label="الأقساط المتأخرة"
    >
      <OverdueInstallments ref="overdue" @changed="onCollected" />
    </section>

    <section
      v-else
      class="dal-panel dal-listpanel dal-fill"
      aria-label="الإيجارات"
    >
      <FilterBar
        v-model:search="search"
        :filters="[state]"
        search-label="بحث في الإيجارات"
        placeholder="بحث برقم الإيجار أو المستأجر أو المؤجر أو العرض"
        :chips="chips"
        @apply="apply"
        @down="grid?.focusFirstRow()"
        @remove="removeChip"
        @clear="clear"
      >
        <template #filters>
          <v-select
            v-model="state"
            :items="LEASE_STATES"
            label="الحالة"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
        </template>
      </FilterBar>

      <DataGrid
        ref="grid"
        v-model:page="page"
        v-model:items-per-page="pageSize"
        v-model:sort-by="sortBy"
        grid-key="leases"
        table-label="جدول الإيجارات"
        :items="items"
        :headers="headers"
        :total="total"
        :loading="loading"
        :error="error"
        :has-filters="chips.length > 0"
        :row-label="(lease) => `${lease.code} · ${lease.tenant_name ?? ''}`"
        :empty="{
          icon: 'mdi-home-clock-outline',
          title: 'لا إيجارات بعد',
          text: 'يُفعَّل الإيجار من صفحة عقد الإيجار بعد إصداره.',
        }"
        :no-match="{ title: 'لا إيجارات مطابقة للفلاتر الحالية' }"
        @open="openLease"
        @retry="list.reload"
        @clear-filters="clear"
        @options="onTableOptions"
      >
        <template #item.code="{ item }">
          <bdi class="font-weight-medium">{{ item.code }}</bdi>
        </template>
        <template #item.tenant_name="{ item }">
          <span class="dal-clip">{{ item.tenant_name ?? "—" }}</span>
        </template>
        <template #item.landlord_name="{ item }">
          <span class="dal-clip">{{ item.landlord_name ?? "—" }}</span>
        </template>
        <template #item.rental_name="{ item }">
          <span class="dal-clip">{{
            item.rental_name ?? item.rental_code ?? "—"
          }}</span>
        </template>
        <template #item.rent_amount="{ item }">
          <span class="lease-amount"
            ><bdi>{{ formatAmount(item.rent_amount, item.currency) }}</bdi>
            {{ leasePerPeriod(item.frequency) }}</span
          >
        </template>
        <template #item.start_date="{ item }">
          <span class="lease-dates"
            >{{ formatDate(item.start_date) }} ←
            {{ formatDate(item.end_date) }}</span
          >
        </template>
        <template #item.next_due_date="{ item }">
          <span>{{
            item.state === "cancelled" || !item.next_due_date
              ? "—"
              : formatDate(item.next_due_date)
          }}</span>
        </template>
        <template #item.outstanding="{ item }">
          <span
            v-if="item.office_collects && !isZeroAmount(item.outstanding)"
            class="lease-amount text-error"
            ><bdi>{{
              formatAmount(item.outstanding, item.currency)
            }}</bdi></span
          >
          <span v-else class="text-medium-emphasis">—</span>
        </template>
        <template #item.state="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="leaseStateOf(item.state).color"
            >{{ leaseStateOf(item.state).title }}</v-chip
          >
        </template>
      </DataGrid>
    </section>

    <LeaseDialog v-model="dialog" @saved="onCreated" />
  </AppPage>
</template>

<style scoped>
.lease-amount,
.lease-dates {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
