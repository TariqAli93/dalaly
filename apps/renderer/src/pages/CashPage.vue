<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AppPage from "../components/app/AppPage.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import TransferDialog from "../components/accounting/TransferDialog.vue";
import ReconciliationDialog from "../components/accounting/ReconciliationDialog.vue";
import type { GridHeader, RowAction } from "../components/shared/grid";
import * as cashService from "../services/cash.service";
import { getErrorMessage } from "../services/api.service";
import { createPagedList } from "../composables/usePagedList";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import { formatAmount, formatDate, todayIso } from "../utils/format";
import type {
  CashTransferRecord,
  ListSortOption,
  MoneyAccount,
  ReconciliationRecord,
  TransferSortKey,
} from "../types";

/**
 * الصناديق والمصارف: رصيد كل حساب اليوم أو في تاريخ يُختار، والتحويلات بينها،
 * ومطابقاتها مع الجرد أو كشف المصرف. لكل عملة حساباتها؛ لا تحويل بين العملات.
 */
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifySuccess } = useSnackbar();

// ─── الأرصدة ───────────────────────────────────────────────────────────
const asOf = ref("");
const balances = ref<MoneyAccount[]>([]);
const balancesError = ref<string | null>(null);
async function loadBalances() {
  balancesError.value = null;
  try {
    balances.value = await cashService.getBalances(asOf.value || undefined);
  } catch (cause) {
    balancesError.value = getErrorMessage(cause);
  }
}
watch(asOf, () => void loadBalances());
const totals = computed(() =>
  (["IQD", "USD"] as const).map((currency) => ({
    currency,
    accounts: balances.value.filter((account) => account.currency === currency),
  })),
);

// ─── التحويلات ─────────────────────────────────────────────────────────
const tab = ref<"transfers" | "reconciliations">("transfers");
const DEFAULT_SORT: ListSortOption<TransferSortKey> = {
  value: "transfer_date",
  title: "التاريخ",
  key: "transfer_date",
  order: "desc",
};
const list = createPagedList<CashTransferRecord, TransferSortKey>(
  (page, signal) => cashService.listTransfersPage({}, page, signal),
  DEFAULT_SORT,
);
const { items, total, loading, error, page, pageSize, sortBy, onTableOptions } =
  list;
const headers: GridHeader[] = [
  { key: "code", title: "التحويل", sortable: true },
  { key: "transfer_date", title: "التاريخ", sortable: true },
  { key: "route", title: "من ← إلى" },
  { key: "description", title: "البيان", priority: 2 },
  { key: "amount", title: "المبلغ", align: "end", sortable: true },
  { key: "status", title: "الحالة" },
  { key: "actions", title: "", align: "end", width: 64 },
];
function actionsOf(transfer: CashTransferRecord): RowAction[] {
  return transfer.status === "posted" && can("cash.manage")
    ? [
        {
          key: "void",
          label: "إلغاء التحويل",
          icon: "mdi-cancel",
          danger: true,
          run: () => openVoid(transfer),
        },
      ]
    : [];
}

// ─── المطابقات ─────────────────────────────────────────────────────────
const reconciliations = ref<ReconciliationRecord[]>([]);
const reconciliationsError = ref<string | null>(null);
async function loadReconciliations() {
  reconciliationsError.value = null;
  try {
    reconciliations.value = await cashService.listReconciliations();
  } catch (cause) {
    reconciliationsError.value = getErrorMessage(cause);
  }
}
watch(tab, (value) => {
  if (value === "reconciliations") void loadReconciliations();
});

// ─── الأوامر ───────────────────────────────────────────────────────────
const transferDialog = ref(false);
const transferFrom = ref<MoneyAccount | null>(null);
function openTransfer(from: MoneyAccount | null = null) {
  transferFrom.value = from;
  transferDialog.value = true;
}
function onTransferred(transfer: CashTransferRecord) {
  notifySuccess(`سُجّل التحويل ${transfer.code}.`);
  void reload();
}

const reconcileDialog = ref(false);
const reconcileAccount = ref<MoneyAccount | null>(null);
function openReconcile(account: MoneyAccount | null = null) {
  reconcileAccount.value = account;
  reconcileDialog.value = true;
}
function onReconciled(row: ReconciliationRecord) {
  notifySuccess(
    row.difference === "0.00"
      ? `سُجّلت المطابقة ${row.code}: الدفاتر تطابق.`
      : `سُجّلت المطابقة ${row.code}؛ الفرق ${formatAmount(row.difference, row.currency)}.`,
  );
  tab.value = "reconciliations";
  void reload();
}

