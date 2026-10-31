<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import TaskDialog from "../components/tasks/TaskDialog.vue";
import type { GridHeader, RowAction } from "../components/shared/grid";
import * as tasksService from "../services/tasks.service";
import * as activitiesService from "../services/activities.service";
import * as saleFollowups from "../services/followups.service";
import * as rentalFollowups from "../services/rental-followups.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useNewFromQuery } from "../composables/useNewFromQuery";
import { useAssignees } from "../composables/useAssignees";
import { createPagedList } from "../composables/usePagedList";
import {
  FOLLOWUP_TYPES,
  TASKS_DEFAULT_SORT,
  followupTypeIcon,
  followupTypeLabel,
  taskPriorityColor,
  taskPriorityLabel,
  taskStatusColor,
  taskStatusLabel,
} from "../constants/crm";
import { formatDateTime } from "../utils/format";
import type {
  FollowupType,
  TaskDialogValue,
  TaskFieldsPayload,
  TaskFilters,
  TaskRecord,
  TaskSortKey,
  TaskSource,
} from "../types";

/**
 * المهام والمتابعات: متابعات عروض البيع والإيجار ونشاطات الزبائن في جدول
 * واحد، بقدر صلاحيات المستخدم. الافتراضي: المفتوح المكلّف به المستخدم أو بلا
 * مكلّف، الأقرب موعداً أولاً. Enter يفتح المهمة للتعديل، والقائمة تنجزها أو
 * تعيد فتحها أو تؤجلها أو تفتح سجلها.
 */
const router = useRouter();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { assignees, loadAssignees } = useAssignees();

const SOURCE_INDEX: Record<TaskSource, number> = {
  sale_followup: 0,
  rental_followup: 1,
  activity: 2,
};
/** الجدول يحتاج معرّفاً رقمياً فريداً؛ المصادر الثلاثة تتشارك الأرقام. */
type TaskRow = TaskRecord & { task_id: number };
const toRow = (task: TaskRecord): TaskRow => ({
  ...task,
  task_id: task.id,
  id: task.id * 3 + SOURCE_INDEX[task.source],
});

const STATUS_FILTERS = [
  { title: "المفتوحة", value: "open" },
  { title: "المتأخرة", value: "overdue" },
  { title: "المنجزة", value: "done" },
  { title: "الملغاة", value: "cancelled" },
  { title: "الكل", value: "all" },
];
const DUE_FILTERS = [
  { title: "اليوم", value: "today" },
  { title: "الأيام السبعة القادمة", value: "week" },
  { title: "متأخرة", value: "overdue" },
  { title: "بلا موعد", value: "none" },
];

const status = ref<NonNullable<TaskFilters["status"]>>("open");
const assigned = ref<TaskFilters["assigned"] | null>(null);
const dueQuery = useRoute().query.due;
// ?due=today|week|overdue (from the dashboard and the notification center).
const due = ref<TaskFilters["due"] | null>(
  (DUE_FILTERS.find((item) => item.value === dueQuery)?.value as
    TaskFilters["due"] | undefined) ?? null,
);
const type = ref<FollowupType | null>(null);
const q = ref("");
const assigneeFilters = computed(() => [
  { title: "مهامي", value: "me" },
  { title: "بلا مكلّف", value: "unassigned" },
  ...assignees.value.map((user) => ({
    title: user.display_name,
    value: user.id,
  })),
]);

const list = createPagedList<TaskRow, TaskSortKey>(async (page, signal) => {
  const result = await tasksService.listTasksPage(
    {
      status: status.value,
      assigned: assigned.value ?? undefined,
      due: due.value ?? undefined,
      type: type.value ?? undefined,
      q: q.value.trim() || undefined,
    },
    page,
    signal,
  );
  return { ...result, items: result.items.map(toRow) };
}, TASKS_DEFAULT_SORT);
const { items, total, loading, error, page, pageSize, sortBy, onTableOptions } =
  list;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch([status, assigned, due, type], () => void list.loadFirstPage());
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void list.loadFirstPage(), 300);
});
const hasFilters = computed(() =>
  Boolean(
    status.value !== "open" ||
    assigned.value ||
    due.value ||
    type.value ||
    q.value,
  ),
);
function clearFilters() {
  status.value = "open";
  assigned.value = null;
  due.value = null;
  type.value = null;
  q.value = "";
}

const headers: GridHeader[] = [
  { key: "type", title: "المهمة" },
  { key: "scheduled_at", title: "الموعد", sortable: true },
  { key: "priority", title: "الأولوية", sortable: true, priority: 2 },
  { key: "status", title: "الحالة" },
  { key: "linked", title: "تخص", priority: 1 },
  { key: "assigned_user_name", title: "المكلّف", priority: 2 },
  { key: "actions", title: "", align: "end", width: 96 },
];

