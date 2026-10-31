<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import DataGrid from "../shared/DataGrid.vue";
import PhoneLink from "../shared/PhoneLink.vue";
import VoucherDialog from "../accounting/VoucherDialog.vue";
import TaskDialog from "../tasks/TaskDialog.vue";
import type { DataGridApi, GridHeader, RowAction } from "../shared/grid";
import * as leasesService from "../../services/leases.service";
import * as activitiesService from "../../services/activities.service";
import { createPagedList } from "../../composables/usePagedList";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { voucherKindLabel } from "../../constants/accounting";
import { formatAmount, formatDate } from "../../utils/format";
import { rentReceipt, type LeaseVoucher } from "../../utils/leaseVouchers";
import type {
  ListSortOption,
  OverdueInstallmentRecord,
  TaskDialogValue,
  TaskFieldsPayload,
  VoucherDetail,
} from "../../types";

/**
 * الأقساط المتأخرة في كل الإيجارات التي يقبض المكتب إيجارها: ما حلّ موعده
 * قبل اليوم ولم يُدفع كله، أقدمها أولاً، بمستأجره وهاتفه والمتبقي منه. يُحصَّل
 * القسط من هنا مباشرة بسند قبض لحساب المؤجر، أو تُسجَّل مهمة متابعة على
 * المستأجر (مطالبته) تظهر في المهام.
 */
const emit = defineEmits<{ changed: [] }>();
const router = useRouter();
const { can } = usePermissions();
const { notifySuccess } = useSnackbar();
const grid = useTemplateRef<DataGridApi>("grid");

// The list has one order (oldest first); the sort here is not sent.
const ORDER: ListSortOption<"due_date"> = {
  value: "due_date",
  title: "تاريخ الاستحقاق",
  key: "due_date",
  order: "asc",
};
const list = createPagedList<OverdueInstallmentRecord, "due_date">(
  (page) =>
    leasesService.listOverdueInstallments(
      {},
      { page: page.page, page_size: page.page_size },
    ),
  ORDER,
);
const { items, total, loading, error, page, pageSize, sortBy, onTableOptions } =
  list;

const headers: GridHeader[] = [
  { key: "lease_code", title: "الإيجار" },
  { key: "tenant_name", title: "المستأجر" },
  { key: "tenant_phone", title: "الهاتف", priority: 2 },
  { key: "landlord_name", title: "المؤجر", priority: 3 },
  { key: "due_date", title: "يُستحق في" },
  { key: "days_overdue", title: "التأخير" },
  { key: "left", title: "المتبقي", align: "end" },
  { key: "actions", title: "", align: "end", width: 64 },
];

const days = (count: number) =>
  count === 1
    ? "يوم واحد"
    : count === 2
      ? "يومان"
      : count <= 10
        ? `${count} أيام`
        : `${count} يوماً`;

const dialog = ref(false);
const current = ref<LeaseVoucher | null>(null);
function collect(row: OverdueInstallmentRecord) {
  current.value = rentReceipt(
    {
      id: row.lease_id,
      code: row.lease_code,
      currency: row.currency,
      landlord_person_id: row.landlord_person_id,
      landlord_name: row.landlord_name,
      tenant_person_id: row.tenant_person_id,
      tenant_name: row.tenant_name,
    },
    row,
  );
  dialog.value = true;
}
function onIssued(voucher: VoucherDetail) {
  notifySuccess(`صدر ${voucherKindLabel(voucher.kind)} ${voucher.code}.`);
  emit("changed");
  void list.reload();
}
// A follow-up on the tenant: an activity of theirs, listed with the tasks.
const taskDialog = ref(false);
const taskRow = ref<OverdueInstallmentRecord | null>(null);
const taskInitial = computed<Partial<TaskDialogValue> | null>(() =>
  taskRow.value
    ? {
        type: "phone_call",
        priority: taskRow.value.days_overdue > 30 ? "high" : "normal",
        // Dated, so it stays an open task until it is done.
        scheduled_at: tomorrowAtTen(),
        notes: `مطالبة بالقسط ${taskRow.value.seq} من الإيجار ${taskRow.value.lease_code}: المتبقي ${formatAmount(taskRow.value.left, taskRow.value.currency)}، استُحق في ${formatDate(taskRow.value.due_date)}.`,
      }
    : null,
);
function tomorrowAtTen() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
}
function followUp(row: OverdueInstallmentRecord) {
  taskRow.value = row;
  taskDialog.value = true;
}
async function saveTask(value: TaskFieldsPayload) {
  const row = taskRow.value;
  if (!row?.tenant_person_id) return;
  await activitiesService.createActivity({
    ...value,
    person_id: row.tenant_person_id,
  });
  notifySuccess(`سُجّلت متابعة على ${row.tenant_name ?? "المستأجر"}.`);
}

