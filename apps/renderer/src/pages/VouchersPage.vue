<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import FilterBar from "../components/shared/FilterBar.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import VoucherDialog from "../components/accounting/VoucherDialog.vue";
import ExpenseCategoriesDialog from "../components/accounting/ExpenseCategoriesDialog.vue";
import type {
  DataGridApi,
  FilterChip,
  GridHeader,
} from "../components/shared/grid";
import * as vouchersService from "../services/vouchers.service";
import { createPagedList } from "../composables/usePagedList";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import {
  ACCOUNT_CURRENCIES,
  VOUCHER_KINDS,
  voucherKindLabel,
  voucherPurposeLabel,
} from "../constants/accounting";
import { formatAmount, formatDate } from "../utils/format";
import type {
  Currency,
  ListSortOption,
  VoucherDetail,
  VoucherKind,
  VoucherRecord,
  VoucherSortKey,
  VoucherStatus,
} from "../types";

/**
 * سندات القبض والصرف: كل سند برقمه وتاريخه وطرفه وغرضه ومبلغه. القبض يضيف
 * إلى الصندوق أو المصرف، والصرف ينقص منه. السند الملغى يبقى في القائمة.
 */
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifySuccess } = useSnackbar();
const grid = useTemplateRef<DataGridApi>("grid");

const search = ref<string | null>("");
const kind = ref<VoucherKind | null>(null);
const currency = ref<Currency | null>(null);
const status = ref<VoucherStatus | null>(null);
const from = ref("");
const to = ref("");
const STATUSES = [
  { value: "posted", title: "صادر" },
  { value: "voided", title: "ملغى" },
];