const UPDATE_PERMISSION: Record<TaskSource, string> = {
  sale_followup: "followups.update",
  rental_followup: "rentals.followups.update",
  activity: "followups.update",
};
const canUpdate = (task: TaskRow) => can(UPDATE_PERMISSION[task.source]);

/** سجل المهمة: العرض أو الإيجار، وإلا الزبون. */
function recordOf(task: TaskRow) {
  if (task.property_id) return `/properties/${task.property_id}`;
  if (task.rental_id) return `/rentals/${task.rental_id}`;
  if (task.person_id) return `/clients/${task.person_id}`;
  return null;
}

async function patch(
  task: TaskRow,
  change: Parameters<typeof tasksService.patchTask>[2],
  message: string,
) {
  try {
    await tasksService.patchTask(task.source, task.task_id, change);
    notifySuccess(message);
    await list.reload();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}

// حوار المهمة: تعديل مهمة قائمة بكامل حقولها، أو إضافة مهمة لزبون.
const dialog = ref(false);
const editing = ref<TaskRow | null>(null);
const dialogInitial = computed<Partial<TaskDialogValue> | null>(() =>
  editing.value
    ? {
        id: editing.value.task_id,
        type: editing.value.type,
        notes: editing.value.notes,
        scheduled_at: editing.value.scheduled_at,
        status: editing.value.status,
        priority: editing.value.priority,
        assigned_user_id: editing.value.assigned_user_id,
        person_id: editing.value.person_id,
        outcome: editing.value.outcome,
      }
    : { type: "task" },
);
const completing = ref(false);
function openEdit(task: TaskRow, complete = false) {
  editing.value = task;
  completing.value = complete;
  dialog.value = true;
}
function openCreate() {
  editing.value = null;
  completing.value = false;
  dialog.value = true;
}
useNewFromQuery(() => {
  if (can("followups.create") && can("people.read")) openCreate();
});
async function saveTask(value: TaskFieldsPayload) {
  const task = editing.value;
  if (!task) {
    await activitiesService.createActivity({
      ...value,
      person_id: value.person_id!,
    });
    notifySuccess("تمت إضافة المهمة.");
  } else if (task.source === "activity") {
    await activitiesService.updateActivity(task.task_id, {
      ...value,
      person_id: value.person_id ?? task.person_id!,
      purchase_request_id: task.purchase_request_id,
      rental_request_id: task.rental_request_id,
    });
  } else if (task.source === "sale_followup") {
    await saleFollowups.updateFollowup(task.property_id!, task.task_id, value);
  } else {
    await rentalFollowups.updateRentalFollowup(
      task.rental_id!,
      task.task_id,
      value,
    );
  }
  if (task) notifySuccess("تم حفظ المهمة.");
  await list.reload();
}

function actionsOf(task: TaskRow): RowAction[] {
  const actions: RowAction[] = [];
  const record = recordOf(task);
  if (canUpdate(task)) {
    if (task.status === "open")
      actions.push({
        key: "done",
        label: "إنجاز وتسجيل النتيجة",
        icon: "mdi-check-circle-outline",
        inline: true,
        run: () => openEdit({ ...task, status: "done" }, true),
      });
    else
      actions.push({
        key: "reopen",
        label: "إعادة فتح",
        icon: "mdi-restore",
        run: () => void patch(task, { status: "open" }, "أُعيد فتح المهمة."),
      });
    actions.push({
      key: "edit",
      label: "تعديل",
      icon: "mdi-pencil-outline",
      inline: true,
      run: () => openEdit(task),
    });
    if (task.status === "open") {
      actions.push({
        key: "tomorrow",
        label: "تأجيل إلى الغد",
        icon: "mdi-calendar-arrow-right",
        run: () => {
          const next = new Date(task.scheduled_at ?? Date.now());
          next.setDate(next.getDate() + 1);
          void patch(
            task,
            { scheduled_at: next.toISOString() },
            "أُجّلت المهمة يوماً.",
          );
        },
      });
      actions.push({
        key: "cancel",
        label: "إلغاء المهمة",
        icon: "mdi-close-circle-outline",
        danger: true,
        run: () => void patch(task, { status: "cancelled" }, "أُلغيت المهمة."),
      });
    }
  }
  if (record)
    actions.push({
      key: "record",
      label:
        task.property_id || task.rental_id ? "فتح العرض" : "فتح ملف الزبون",
      icon: "mdi-open-in-app",
      run: () => void router.push(record),
    });
  return actions;
}

function linkedLabel(task: TaskRow) {
  return [
    task.person_name,
    task.listing_name ?? task.listing_code,
    task.request_code,
  ]
    .filter(Boolean)
    .join(" · ");
}

void list.reload();
onMounted(() => {
  setRefreshHandler(list.reload);
  void loadAssignees();
});
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  list.cancel();
});
</script>