function openLease(row: OverdueInstallmentRecord) {
  grid.value?.remember(row.id);
  void router.push(`/leases/${row.lease_id}`);
}
function actionsOf(row: OverdueInstallmentRecord): RowAction[] {
  const actions: RowAction[] = [];
  if (can("vouchers.receipt"))
    actions.push({
      key: "collect",
      label: `تحصيل القسط ${row.seq}`,
      icon: "mdi-cash-plus",
      inline: true,
      run: () => collect(row),
    });
  if (row.tenant_person_id && can("followups.create") && can("people.read"))
    actions.push({
      key: "follow-up",
      label: "متابعة المستأجر",
      icon: "mdi-phone-clock",
      run: () => followUp(row),
    });
  actions.push({
    key: "open",
    label: "فتح الإيجار",
    icon: "mdi-open-in-app",
    run: () => openLease(row),
  });
  return actions;
}

const count = computed(() => total.value);
// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void list.loadFirstPage();
defineExpose({ reload: list.reload, count });
</script>

<template>
  <DataGrid
    ref="grid"
    v-model:page="page"
    v-model:items-per-page="pageSize"
    v-model:sort-by="sortBy"
    grid-key="lease-overdue"
    table-label="جدول الأقساط المتأخرة"
    :items="items"
    :headers="headers"
    :total="total"
    :loading="loading"
    :error="error"
    :actions="actionsOf"
    :row-label="(row) => `${row.lease_code} · القسط ${row.seq}`"
    :empty="{
      icon: 'mdi-calendar-check-outline',
      title: 'لا أقساط متأخرة',
      text: 'كل قسط حلّ موعده في الإيجارات التي يقبضها المكتب مدفوع.',
    }"
    @open="openLease"
    @retry="list.reload"
    @options="onTableOptions"
  >
    <template #item.lease_code="{ item }">
      <bdi class="font-weight-medium">{{ item.lease_code }}</bdi>
      <span class="text-medium-emphasis"> · القسط {{ item.seq }}</span>
    </template>
    <template #item.tenant_name="{ item }">
      <span class="dal-clip">{{ item.tenant_name ?? "—" }}</span>
    </template>
    <template #item.tenant_phone="{ item }">
      <PhoneLink v-if="item.tenant_phone" :phone="item.tenant_phone" />
      <span v-else>—</span>
    </template>
    <template #item.landlord_name="{ item }">
      <span class="dal-clip">{{ item.landlord_name ?? "—" }}</span>
    </template>
    <template #item.due_date="{ item }">
      <span class="overdue-nowrap">{{ formatDate(item.due_date) }}</span>
    </template>
    <template #item.days_overdue="{ item }">
      <span class="overdue-nowrap text-error">{{
        days(item.days_overdue)
      }}</span>
    </template>
    <template #item.left="{ item }">
      <span class="overdue-nowrap overdue-amount"
        ><bdi>{{ formatAmount(item.left, item.currency) }}</bdi></span
      >
    </template>
  </DataGrid>

  <VoucherDialog
    v-model="dialog"
    :kind="current?.kind ?? 'receipt'"
    :preset="current?.preset ?? null"
    :allocation-note="current?.note ?? null"
    @saved="onIssued"
  />
  <TaskDialog
    v-model="taskDialog"
    title="متابعة المستأجر"
    :subtitle="
      taskRow
        ? `${taskRow.tenant_name ?? ''} · ${taskRow.lease_code} القسط ${taskRow.seq}`
        : ''
    "
    :initial="taskInitial"
    person="hidden"
    :save="saveTask"
  />
</template>

<style scoped>
.overdue-nowrap {
  white-space: nowrap;
}
.overdue-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
</style>