const voidDialog = ref(false);
const voiding = ref<CashTransferRecord | null>(null);
const voidDate = ref(todayIso());
const voidReason = ref("");
const voidError = ref("");
const voidBusy = ref(false);
function openVoid(transfer: CashTransferRecord) {
  voiding.value = transfer;
  voidDate.value = todayIso();
  voidReason.value = "";
  voidError.value = "";
  voidDialog.value = true;
}
async function confirmVoid() {
  const transfer = voiding.value;
  if (!transfer || voidBusy.value) return;
  if (!voidReason.value.trim()) {
    voidError.value = "اذكر سبب إلغاء التحويل.";
    return;
  }
  voidBusy.value = true;
  voidError.value = "";
  try {
    await cashService.voidTransfer(transfer.id, {
      void_date: voidDate.value,
      reason: voidReason.value.trim(),
    });
    voidDialog.value = false;
    notifySuccess(`أُلغي التحويل ${transfer.code}.`);
    void reload();
  } catch (cause) {
    voidError.value = getErrorMessage(cause);
  } finally {
    voidBusy.value = false;
  }
}

async function reload() {
  await Promise.all([
    loadBalances(),
    list.reload(),
    tab.value === "reconciliations" ? loadReconciliations() : undefined,
  ]);
}
// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void list.loadFirstPage();
onMounted(() => {
  setRefreshHandler(reload);
  void loadBalances();
});
</script>

