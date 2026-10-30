<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import FilterBar from "../components/shared/FilterBar.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import VoucherDialog from "../components/accounting/VoucherDialog.vue";
import type {
  DataGridApi,
  FilterChip,
  GridHeader,
} from "../components/shared/grid";
import * as commissionsService from "../services/commissions.service";
import { getErrorMessage } from "../services/api.service";
import { createPagedList } from "../composables/usePagedList";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import { ACCOUNT_CURRENCIES } from "../constants/accounting";
import { formatAmount, formatDate } from "../utils/format";
import type {
  CommissionRecord,
  CommissionSortKey,
  CommissionSplitRecord,
  CommissionState,
  Currency,
  ListSortOption,
  VoucherDetail,
  VoucherPayload,
} from "../types";

/**
 * العمولات: كل عمولة بصفقتها ودافعها ومبلغها وما حُصِّل منها. وحصص الموظفين
 * غير المدفوعة بعرض مستقل، يُدفع كل منها بسند صرف مخصص لها.
 */
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifySuccess } = useSnackbar();
const grid = useTemplateRef<DataGridApi>("grid");

const view = ref<"commissions" | "payable">("commissions");
const search = ref<string | null>("");
const state = ref<CommissionState | null>(null);
const currency = ref<Currency | null>(null);
const STATES: Array<{ value: CommissionState; title: string }> = [
  { value: "open", title: "غير محصّلة بالكامل" },
  { value: "settled", title: "محصّلة" },
  { value: "cancelled", title: "ملغاة" },
];

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
      label: STATES.find((item) => item.value === state.value)!.title,
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

const headers: GridHeader[] = [
  { key: "code", title: "العمولة", sortable: true },
  { key: "commission_date", title: "التاريخ", sortable: true },
  { key: "payer_name", title: "الدافع" },
  { key: "deal_code", title: "الصفقة", priority: 2 },
  { key: "amount", title: "المبلغ", align: "end", sortable: true },
  { key: "outstanding", title: "المتبقي", align: "end", priority: 2 },
  { key: "status", title: "الحالة" },
];
function openCommission(commission: CommissionRecord) {
  grid.value?.remember(commission.id);
  void router.push(`/accounting/commissions/${commission.id}`);
}
const stateOf = (commission: CommissionRecord) =>
  commission.status === "cancelled"
    ? { title: "ملغاة", color: "error" }
    : commission.outstanding === "0.00"
      ? { title: "محصّلة", color: "success" }
      : { title: "غير محصّلة", color: "warning" };

// ─── حصص الموظفين المستحقة ─────────────────────────────────────────────
const payable = ref<CommissionSplitRecord[]>([]);
const payableLoading = ref(false);
const payableError = ref<string | null>(null);
async function loadPayable() {
  payableLoading.value = true;
  payableError.value = null;
  try {
    payable.value = await commissionsService.listPayableSplits();
  } catch (cause) {
    payableError.value = getErrorMessage(cause);
  } finally {
    payableLoading.value = false;
  }
}
watch(view, (value) => {
  if (value === "payable") void loadPayable();
});

const payDialog = ref(false);
const payPreset = ref<Partial<VoucherPayload> | null>(null);
const payNote = ref("");
function pay(share: CommissionSplitRecord) {
  payPreset.value = {
    purpose: "commission",
    currency: share.currency,
    commission_split_id: share.id,
    amount: share.outstanding,
    description: `حصة ${share.user_name} من العمولة ${share.commission_code}`,
  };
  payNote.value = `دفع حصة ${share.user_name} من العمولة ${share.commission_code}؛ المتبقي ${formatAmount(share.outstanding, share.currency)}.`;
  payDialog.value = true;
}
function onPaid(voucher: VoucherDetail) {
  notifySuccess(`صدر سند الصرف ${voucher.code}.`);
  void loadPayable();
}

function reload() {
  return view.value === "payable" ? loadPayable() : list.reload();
}
onMounted(() => {
  setRefreshHandler(reload);
  void list.loadFirstPage();
});
</script>

