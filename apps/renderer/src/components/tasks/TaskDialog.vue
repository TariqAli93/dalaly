<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import PersonPicker from "../people/PersonPicker.vue";
import { getErrorMessage } from "../../services/api.service";
import { useAssignees } from "../../composables/useAssignees";
import {
  FOLLOWUP_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "../../constants/crm";
import type {
  FollowupType,
  TaskDialogValue,
  TaskFieldsPayload,
  TaskPriority,
  TaskStatus,
} from "../../types";

/**
 * حوار المهمة الواحد لكل مصادرها: متابعة عرض بيع أو إيجار، أو نشاط زبون.
 * المستدعي يمرّر ما يُحفظ به (`save`)؛ الحوار يجمع الحقول المشتركة: النوع
 * والملاحظات والموعد والحالة والأولوية والموظف المكلّف والنتيجة، والزبون
 * حين يكون اختيارياً (متابعة عرض) أو مطلوباً (نشاط زبون).
 */
const open = defineModel<boolean>({ required: true });
const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    /** القيم الأولى: مهمة قائمة للتعديل، أو مسودة لإضافة. */
    initial?: Partial<TaskDialogValue> | null;
    /** "optional": متابعة عرض؛ "required": نشاط زبون؛ "hidden": بلا زبون. */
    person?: "optional" | "required" | "hidden";
    save: (value: TaskFieldsPayload) => Promise<void>;
  }>(),
  { subtitle: "", initial: null, person: "optional" },
);
const emit = defineEmits<{ saved: [] }>();

const { assignees, loadAssignees } = useAssignees();
const saving = ref(false);
const error = ref<string | null>(null);
const form = ref(blank());
let opener: HTMLElement | null = null;

function blank() {
  return {
    type: "phone_call" as FollowupType,
    notes: "",
    scheduled_at: "",
    status: null as TaskStatus | null,
    priority: "normal" as TaskPriority,
    assigned_user_id: null as number | null,
    person_id: null as number | null,
    outcome: "",
  };
}

/** datetime-local بلا منطقة زمنية؛ الخادم يقبل ISO بمنطقتها فقط. */
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

watch(open, (value) => {
  if (!value) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  const initial = props.initial ?? {};
  form.value = {
    ...blank(),
    type: initial.type ?? "phone_call",
    notes: initial.notes ?? "",
    scheduled_at: toLocalInput(initial.scheduled_at),
    status: initial.status ?? null,
    priority: initial.priority ?? "normal",
    assigned_user_id: initial.assigned_user_id ?? null,
    person_id: initial.person_id ?? null,
    outcome: initial.outcome ?? "",
  };
  error.value = null;
  void loadAssignees();
});

/** حالة جديدة بلا اختيار: موعد ⇒ مفتوحة، وبلا موعد ⇒ أُنجزت (ما حدث). */
const effectiveStatus = computed<TaskStatus>(
  () => form.value.status ?? (form.value.scheduled_at ? "open" : "done"),
);
const editing = computed(() => Boolean(props.initial?.id));

async function submit() {
  if (saving.value) return;
  if (props.person === "required" && !form.value.person_id) {
    error.value = "اختر الزبون.";
    return;
  }
  saving.value = true;
  error.value = null;
  try {
    await props.save({
      type: form.value.type,
      notes: form.value.notes.trim() || null,
      scheduled_at: form.value.scheduled_at
        ? new Date(form.value.scheduled_at).toISOString()
        : null,
      status: effectiveStatus.value,
      priority: form.value.priority,
      assigned_user_id: form.value.assigned_user_id,
      outcome: form.value.outcome.trim() || null,
      ...(props.person === "hidden" ? {} : { person_id: form.value.person_id }),
    });
    open.value = false;
    emit("saved");
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return;
  event.preventDefault();
  void submit();
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="620"
    scrollable
    :persistent="saving"
    aria-labelledby="task-dialog-title"
  >
    <v-card tag="form" @submit.prevent="submit" @keydown="onKeydown">
      <v-card-title id="task-dialog-title">{{ title }}</v-card-title>
      <v-card-subtitle v-if="subtitle">{{ subtitle }}</v-card-subtitle>
      <v-divider />
      <v-card-text class="task-dialog">
        <v-select
          v-model="form.type"
          :items="FOLLOWUP_TYPES"
          label="النوع"
          hide-details="auto"
        />
        <PersonPicker
          v-if="person !== 'hidden'"
          v-model="form.person_id"
          :label="person === 'required' ? 'الزبون *' : 'الزبون (اختياري)'"
          placeholder="ابحث بالاسم أو الهاتف"
          clearable
          hide-details="auto"
        />
        <v-textarea
          v-model="form.notes"
          class="task-dialog__wide"
          label="ما الذي حدث أو ما المطلوب"
          rows="3"
          auto-grow
          hide-details="auto"
        />
        <v-text-field
          v-model="form.scheduled_at"
          type="datetime-local"
          label="الموعد (اختياري)"
          hint="بموعد تصبح مهمة مفتوحة حتى تُنجز؛ بلا موعد تُسجّل كأمر حدث."
          persistent-hint
        />
        <v-select
          v-model="form.assigned_user_id"
          :items="assignees"
          item-title="display_name"
          item-value="id"
          label="الموظف المكلّف"
          clearable
          hide-details="auto"
        />
        <v-select
          v-model="form.priority"
          :items="TASK_PRIORITIES"
          label="الأولوية"
          hide-details="auto"
        />
        <v-select
          :model-value="effectiveStatus"
          :items="TASK_STATUSES"
          label="الحالة"
          hide-details="auto"
          @update:model-value="form.status = $event"
        />
        <v-textarea
          v-if="effectiveStatus !== 'open' || editing"
          v-model="form.outcome"
          class="task-dialog__wide"
          label="النتيجة (اختياري)"
          rows="2"
          auto-grow
          hide-details="auto"
        />
        <v-alert
          v-if="error"
          class="task-dialog__wide"
          type="error"
          variant="tonal"
          density="compact"
        >
          {{ error }}
        </v-alert>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
        <v-btn color="primary" variant="flat" type="submit" :loading="saving"
          >حفظ</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.task-dialog {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}
.task-dialog__wide {
  grid-column: 1 / -1;
}
@media (max-width: 600px) {
  .task-dialog {
    grid-template-columns: 1fr;
  }
}
</style>
