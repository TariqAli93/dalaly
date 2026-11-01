<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import FilterBar from "../shared/FilterBar.vue";
import DataGrid from "../shared/DataGrid.vue";
import type { DataGridApi, FilterChip, GridHeader } from "../shared/grid";
import * as commissionsService from "../../services/commissions.service";
import { createPagedList } from "../../composables/usePagedList";
import { usePermissions } from "../../composables/usePermissions";
import {
  ACCOUNT_CURRENCIES,
  COMMISSION_STATES,
  commissionStateOf,
} from "../../constants/accounting";
import { formatAmount, formatDate } from "../../utils/format";
import type {
  CommissionRecord,
  CommissionSortKey,
  CommissionState,
  Currency,
  ListSortOption,
} from "../../types";

/**
 * العمولات: كل عمولة بصفقتها ودافعها ومبلغها وما بقي منها، و«تحصيل» في صف
 * كل عمولة لم تُقبض بالكامل، فلا يلزم فتح العمولة أولاً. تبدأ بالحالة التي
 * يمرّرها الأب (غير المقبوضة من بطاقة «العمولات المتبقية»).
 */
const props = defineProps<{ initialState?: CommissionState | null }>();
const emit = defineEmits<{ collect: [CommissionRecord] }>();

const router = useRouter();
const { can } = usePermissions();
const grid = useTemplateRef<DataGridApi>("grid");

const search = ref<string | null>("");
const state = ref<CommissionState | null>(props.initialState ?? null);
const currency = ref<Currency | null>(null);

const DEFAULT_SORT: ListSortOption<CommissionSortKey> = {
  value: "commission_date",
  title: "التاريخ",
  key: "commission_date",
  order: "desc",
};
const list = createPagedList<CommissionRecord, CommissionSortKey>(
  (page, signal) =>
    commissionsService.listCommissionsPage(
      {
        q: search.value?.trim() || undefined,
        state: state.value ?? undefined,
        currency: currency.value ?? undefined,
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
    result.push({
      key: "state",
      label: COMMISSION_STATES.find((item) => item.value === state.value)!
        .title,
    });
  if (currency.value)
    result.push({
      key: "currency",
      label:
        ACCOUNT_CURRENCIES.find((item) => item.value === currency.value)
          ?.title ?? currency.value,
    });
  return result;
});
function removeChip(key: string) {
  if (key === "q") search.value = "";
  else if (key === "state") state.value = null;
  else if (key === "currency") currency.value = null;
}
function clear() {
  search.value = "";
  state.value = null;
  currency.value = null;
}

const canCollect = computed(() => can("vouchers.receipt"));
const headers = computed<GridHeader[]>(() => [
  { key: "code", title: "العمولة", sortable: true },
  { key: "commission_date", title: "التاريخ", sortable: true },
  { key: "payer_name", title: "الدافع" },
  { key: "deal_code", title: "الصفقة", priority: 2 },
  { key: "amount", title: "المبلغ", align: "end", sortable: true },
  { key: "outstanding", title: "المتبقي", align: "end" },
  { key: "status", title: "الحالة", priority: 2 },
  ...(canCollect.value
    ? [{ key: "collect", title: "", align: "end" as const }]
    : []),
]);
function openCommission(commission: CommissionRecord) {
  grid.value?.remember(commission.id);
  void router.push(`/accounting/commissions/${commission.id}`);
}
const collectable = (commission: CommissionRecord) =>
  commission.status !== "cancelled" && commission.outstanding !== "0.00";

/** From «تسديد عمولة»: only what is still owed, with the search focused. */
function showOutstanding() {
  search.value = "";
  currency.value = null;
  state.value = "open";
}

// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void list.loadFirstPage();

defineExpose({ reload: list.reload, total, showOutstanding });
</script>

<template>
  <FilterBar
    v-model:search="search"
    :filters="[state, currency]"
    search-label="بحث في العمولات"
    placeholder="بحث برقم العمولة أو الصفقة أو الدافع"
    :chips="chips"
    @apply="apply"
    @down="grid?.focusFirstRow()"
    @remove="removeChip"
    @clear="clear"
  >
    <template #filters>
      <v-select
        v-model="state"
        :items="COMMISSION_STATES"
        label="الحالة"
        hide-details
        clearable
        class="dal-toolbar__filter"
      />
      <v-select
        v-model="currency"
        :items="ACCOUNT_CURRENCIES"
        label="العملة"
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
    grid-key="commissions"
    table-label="جدول العمولات"
    :items="items"
    :headers="headers"
    :total="total"
    :loading="loading"
    :error="error"
    :has-filters="chips.length > 0"
    :row-label="
      (commission) => `${commission.code} · ${commission.payer_name ?? ''}`
    "
    :empty="{
      icon: 'mdi-percent-circle-outline',
      title: 'لا عمولات بعد',
      text: 'تُسجَّل العمولة من صفحة الصفقة حين يُتفق عليها.',
    }"
    :no-match="{
      title:
        state === 'open'
          ? 'لا عمولات متبقية: كل العمولات مقبوضة'
          : 'لا عمولات مطابقة للفلاتر الحالية',
    }"
    @open="openCommission"
    @retry="list.reload"
    @clear-filters="clear"
    @options="onTableOptions"
  >
    <template #item.code="{ item }">
      <bdi class="font-weight-medium">{{ item.code }}</bdi>
    </template>
    <template #item.commission_date="{ item }">
      <bdi dir="rtl">{{ formatDate(item.commission_date) }}</bdi>
    </template>
    <template #item.payer_name="{ item }">
      <span class="dal-clip">{{ item.payer_name ?? "—" }}</span>
    </template>
    <template #item.deal_code="{ item }">
      <router-link v-if="item.deal_id" :to="`/deals/${item.deal_id}`"
        ><bdi>{{ item.deal_code ?? "—" }}</bdi></router-link
      >
      <bdi v-else>{{ item.deal_code ?? "—" }}</bdi>
    </template>
    <template #item.amount="{ item }">
      <bdi class="commission-amount">{{
        formatAmount(item.amount, item.currency)
      }}</bdi>
    </template>
    <template #item.outstanding="{ item }">
      <bdi
        class="commission-amount"
        :class="{ 'text-warning': collectable(item) }"
        >{{
          item.status === "cancelled"
            ? "—"
            : formatAmount(item.outstanding, item.currency)
        }}</bdi
      >
    </template>
    <template #item.status="{ item }">
      <v-chip
        size="small"
        variant="tonal"
        label
        :color="commissionStateOf(item).color"
        >{{ commissionStateOf(item).title }}</v-chip
      >
    </template>
    <template #item.collect="{ item }">
      <v-btn
        v-if="collectable(item)"
        variant="tonal"
        color="primary"
        size="small"
        prepend-icon="mdi-cash-plus"
        :aria-label="`تحصيل العمولة ${item.code}`"
        @click="emit('collect', item)"
        >تحصيل</v-btn
      >
    </template>
  </DataGrid>
</template>

<style scoped>
.commission-amount {
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