<template>
  <AppPage title="المهام والمتابعات" :count="loading && !total ? null : total">
    <template #header-actions>
      <v-btn
        v-if="can('followups.create') && can('people.read')"
        color="primary"
        prepend-icon="mdi-plus"
        @click="openCreate"
        >مهمة لزبون</v-btn
      >
    </template>

    <section class="dal-panel dal-listpanel dal-fill" aria-label="المهام">
      <div class="dal-toolbar">
        <div class="dal-toolbar__row dal-toolbar__row--single">
          <v-text-field
            v-model="q"
            class="dal-toolbar__search"
            label="بحث في الملاحظات والنتائج"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
          />
          <v-select
            v-model="status"
            :items="STATUS_FILTERS"
            label="الحالة"
            hide-details
            class="dal-toolbar__filter"
          />
          <v-select
            v-model="assigned"
            :items="assigneeFilters"
            label="المكلّف"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-select
            v-model="due"
            :items="DUE_FILTERS"
            label="الموعد"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-select
            v-model="type"
            :items="FOLLOWUP_TYPES"
            label="النوع"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-btn
            v-if="hasFilters"
            size="small"
            variant="text"
            @click="clearFilters"
            >مسح الفلاتر</v-btn
          >
        </div>
      </div>
      <DataGrid
        v-model:page="page"
        v-model:items-per-page="pageSize"
        v-model:sort-by="sortBy"
        grid-key="tasks"
        table-label="جدول المهام والمتابعات"
        :items="items"
        :headers="headers"
        :total="total"
        :loading="loading"
        :error="error"
        :has-filters="hasFilters"
        :actions="actionsOf"
        :row-label="
          (task) => `${followupTypeLabel(task.type)} · ${linkedLabel(task)}`
        "
        :empty="{
          icon: 'mdi-clipboard-check-outline',
          title: 'لا توجد مهام مفتوحة',
          text: 'المتابعات ذات المواعيد على العروض والإيجارات ومهام الزبائن تظهر هنا.',
        }"
        :no-match="{ title: 'لا توجد مهام مطابقة للفلاتر الحالية' }"
        @open="(task) => (canUpdate(task) ? openEdit(task) : undefined)"
        @retry="list.reload"
        @clear-filters="clearFilters"
        @options="onTableOptions"
      >
        <template #item.type="{ item }">
          <div class="task-cell">
            <v-icon
              :icon="followupTypeIcon(item.type)"
              size="18"
              aria-hidden="true"
            />
            <div class="dal-cell-name">
              <strong>{{ followupTypeLabel(item.type) }}</strong>
              <span class="dal-clip" :title="item.notes ?? ''">{{
                item.notes || "—"
              }}</span>
            </div>
          </div>
        </template>
        <template #item.scheduled_at="{ item }">
          <bdi dir="rtl" :class="{ 'task-overdue': item.overdue }">{{
            item.scheduled_at ? formatDateTime(item.scheduled_at) : "بلا موعد"
          }}</bdi>
        </template>
        <template #item.priority="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="taskPriorityColor(item.priority)"
            >{{ taskPriorityLabel(item.priority) }}</v-chip
          >
        </template>
        <template #item.status="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="item.overdue ? 'error' : taskStatusColor(item.status)"
            >{{
              item.overdue ? "متأخرة" : taskStatusLabel(item.status)
            }}</v-chip
          >
        </template>
        <template #item.linked="{ item }">
          <span class="dal-clip" :title="linkedLabel(item)">{{
            linkedLabel(item) || "—"
          }}</span>
        </template>
        <template #item.assigned_user_name="{ item }">{{
          item.assigned_user_name || "—"
        }}</template>
        <template #empty-actions>
          <v-btn
            v-if="can('followups.create') && can('people.read')"
            color="primary"
            prepend-icon="mdi-plus"
            @click="openCreate"
            >مهمة لزبون</v-btn
          >
        </template>
      </DataGrid>
    </section>

    <TaskDialog
      v-model="dialog"
      :title="
        editing ? (completing ? 'إنجاز المهمة' : 'تعديل المهمة') : 'مهمة لزبون'
      "
      :subtitle="editing ? linkedLabel(editing) : ''"
      :initial="dialogInitial"
      :person="
        editing
          ? editing.source === 'activity'
            ? 'required'
            : 'optional'
          : 'required'
      "
      :save="saveTask"
    />
  </AppPage>
</template>

<style scoped>
.task-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.task-overdue {
  color: rgb(var(--v-theme-error));
  font-weight: 600;
}
</style>
