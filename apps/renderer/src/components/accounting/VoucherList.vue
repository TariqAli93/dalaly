<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import FilterBar from "../shared/FilterBar.vue";
import DataGrid from "../shared/DataGrid.vue";
import type { DataGridApi, FilterChip, GridHeader } from "../shared/grid";
import * as vouchersService from "../../services/vouchers.service";
import { createPagedList } from "../../composables/usePagedList";
import {
  ACCOUNT_CURRENCIES,
  VOUCHER_KINDS,
  voucherKindLabel,
  voucherPurposeLabel,
} from "../../constants/accounting";
import { formatAmount, formatDate } from "../../utils/format";
import { periodText } from "../../utils/periods";
import type {
  Currency,
  ListSortOption,
  VoucherKind,
  VoucherRecord,
  VoucherSortKey,
  VoucherStatus,
} from "../../types";
import DateField from "../app/DateField.vue";

/**
 * الحركات المالية: كل سند قبض أو صرف برقمه وتاريخه وطرفه وغرضه ومبلغه، ومن
 * أين جاء (الصفقة أو العمولة أو الإيجار أو تصنيف المصروف)، فيُتتبَّع كل مبلغ
 * إلى سجله. القبض يضيف إلى الصندوق أو المصرف، والصرف ينقص منه. السند الملغى
 * يبقى في القائمة.
 *
 * للقائمة تواريخها الخاصة، مستقلة عن فترة ملخّص الصفحة (`period`)؛ سطر النطاق
 * فوقها يقول أيّها تعرض، و«حركات الفترة فقط» يطبّق فترة الملخّص صراحةً.
 */
const props = defineProps<{
  /** فترة ملخّص الصفحة؛ all: «منذ البداية». */
  period?: { from: string; to: string; label: string; all: boolean } | null;
}>();
const router = useRouter();
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

// ─── نطاق التواريخ ──────────────────────────────────────────────────────
const allDates = computed(() => !from.value && !to.value);
const rangeText = computed(() =>
  from.value && to.value
    ? periodText(from.value, to.value)
    : from.value
      ? `من ${formatDate(from.value)}`
      : `حتى ${formatDate(to.value)}`,
);
/** هل تعرض القائمة فترة الملخّص نفسها؟ «منذ البداية» = كل التواريخ. */
const onPeriod = computed(() => {
  const period = props.period;
  if (!period) return false;
  if (period.all) return allDates.value;
  return from.value === period.from && to.value === period.to;
});
function applyPeriod() {
  if (!props.period) return;
  from.value = props.period.all ? "" : props.period.from;
  to.value = props.period.all ? "" : props.period.to;
}
function showAllDates() {
  from.value = "";
  to.value = "";
}

const headers: GridHeader[] = [
  { key: "code", title: "السند", sortable: true },
  { key: "voucher_date", title: "التاريخ", sortable: true },
  { key: "party_name", title: "الطرف" },
  { key: "purpose", title: "الغرض والمصدر", priority: 2 },
  { key: "amount", title: "المبلغ", align: "end", sortable: true },
  { key: "money_account_name", title: "الصندوق أو المصرف", priority: 3 },
  { key: "status", title: "الحالة" },
];

/** The record the money belongs to, so every amount leads back to it. */
function sourceOf(voucher: VoucherRecord) {
  if (voucher.commission_id && voucher.commission_code)
    return {
      label: `العمولة ${voucher.commission_code}`,
      to: `/accounting/commissions/${voucher.commission_id}`,
    };
  if (voucher.lease_id && voucher.lease_code)
    return {
      label: `الإيجار ${voucher.lease_code}`,
      to: `/leases/${voucher.lease_id}`,
    };
  if (voucher.deal_id && voucher.deal_code)
    return {
      label: `الصفقة ${voucher.deal_code}`,
      to: `/deals/${voucher.deal_id}`,
    };
  if (voucher.expense_category_name)
    return { label: voucher.expense_category_name, to: null };
  return null;
}

function openVoucher(voucher: VoucherRecord) {
  grid.value?.remember(voucher.id);
  void router.push(`/accounting/vouchers/${voucher.id}`);
}

// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void list.loadFirstPage();

defineExpose({ reload: list.reload, total });
</script>

<template>
  <div v-if="period" class="dal-scope" aria-live="polite">
    <v-icon icon="mdi-calendar-range" size="16" class="dal-scope__icon" />
    <span v-if="allDates"
      ><strong>كل الحركات</strong>، بكل التواريخ<span
        v-if="!period.all"
        class="dal-scope__muted"
      >
        — لا تتبع فترة الملخّص</span
      ></span
    >
    <span v-else
      ><strong>الحركات {{ rangeText }}</strong
      ><span v-if="onPeriod" class="dal-scope__muted">
        — فترة الملخّص ({{ period.label }})</span
      ></span
    >
    <v-spacer />
    <v-btn
      v-if="!onPeriod"
      size="small"
      variant="text"
      color="primary"
      prepend-icon="mdi-calendar-filter-outline"
      @click="applyPeriod"
      >حركات {{ period.label }} فقط</v-btn
    >
    <v-btn
      v-if="!allDates"
      size="small"
      variant="text"
      prepend-icon="mdi-calendar-remove-outline"
      @click="showAllDates"
      >كل التواريخ</v-btn
    >
  </div>
  <FilterBar
    v-model:search="search"
    :filters="[kind, currency, status, from, to]"
    search-label="بحث في الحركات المالية"
    placeholder="بحث برقم السند أو الطرف أو البيان"
    :chips="chips"
    :extra-count="[status, from, to].filter(Boolean).length"
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
    </template>
    <template #extra>
      <v-select
        v-model="status"
        :items="STATUSES"
        label="الحالة"
        hide-details
        clearable
      />
      <DateField v-model="from" label="من تاريخ" hide-details clearable />
      <DateField v-model="to" label="إلى تاريخ" hide-details clearable />
    </template>
  </FilterBar>

  <DataGrid
    ref="grid"
    v-model:page="page"
    v-model:items-per-page="pageSize"
    v-model:sort-by="sortBy"
    grid-key="vouchers"
    table-label="جدول الحركات المالية"
    :items="items"
    :headers="headers"
    :total="total"
    :loading="loading"
    :error="error"
    :has-filters="chips.length > 0"
    :row-label="(voucher) => `${voucher.code} · ${voucher.party_name}`"
    :empty="{
      icon: 'mdi-cash-register',
      title: 'لا حركات مالية بعد',
      text: 'سجّل «قبض» حين يدخل مال إلى الصندوق أو المصرف، و«مصروف» حين يخرج.',
    }"
    :no-match="{ title: 'لا حركات مطابقة للفلاتر الحالية' }"
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
      <bdi dir="rtl">{{ formatDate(item.voucher_date) }}</bdi>
    </template>
    <template #item.party_name="{ item }">
      <div class="dal-cell-name">
        <span class="dal-clip">{{ item.party_name }}</span>
        <span
          v-if="item.description"
          class="dal-clip text-caption text-medium-emphasis"
          :title="item.description"
          >{{ item.description }}</span
        >
      </div>
    </template>
    <template #item.purpose="{ item }">
      <div class="dal-cell-name">
        <span>{{ voucherPurposeLabel(item.kind, item.purpose) }}</span>
        <template v-if="sourceOf(item)">
          <router-link
            v-if="sourceOf(item)!.to"
            :to="sourceOf(item)!.to!"
            class="text-caption"
            >{{ sourceOf(item)!.label }}</router-link
          >
          <span v-else class="text-caption text-medium-emphasis">{{
            sourceOf(item)!.label
          }}</span>
        </template>
      </div>
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