<template>
  <AppPage
    title="العمولات"
    :count="view === 'commissions' ? total || null : payable.length || null"
  >
    <template #header-actions>
      <v-btn-toggle
        v-model="view"
        mandatory
        divided
        density="compact"
        variant="outlined"
        color="primary"
        aria-label="العرض"
      >
        <v-btn value="commissions">العمولات</v-btn>
        <v-btn value="payable">حصص الموظفين المستحقة</v-btn>
      </v-btn-toggle>
    </template>

    <section
      v-if="view === 'commissions'"
      class="dal-panel dal-listpanel dal-fill"
      aria-label="العمولات"
    >
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
            :items="STATES"
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
        :no-match="{ title: 'لا عمولات مطابقة للفلاتر الحالية' }"
        @open="openCommission"
        @retry="list.reload"
        @clear-filters="clear"
        @options="onTableOptions"
      >
        <template #item.code="{ item }">
          <bdi class="font-weight-medium">{{ item.code }}</bdi>
        </template>
        <template #item.commission_date="{ item }">
          <span>{{ formatDate(item.commission_date) }}</span>
        </template>
        <template #item.payer_name="{ item }">
          <span class="dal-clip">{{ item.payer_name ?? "—" }}</span>
        </template>
        <template #item.deal_code="{ item }">
          <bdi>{{ item.deal_code ?? "—" }}</bdi>
        </template>
        <template #item.amount="{ item }">
          <bdi class="commission-amount">{{
            formatAmount(item.amount, item.currency)
          }}</bdi>
        </template>
        <template #item.outstanding="{ item }">
          <bdi class="commission-amount">{{
            item.status === "cancelled"
              ? "—"
              : formatAmount(item.outstanding, item.currency)
          }}</bdi>
        </template>
        <template #item.status="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="stateOf(item).color"
            >{{ stateOf(item).title }}</v-chip
          >
        </template>
      </DataGrid>
    </section>

    <section
      v-else
      class="dal-panel payable"
      aria-label="حصص الموظفين المستحقة"
    >
      <v-progress-linear
        v-if="payableLoading && !payable.length"
        indeterminate
      />
      <v-alert v-else-if="payableError" type="error" variant="tonal">{{
        payableError
      }}</v-alert>
      <v-empty-state
        v-else-if="!payable.length"
        icon="mdi-account-cash-outline"
        title="لا حصص مستحقة"
        text="حصص الموظفين من العمولات مدفوعة بالكامل."
      />
      <v-table v-else density="compact">
        <thead>
          <tr>
            <th scope="col">الموظف</th>
            <th scope="col">العمولة</th>
            <th scope="col">الصفقة</th>
            <th scope="col" class="commission-amount">الحصة</th>
            <th scope="col" class="commission-amount">المدفوع</th>
            <th scope="col" class="commission-amount">المتبقي</th>
            <th scope="col"><span class="d-sr-only">دفع</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="share in payable" :key="share.id">
            <td>{{ share.user_name }}</td>
            <td>
              <router-link
                :to="`/accounting/commissions/${share.commission_id}`"
                ><bdi>{{ share.commission_code }}</bdi></router-link
              >
            </td>
            <td>
              <bdi>{{ share.deal_code ?? "—" }}</bdi>
            </td>
            <td class="commission-amount">
              <bdi>{{ formatAmount(share.amount, share.currency) }}</bdi>
            </td>
            <td class="commission-amount">
              <bdi>{{ formatAmount(share.paid, share.currency) }}</bdi>
            </td>
            <td class="commission-amount">
              <bdi>{{ formatAmount(share.outstanding, share.currency) }}</bdi>
            </td>
            <td class="text-end">
              <v-btn
                v-if="can('vouchers.payment')"
                variant="tonal"
                size="small"
                prepend-icon="mdi-cash-minus"
                @click="pay(share)"
                >دفع</v-btn
              >
            </td>
          </tr>
        </tbody>
      </v-table>
    </section>

    <VoucherDialog
      v-model="payDialog"
      kind="payment"
      :preset="payPreset"
      :allocation-note="payNote"
      @saved="onPaid"
    />
  </AppPage>
</template>

<style scoped>
.commission-amount {
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.payable {
  padding: 8px 12px;
}
</style>