const DEFAULT_SORT: ListSortOption<VoucherSortKey> = {
  value: "voucher_date",
  title: "التاريخ",
  key: "voucher_date",
  order: "desc",
};
const list = createPagedList<VoucherRecord, VoucherSortKey>(
  (page, signal) =>
    vouchersService.listVouchersPage(
      {
        q: search.value?.trim() || undefined,
        kind: kind.value ?? undefined,
        currency: currency.value ?? undefined,
        status: status.value ?? undefined,
        from: from.value || undefined,
        to: to.value || undefined,
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
  if (kind.value)
    result.push({ key: "kind", label: voucherKindLabel(kind.value) });
  if (currency.value)
    result.push({
      key: "currency",
      label:
        ACCOUNT_CURRENCIES.find((item) => item.value === currency.value)
          ?.title ?? currency.value,
    });
  if (status.value)
    result.push({
      key: "status",
      label: STATUSES.find((item) => item.value === status.value)!.title,
    });
  if (from.value) result.push({ key: "from", label: `من ${from.value}` });
  if (to.value) result.push({ key: "to", label: `إلى ${to.value}` });
  return result;
});
function removeChip(key: string) {
  if (key === "q") search.value = "";
  else if (key === "kind") kind.value = null;
  else if (key === "currency") currency.value = null;
  else if (key === "status") status.value = null;
  else if (key === "from") from.value = "";
  else if (key === "to") to.value = "";
}
function clear() {
  search.value = "";
  kind.value = null;
  currency.value = null;
  status.value = null;
  from.value = "";
  to.value = "";
}

const headers: GridHeader[] = [
  { key: "code", title: "السند", sortable: true },
  { key: "voucher_date", title: "التاريخ", sortable: true },
  { key: "party_name", title: "الطرف" },
  { key: "purpose", title: "الغرض", priority: 2 },
  { key: "amount", title: "المبلغ", align: "end", sortable: true },
  { key: "money_account_name", title: "الصندوق أو المصرف", priority: 3 },
  { key: "status", title: "الحالة" },
];

function openVoucher(voucher: VoucherRecord) {
  grid.value?.remember(voucher.id);
  void router.push(`/accounting/vouchers/${voucher.id}`);
}

const categoriesDialog = ref(false);
const dialog = ref(false);
const dialogKind = ref<VoucherKind>("receipt");
function openIssue(value: VoucherKind) {
  dialogKind.value = value;
  dialog.value = true;
}
function onIssued(voucher: VoucherDetail) {
  notifySuccess(`صدر ${voucherKindLabel(voucher.kind)} ${voucher.code}.`);
  void router.push(`/accounting/vouchers/${voucher.id}`);
}

onMounted(() => {
  setRefreshHandler(list.reload);
  void list.loadFirstPage();
});
</script>

<template>
  <AppPage title="سندات القبض والصرف" :count="total || null">
    <template #header-actions>
      <v-btn
        variant="text"
        prepend-icon="mdi-shape-outline"
        @click="categoriesDialog = true"
        >تصنيفات المصروفات</v-btn
      >
      <v-btn
        v-if="can('vouchers.payment')"
        variant="tonal"
        prepend-icon="mdi-cash-minus"
        @click="openIssue('payment')"
        >سند صرف</v-btn
      >
      <v-btn
        v-if="can('vouchers.receipt')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-cash-plus"
        @click="openIssue('receipt')"
        >سند قبض</v-btn
      >
    </template>

    <section class="dal-panel dal-listpanel dal-fill" aria-label="السندات">
      <FilterBar
        v-model:search="search"
        :filters="[kind, currency, status, from, to]"
        search-label="بحث في السندات"
        placeholder="بحث برقم السند أو الطرف أو البيان"
        :chips="chips"
        @apply="apply"
        @down="grid?.focusFirstRow()"
        @remove="removeChip"
        @clear="clear"
      >
        <template #filters>
          <v-select
            v-model="kind"
            :items="VOUCHER_KINDS"
            label="النوع"
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
          <v-select
            v-model="status"
            :items="STATUSES"
            label="الحالة"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-text-field
            v-model="from"
            type="date"
            label="من تاريخ"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-text-field
            v-model="to"
            type="date"
            label="إلى تاريخ"
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
        grid-key="vouchers"
        table-label="جدول السندات"
        :items="items"
        :headers="headers"
        :total="total"
        :loading="loading"
        :error="error"
        :has-filters="chips.length > 0"
        :row-label="(voucher) => `${voucher.code} · ${voucher.party_name}`"
        :empty="{
          icon: 'mdi-cash-register',
          title: 'لا سندات بعد',
          text: 'سند القبض يُسجَّل حين يدخل مال إلى الصندوق أو المصرف، وسند الصرف حين يخرج.',
        }"
        :no-match="{ title: 'لا سندات مطابقة للفلاتر الحالية' }"
        @open="openVoucher"
        @retry="list.reload"
        @clear-filters="clear"
        @options="onTableOptions"
      >
        <template #item.code="{ item }">
          <div class="dal-cell-name">
            <bdi class="font-weight-medium">{{ item.code }}</bdi>
            <span class="text-caption text-medium-emphasis">{{
              voucherKindLabel(item.kind)
            }}</span>
          </div>
        </template>
        <template #item.voucher_date="{ item }">
          <span>{{ formatDate(item.voucher_date) }}</span>
        </template>
        <template #item.party_name="{ item }">
          <span class="dal-clip">{{ item.party_name }}</span>
        </template>
        <template #item.purpose="{ item }">
          {{ voucherPurposeLabel(item.kind, item.purpose) }}
        </template>
        <template #item.amount="{ item }">
          <bdi
            class="voucher-amount"
            :class="{ 'voucher-amount--out': item.kind === 'payment' }"
            >{{ item.kind === "payment" ? "−" : ""
            }}{{ formatAmount(item.amount, item.currency) }}</bdi
          >
        </template>
        <template #item.status="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="item.status === 'voided' ? 'error' : 'success'"
            >{{ item.status === "voided" ? "ملغى" : "صادر" }}</v-chip
          >
        </template>
      </DataGrid>
    </section>

    <VoucherDialog v-model="dialog" :kind="dialogKind" @saved="onIssued" />
    <ExpenseCategoriesDialog v-model="categoriesDialog" />
  </AppPage>
</template>

<style scoped>
.voucher-amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.voucher-amount--out {
  color: rgb(var(--v-theme-error));
}
</style>
