<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import * as followupsService from "../../services/followups.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { useConfirm } from "../../composables/useConfirm";
import type { FollowupRecord, FollowupType } from "../../types";
import { formatDateTime } from "../../utils/format";
import {
  FOLLOWUP_TYPES,
  followupTypeIcon,
  followupTypeLabel,
} from "../../constants/crm";

const props = defineProps<{ propertyId: number }>();

const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();
const { openConfirm } = useConfirm();

const followups = ref<FollowupRecord[]>([]);
const loading = ref(false);
// فشل التحميل يُعرض مكانه مع إعادة، لا «لا توجد متابعات».
const loadError = ref<string | null>(null);
const saving = ref(false);
const dialog = ref(false);
const editingId = ref<number | null>(null);
const form = ref<{ type: FollowupType; notes: string; scheduled_at: string }>({
  type: "phone_call",
  notes: "",
  scheduled_at: "",
});

function fmt(value: string | null) {
  return value ? formatDateTime(value) : "";
}
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    followups.value = await followupsService.listFollowups(props.propertyId);
  } catch (error) {
    loadError.value = getErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function openDialog(followup?: FollowupRecord) {
  editingId.value = followup?.id ?? null;
  form.value = {
    type: (followup?.type as FollowupType) ?? "phone_call",
    notes: followup?.notes ?? "",
    scheduled_at: toLocalInput(followup?.scheduled_at ?? null),
  };
  dialog.value = true;
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const payload = {
      type: form.value.type,
      notes: form.value.notes || null,
      scheduled_at: form.value.scheduled_at
        ? new Date(form.value.scheduled_at).toISOString()
        : null,
    };
    if (editingId.value !== null) {
      await followupsService.updateFollowup(
        props.propertyId,
        editingId.value,
        payload,
      );
    } else {
      await followupsService.createFollowup(props.propertyId, payload);
    }
    dialog.value = false;
    await load();
    notifySuccess("تم حفظ المتابعة.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    saving.value = false;
  }
}

function askDelete(followup: FollowupRecord) {
  openConfirm({
    title: "حذف المتابعة",
    body: "هل تريد حذف هذه المتابعة؟",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await followupsService.deleteFollowup(props.propertyId, followup.id);
      await load();
      notifySuccess("تم حذف المتابعة.");
    },
  });
}

watch(() => props.propertyId, load);
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
        v-if="can('followups.create')"
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
        dot-color="primary"
      >
        <template #icon>
          <v-icon :icon="followupTypeIcon(item.type)" />
        </template>
        <div class="d-flex">
          <div class="flex-grow-1">
            <div class="font-weight-medium">
              {{ followupTypeLabel(item.type) }}
            </div>
            <div v-if="item.notes" class="text-body-2">{{ item.notes }}</div>
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
            </div>
          </div>
          <div>
            <v-btn
              v-if="can('followups.update')"
              icon="mdi-pencil-outline"
              size="small"
              variant="text"
              title="تعديل"
              :aria-label="`تعديل متابعة ${followupTypeLabel(item.type)}`"
              @click="openDialog(item)"
            />
            <v-btn
              v-if="can('followups.delete')"
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

    <v-dialog
      v-model="dialog"
      width="520"
      :persistent="saving"
      :aria-label="editingId ? 'تعديل متابعة' : 'إضافة متابعة'"
    >
      <v-card tag="form" @submit.prevent="save">
        <v-card-title>{{
          editingId ? "تعديل متابعة" : "إضافة متابعة"
        }}</v-card-title>
        <v-card-text>
          <v-select v-model="form.type" :items="FOLLOWUP_TYPES" label="النوع" />
          <v-textarea v-model="form.notes" label="الملاحظات" rows="3" />
          <v-text-field
            v-model="form.scheduled_at"
            label="موعد المتابعة (اختياري)"
            type="datetime-local"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="dialog = false"
            >إلغاء</v-btn
          >
          <v-btn color="primary" variant="flat" type="submit" :loading="saving"
            >حفظ</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.followups__title {
  margin: 0;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
}
</style>
