<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import TaskDialog from "../tasks/TaskDialog.vue";
import * as saleFollowups from "../../services/followups.service";
import * as rentalFollowups from "../../services/rental-followups.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { useConfirm } from "../../composables/useConfirm";
import type {
  FollowupRecord,
  RentalFollowupRecord,
  TaskDialogValue,
  TaskFieldsPayload,
} from "../../types";
import { formatDateTime } from "../../utils/format";
import {
  followupTypeIcon,
  followupTypeLabel,
  taskPriorityColor,
  taskPriorityLabel,
  taskStatusColor,
  taskStatusLabel,
} from "../../constants/crm";

/**
 * سجل متابعات العرض، واحد لعروض البيع والإيجار: خط زمني بالأحدث أولاً بحالة
 * كل متابعة ومكلّفها ونتيجتها، وإضافة وتعديل في حوار المهمة المشترك
 * (TaskDialog)، وحذف بعد تأكيد. kind يختار الخدمة والصلاحيات (followups.*
 * أو rentals.followups.*).
 */
const props = defineProps<{ kind: "sale" | "rental"; listingId: number }>();

type Item = FollowupRecord | RentalFollowupRecord;
type Payload = TaskFieldsPayload;
const api = computed(() =>
  props.kind === "sale"
    ? {
        list: (id: number) => saleFollowups.listFollowups(id),
        create: (id: number, p: Payload) => saleFollowups.createFollowup(id, p),
        update: (id: number, f: number, p: Payload) =>
          saleFollowups.updateFollowup(id, f, p),
        remove: (id: number, f: number) => saleFollowups.deleteFollowup(id, f),
      }
    : {
        list: (id: number) => rentalFollowups.listRentalFollowups(id),
        create: (id: number, p: Payload) =>
          rentalFollowups.createRentalFollowup(id, p),
        update: (id: number, f: number, p: Payload) =>
          rentalFollowups.updateRentalFollowup(id, f, p),
        remove: (id: number, f: number) =>
          rentalFollowups.deleteRentalFollowup(id, f),
      },
);
const perm = (action: "create" | "update" | "delete") =>
  can(
    props.kind === "sale"
      ? `followups.${action}`
      : `rentals.followups.${action}`,
  );

const { can } = usePermissions();
const { notifySuccess } = useSnackbar();
const { openConfirm } = useConfirm();

const followups = ref<Item[]>([]);
const loading = ref(false);
// فشل التحميل يُعرض مكانه مع إعادة، لا «لا توجد متابعات».
const loadError = ref<string | null>(null);
const dialog = ref(false);
const editing = ref<Partial<TaskDialogValue> | null>(null);
const completing = ref(false);

function fmt(value: string | null) {
  return value ? formatDateTime(value) : "";
}
const isOverdue = (item: Item) =>
  item.status === "open" &&
  Boolean(item.scheduled_at) &&
  new Date(item.scheduled_at!).getTime() < Date.now();

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    followups.value = await api.value.list(props.listingId);
  } catch (error) {
    loadError.value = getErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function openDialog(followup?: Item, complete = false) {
  completing.value = complete;
  editing.value = followup
    ? {
        id: followup.id,
        type: followup.type,
        notes: followup.notes,
        scheduled_at: followup.scheduled_at,
        status: complete ? "done" : followup.status,
        priority: followup.priority,
        assigned_user_id: followup.assigned_user_id,
        person_id: followup.person_id,
        outcome: followup.outcome,
      }
    : null;
  dialog.value = true;
}

/** حوار المهمة يعرض الخطأ في مكانه؛ هنا الحفظ ثم إعادة التحميل. */
async function save(payload: Payload) {
  if (editing.value?.id)
    await api.value.update(props.listingId, editing.value.id, payload);
  else await api.value.create(props.listingId, payload);
  notifySuccess("تم حفظ المتابعة.");
  await load().catch(() => undefined);
}

function askDelete(followup: Item) {
  openConfirm({
    title: "حذف المتابعة",
    body: "هل تريد حذف هذه المتابعة؟",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await api.value.remove(props.listingId, followup.id);
      await load();
      notifySuccess("تم حذف المتابعة.");
    },
  });
}

watch(() => props.listingId, load);
onMounted(load);