<template>
  <AppPage title="الصناديق والمصارف">
    <template #header-actions>
      <v-btn
        v-if="can('cash.manage')"
        variant="tonal"
        prepend-icon="mdi-scale-balance"
        @click="openReconcile()"
        >مطابقة</v-btn
      >
      <v-btn
        v-if="can('cash.manage')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-swap-horizontal"
        @click="openTransfer()"
        >تحويل</v-btn
      >
    </template>

    <section class="dal-panel cash-balances" aria-label="الأرصدة">
      <div class="cash-balances__bar">
        <h2 class="cash-balances__title">
          الأرصدة
          <span v-if="asOf" class="text-medium-emphasis"
            >في {{ formatDate(asOf) }}</span
          >
        </h2>
        <v-text-field
          v-model="asOf"
          type="date"
          label="في تاريخ"
          density="compact"
          hide-details
          clearable
          class="cash-balances__date"
        />
      </div>
      <v-alert v-if="balancesError" type="error" variant="tonal">{{
        balancesError
      }}</v-alert>
      <div v-for="group in totals" :key="group.currency" class="cash-group">
        <div
          v-for="account in group.accounts"
          :key="account.id"
          class="cash-card"
        >
          <div class="cash-card__head">
            <v-icon
              :icon="account.kind === 'cash' ? 'mdi-cash' : 'mdi-bank-outline'"
              size="20"
            />
            <span>{{ account.name }}</span>
          </div>
          <bdi
            class="cash-card__balance"
            :class="{ 'text-error': account.balance.startsWith('-') }"
            >{{ formatAmount(account.balance, account.currency) }}</bdi
          >
          <div v-if="can('cash.manage') && !asOf" class="cash-card__actions">
            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-swap-horizontal"
              @click="openTransfer(account)"
              >تحويل منه</v-btn
            >
            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-scale-balance"
              @click="openReconcile(account)"
              >مطابقة</v-btn
            >
          </div>
        </div>
      </div>
    </section>

    <v-tabs v-model="tab" class="mt-4" density="compact">
      <v-tab value="transfers">التحويلات</v-tab>
      <v-tab value="reconciliations">المطابقات</v-tab>
    </v-tabs>

    <section
      v-if="tab === 'transfers'"
      class="dal-panel dal-listpanel cash-list"
      aria-label="التحويلات"
    >
      <DataGrid
        v-model:page="page"
        v-model:items-per-page="pageSize"
        v-model:sort-by="sortBy"
        grid-key="cash-transfers"
        table-label="جدول التحويلات"
        :items="items"
        :headers="headers"
        :total="total"
        :loading="loading"
        :error="error"
        :actions="actionsOf"
        :row-label="(transfer) => `${transfer.code} · ${transfer.description}`"
        :empty="{
          icon: 'mdi-swap-horizontal',
          title: 'لا تحويلات بعد',
          text: 'التحويل ينقل المال بين صندوق ومصرف بالعملة نفسها.',
        }"
        @retry="list.reload"
        @options="onTableOptions"
      >
        <template #item.code="{ item }">
          <bdi class="font-weight-medium">{{ item.code }}</bdi>
        </template>
        <template #item.transfer_date="{ item }">
          <span>{{ formatDate(item.transfer_date) }}</span>
        </template>
        <template #item.route="{ item }">
          {{ item.from_account_name }} ← {{ item.to_account_name }}
        </template>
        <template #item.description="{ item }">
          <span class="dal-clip">{{ item.description }}</span>
        </template>
        <template #item.amount="{ item }">
          <bdi class="cash-amount">{{
            formatAmount(item.amount, item.currency)
          }}</bdi>
        </template>
        <template #item.status="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="item.status === 'voided' ? 'error' : 'success'"
            >{{ item.status === "voided" ? "ملغى" : "مرحَّل" }}</v-chip
          >
        </template>
      </DataGrid>
    </section>

    <section v-else class="dal-panel cash-list" aria-label="المطابقات">
      <v-alert v-if="reconciliationsError" type="error" variant="tonal">{{
        reconciliationsError
      }}</v-alert>
      <v-empty-state
        v-else-if="!reconciliations.length"
        icon="mdi-scale-balance"
        title="لا مطابقات بعد"
        text="المطابقة تقارن الجرد أو كشف المصرف برصيد الدفاتر في تاريخه."
      />
      <v-table v-else density="compact">
        <thead>
          <tr>
            <th scope="col">المطابقة</th>
            <th scope="col">الحساب</th>
            <th scope="col">التاريخ</th>
            <th scope="col" class="cash-amount">المعدود أو الكشف</th>
            <th scope="col" class="cash-amount">الدفاتر</th>
            <th scope="col" class="cash-amount">الفرق</th>
            <th scope="col">التسوية</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in reconciliations" :key="row.id">
            <td>
              <bdi>{{ row.code }}</bdi>
            </td>
            <td>{{ row.account_name }}</td>
            <td>{{ formatDate(row.statement_date) }}</td>
            <td class="cash-amount">
              <bdi>{{ formatAmount(row.statement_balance, row.currency) }}</bdi>
            </td>
            <td class="cash-amount">
              <bdi>{{ formatAmount(row.book_balance, row.currency) }}</bdi>
            </td>
            <td
              class="cash-amount"
              :class="{
                'text-error': row.difference.startsWith('-'),
                'text-success':
                  row.difference !== '0.00' && !row.difference.startsWith('-'),
              }"
            >
              <bdi>{{ formatAmount(row.difference, row.currency) }}</bdi>
            </td>
            <td>
              <router-link
                v-if="row.adjustment_entry_id && can('accounting.read')"
                :to="`/accounting/journal/${row.adjustment_entry_id}`"
                ><bdi>{{ row.adjustment_entry_code }}</bdi></router-link
              >
              <span v-else-if="row.difference === '0.00'">تطابق</span>
              <span v-else class="text-medium-emphasis">غير مرحَّلة</span>
            </td>
          </tr>
        </tbody>
      </v-table>
    </section>

    <TransferDialog
      v-model="transferDialog"
      :from="transferFrom"
      @saved="onTransferred"
    />
    <ReconciliationDialog
      v-model="reconcileDialog"
      :account="reconcileAccount"
      @saved="onReconciled"
    />

    <v-dialog v-model="voidDialog" max-width="480" :persistent="voidBusy">
      <v-card tag="form" @submit.prevent="confirmVoid">
        <v-card-title>إلغاء التحويل {{ voiding?.code }}</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            يُرحَّل قيد عكسي يعيد المال إلى الحساب المحوَّل منه، ما دام في
            الحساب المحوَّل إليه.
          </p>
          <v-alert v-if="voidError" type="error" variant="tonal" class="mb-3">{{
            voidError
          }}</v-alert>
          <v-text-field
            v-model="voidDate"
            type="date"
            label="تاريخ الإلغاء"
            class="mb-3"
            hide-details
          />
          <v-text-field
            v-model="voidReason"
            label="سبب الإلغاء *"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="voidBusy" @click="voidDialog = false"
            >تراجع</v-btn
          >
          <v-btn color="error" variant="flat" type="submit" :loading="voidBusy"
            >إلغاء التحويل</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppPage>
</template>

<style scoped>
.cash-balances {
  padding: 12px 16px;
}
.cash-balances__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-block-end: 8px;
}
.cash-balances__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
}
.cash-balances__date {
  flex: 0 1 11rem;
}
.cash-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: 10px;
  margin-block-end: 10px;
}
.cash-card {
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
  padding: 10px 12px;
  display: grid;
  gap: 4px;
}
.cash-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
}
.cash-card__balance {
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.cash-card__actions {
  display: flex;
  gap: 4px;
  margin-inline-start: -8px;
}
.cash-list {
  margin-block-start: 8px;
  padding: 4px 8px;
}
.cash-amount {
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
