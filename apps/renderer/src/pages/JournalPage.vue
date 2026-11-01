<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import FilterBar from "../components/shared/FilterBar.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import JournalEntryDialog from "../components/accounting/JournalEntryDialog.vue";
import PeriodsDialog from "../components/accounting/PeriodsDialog.vue";
import type {
  DataGridApi,
  FilterChip,
  GridHeader,
} from "../components/shared/grid";
import * as accountingService from "../services/accounting.service";
import { createPagedList } from "../composables/usePagedList";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import {
  ACCOUNT_CURRENCIES,
  JOURNAL_SOURCES,
  JOURNAL_STATUSES,
  journalSourceLabel,
  journalStatusColor,
  journalStatusLabel,
} from "../constants/accounting";
import { formatAmount, formatDate } from "../utils/format";
import type {
  Currency,
  JournalEntryDetail,
  JournalEntryRecord,
  JournalSortKey,
  JournalSource,
  JournalStatus,
  ListSortOption,
} from "../types";

/**
 * دفتر القيود: كل قيد بتاريخه وبيانه وعملته ومبلغه وحالته، الأحدث أولاً.
 * المسودة تُكمل وتُرحَّل من صفحة القيد؛ المرحَّل لا يُعدَّل ويُصحَّح بقيد عكسي.
 */
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifySuccess } = useSnackbar();
const grid = useTemplateRef<DataGridApi>("grid");

const search = ref<string | null>("");
const currency = ref<Currency | null>(null);
const status = ref<JournalStatus | null>(null);
const source = ref<JournalSource | null>(null);
const from = ref("");
const to = ref("");

const DEFAULT_SORT: ListSortOption<JournalSortKey> = {
  value: "entry_date",
  title: "التاريخ",
  key: "entry_date",
  order: "desc",
};
const list = createPagedList<JournalEntryRecord, JournalSortKey>(
  (page, signal) =>
    accountingService.listJournalPage(
      {
        q: search.value?.trim() || undefined,
        currency: currency.value ?? undefined,
        status: status.value ?? undefined,
        source_type: source.value ?? undefined,
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
  if (currency.value)
    result.push({
      key: "currency",
      label:
        ACCOUNT_CURRENCIES.find((item) => item.value === currency.value)
          ?.title ?? currency.value,
    });
  if (status.value)
    result.push({ key: "status", label: journalStatusLabel(status.value) });
  if (source.value)
    result.push({ key: "source", label: journalSourceLabel(source.value) });
  if (from.value) result.push({ key: "from", label: `من ${from.value}` });
  if (to.value) result.push({ key: "to", label: `إلى ${to.value}` });
  return result;
});
function removeChip(key: string) {
  if (key === "q") search.value = "";
  else if (key === "currency") currency.value = null;
  else if (key === "status") status.value = null;
  else if (key === "source") source.value = null;
  else if (key === "from") from.value = "";
  else if (key === "to") to.value = "";
}
function clear() {
  search.value = "";
  currency.value = null;
  status.value = null;
  source.value = null;
  from.value = "";
  to.value = "";
}

const headers: GridHeader[] = [
  { key: "code", title: "القيد", sortable: true },
  { key: "entry_date", title: "التاريخ", sortable: true },
  { key: "description", title: "البيان" },
  { key: "total", title: "المبلغ", align: "end" },
  { key: "source_type", title: "المصدر", priority: 3 },
  { key: "status", title: "الحالة" },
];

function openEntry(entry: JournalEntryRecord) {
  grid.value?.remember(entry.id);
  void router.push(`/accounting/journal/${entry.id}`);
}

const dialog = ref(false);
const periodsDialog = ref(false);
function onSaved(entry: JournalEntryDetail) {
  notifySuccess(
    entry.status === "posted"
      ? `رُحِّل القيد ${entry.code}.`
      : `حُفظت المسودة ${entry.code}.`,
  );
  void router.push(`/accounting/journal/${entry.id}`);
}

// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void list.loadFirstPage();
onMounted(() => setRefreshHandler(list.reload));
</script>

<template>
  <AppPage
    title="القيود"
    :parent="{ to: '/accounting', label: 'الحسابات' }"
    :count="total || null"
  >
    <template #header-actions>
      <v-btn
        variant="text"
        prepend-icon="mdi-calendar-lock-outline"
        @click="periodsDialog = true"
        >الأشهر المقفلة</v-btn
      >
      <v-btn
        v-if="can('accounting.journal.create')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-plus"
        @click="dialog = true"
        >قيد يدوي</v-btn
      >
    </template>

    <section class="dal-panel dal-listpanel dal-fill" aria-label="القيود">
      <FilterBar
        v-model:search="search"
        :filters="[currency, status, source, from, to]"
        search-label="بحث في القيود"
        placeholder="بحث برقم القيد أو بيانه"
        :chips="chips"
        @apply="apply"
        @down="grid?.focusFirstRow()"
        @remove="removeChip"
        @clear="clear"
      >
        <template #filters>
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
            :items="JOURNAL_STATUSES"
            label="الحالة"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-select
            v-model="source"
            :items="JOURNAL_SOURCES"
            label="المصدر"
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
        grid-key="journal"
        table-label="جدول القيود"
        :items="items"
        :headers="headers"
        :total="total"
        :loading="loading"
        :error="error"
        :has-filters="chips.length > 0"
        :row-label="(entry) => `${entry.code} · ${entry.description}`"
        :empty="{
          icon: 'mdi-book-open-variant',
          title: 'لا قيود بعد',
          text: 'القيود اليدوية تُسجَّل من «قيد يدوي»، وقيود السندات والعمولات تُنشأ معها.',
        }"
        :no-match="{ title: 'لا قيود مطابقة للفلاتر الحالية' }"
        @open="openEntry"
        @retry="list.reload"
        @clear-filters="clear"
        @options="onTableOptions"
      >
        <template #item.code="{ item }">
          <bdi class="font-weight-medium">{{ item.code }}</bdi>
        </template>
        <template #item.entry_date="{ item }">
          <span>{{ formatDate(item.entry_date) }}</span>
        </template>
        <template #item.description="{ item }">
          <span class="dal-clip">{{ item.description }}</span>
        </template>
        <template #item.total="{ item }">
          <bdi class="journal-amount">{{
            formatAmount(item.total, item.currency)
          }}</bdi>
        </template>
        <template #item.source_type="{ item }">
          {{ journalSourceLabel(item.source_type) }}
        </template>
        <template #item.status="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="journalStatusColor(item.status)"
            >{{ journalStatusLabel(item.status) }}</v-chip
          >
          <v-chip
            v-if="item.reversed_by_code"
            size="small"
            variant="tonal"
            label
            class="ms-1"
            >معكوس</v-chip
          >
        </template>
      </DataGrid>
    </section>

    <JournalEntryDialog v-model="dialog" @saved="onSaved" />
    <PeriodsDialog v-model="periodsDialog" />
  </AppPage>
</template>

<style scoped>
.journal-amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