/** للصفحة: بعد «تسجيل متابعة» من شريط الأوامر. */
defineExpose({ reload: load });
</script>

<template>
  <div>
    <div class="d-flex align-center mb-2">
      <h2 class="followups__title">سجل المتابعات</h2>
      <v-spacer />
      <v-btn
        v-if="perm('create')"
        color="primary"
        prepend-icon="mdi-plus"
        @click="openDialog()"
      >
        إضافة متابعة
      </v-btn>
    </div>

    <v-progress-linear
      v-if="loading"
      indeterminate
      color="primary"
      class="mb-2"
    />
    <v-alert
      v-else-if="loadError"
      type="error"
      variant="tonal"
      density="compact"
    >
      تعذر تحميل المتابعات: {{ loadError }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>
    <v-empty-state
      v-else-if="!followups.length"
      icon="mdi-clipboard-text-clock-outline"
      title="لا توجد متابعات"
      text="سجّل اتصالاً أو معاينة أو موعداً ليظهر هنا."
    />
    <v-timeline v-else density="compact" side="end" align="start">
      <v-timeline-item
        v-for="item in followups"
        :key="item.id"
        size="x-small"
        :dot-color="isOverdue(item) ? 'error' : taskStatusColor(item.status)"
      >
        <template #icon>
          <v-icon :icon="followupTypeIcon(item.type)" />
        </template>
        <div class="d-flex">
          <div class="flex-grow-1">
            <div class="followups__head">
              <span class="font-weight-medium">{{
                followupTypeLabel(item.type)
              }}</span>
              <v-chip
                size="x-small"
                variant="tonal"
                label
                :color="
                  isOverdue(item) ? 'error' : taskStatusColor(item.status)
                "
                >{{
                  isOverdue(item) ? "متأخرة" : taskStatusLabel(item.status)
                }}</v-chip
              >
              <v-chip
                v-if="item.priority !== 'normal'"
                size="x-small"
                variant="tonal"
                label
                :color="taskPriorityColor(item.priority)"
                >{{ taskPriorityLabel(item.priority) }}</v-chip
              >
            </div>
            <div v-if="item.notes" class="text-body-2">{{ item.notes }}</div>
            <div v-if="item.outcome" class="text-body-2">
              <strong>النتيجة:</strong> {{ item.outcome }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ item.user_name || "—" }} · {{ fmt(item.created_at) }}
              <span v-if="item.scheduled_at">
                ·
                <v-icon
                  icon="mdi-calendar-clock"
                  size="14"
                  aria-hidden="true"
                />
                موعد: {{ fmt(item.scheduled_at) }}
              </span>
              <span v-if="item.assigned_user_name">
                · المكلّف: {{ item.assigned_user_name }}</span
              >
              <span v-if="item.person_name">
                · الزبون: {{ item.person_name }}</span
              >
            </div>
          </div>
          <div>
            <v-btn
              v-if="perm('update') && item.status === 'open'"
              icon="mdi-check-circle-outline"
              size="small"
              variant="text"
              title="إنجاز"
              :aria-label="`إنجاز متابعة ${followupTypeLabel(item.type)}`"
              @click="openDialog(item, true)"
            />
            <v-btn
              v-if="perm('update')"
              icon="mdi-pencil-outline"
              size="small"
              variant="text"
              title="تعديل"
              :aria-label="`تعديل متابعة ${followupTypeLabel(item.type)}`"
              @click="openDialog(item)"
            />
            <v-btn
              v-if="perm('delete')"
              icon="mdi-delete-outline"
              size="small"
              variant="text"
              color="error"
              class="ms-2"
              title="حذف"
              :aria-label="`حذف متابعة ${followupTypeLabel(item.type)}`"
              @click="askDelete(item)"
            />
          </div>
        </div>
      </v-timeline-item>
    </v-timeline>

    <TaskDialog
      v-model="dialog"
      :title="
        editing
          ? completing
            ? 'إنجاز المتابعة'
            : 'تعديل متابعة'
          : 'إضافة متابعة'
      "
      :initial="editing"
      person="optional"
      :save="save"
    />
  </div>
</template>

<style scoped>
.followups__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.followups__title {
  margin: 0;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
}
</style>
