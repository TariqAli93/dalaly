<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import * as followupsService from "../../services/followups.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { useConfirm } from "../../composables/useConfirm";
import type { FollowupRecord, FollowupType } from "../../types";

const props = defineProps<{ propertyId: number }>();

const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();
const { openConfirm } = useConfirm();

const TYPES = [
  { title: "اتصال هاتفي", value: "phone_call" },
  { title: "اجتماع", value: "meeting" },
  { title: "معاينة", value: "visit" },
  { title: "تفاوض", value: "negotiation" },
  { title: "أخرى", value: "other" },
];

const ICONS: Record<string, string> = {
  phone_call: "mdi-phone",
  meeting: "mdi-account-group",
  visit: "mdi-home-search",
  negotiation: "mdi-handshake",
  other: "mdi-note-text-outline",
};

const followups = ref<FollowupRecord[]>([]);
const loading = ref(false);
const dialog = ref(false);
const editingId = ref<number | null>(null);
const form = ref<{ type: FollowupType; notes: string; scheduled_at: string }>({
  type: "phone_call",
  notes: "",
  scheduled_at: "",
});

function typeLabel(value: string) {
  return TYPES.find((t) => t.value === value)?.title ?? value;
}
function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString("ar-IQ") : "";
}
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function load() {
  loading.value = true;
  try {
    followups.value = await followupsService.listFollowups(props.propertyId);
  } catch (error) {
    notifyError(getErrorMessage(error));
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
  try {
    const payload = {
      type: form.value.type,
      notes: form.value.notes || null,
      scheduled_at: form.value.scheduled_at
        ? new Date(form.value.scheduled_at).toISOString()
        : null,
    };
    if (editingId.value !== null) {
      await followupsService.updateFollowup(props.propertyId, editingId.value, payload);
    } else {
      await followupsService.createFollowup(props.propertyId, payload);
    }
    dialog.value = false;
    await load();
    notifySuccess("تم حفظ المتابعة.");
  } catch (error) {
    notifyError(getErrorMessage(error));
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
</script>

<template>
  <div>
    <div class="d-flex align-center mb-2">
      <span class="text-subtitle-2">سجل المتابعات</span>
      <v-spacer />
      <v-btn
        v-if="can('followups.create')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="openDialog()"
      >
        إضافة متابعة
      </v-btn>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />
    <v-empty-state
      v-else-if="!followups.length"
      icon="mdi-clipboard-text-clock-outline"
      title="لا توجد متابعات"
    />
    <v-timeline v-else density="compact" side="end" align="start">
      <v-timeline-item
        v-for="item in followups"
        :key="item.id"
        size="x-small"
        dot-color="primary"
      >
        <template #icon>
          <v-icon :icon="ICONS[item.type]" size="small" />
        </template>
        <div class="d-flex">
          <div class="flex-grow-1">
            <div class="font-weight-medium">{{ typeLabel(item.type) }}</div>
            <div v-if="item.notes" class="text-body-2">{{ item.notes }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ item.user_name || "—" }} · {{ fmt(item.created_at) }}
              <span v-if="item.scheduled_at">
                · ⏰ موعد: {{ fmt(item.scheduled_at) }}
              </span>
            </div>
          </div>
          <div>
            <v-btn
              v-if="can('followups.update')"
              icon="mdi-pencil"
              size="x-small"
              variant="text"
              @click="openDialog(item)"
            />
            <v-btn
              v-if="can('followups.delete')"
              icon="mdi-delete-outline"
              size="x-small"
              variant="text"
              color="error"
              @click="askDelete(item)"
            />
          </div>
        </div>
      </v-timeline-item>
    </v-timeline>

    <v-dialog v-model="dialog" width="520">
      <v-card rounded="lg">
        <v-card-title>{{ editingId ? "تعديل متابعة" : "إضافة متابعة" }}</v-card-title>
        <v-card-text>
          <v-select v-model="form.type" :items="TYPES" label="النوع" />
          <v-textarea v-model="form.notes" label="الملاحظات" rows="3" />
          <v-text-field
            v-model="form.scheduled_at"
            label="موعد المتابعة (اختياري)"
            type="datetime-local"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="flat" @click="save">حفظ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
