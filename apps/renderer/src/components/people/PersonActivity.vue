<script setup lang="ts">
import { computed, ref, watch } from "vue";
import TaskDialog from "../tasks/TaskDialog.vue";
import * as peopleService from "../../services/people.service";
import * as activitiesService from "../../services/activities.service";
import * as tasksService from "../../services/tasks.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import {
  followupTypeIcon,
  followupTypeLabel,
  taskPriorityColor,
  taskPriorityLabel,
  taskStatusColor,
  taskStatusLabel,
} from "../../constants/crm";
import { formatDateTime } from "../../utils/format";
import type {
  PersonTimeline,
  TaskFieldsPayload,
  TaskRecord,
} from "../../types";

/**
 * نشاط الزبون مع المكتب: ما جرى معه وما هو مستحق، من متابعات العروض
 * المرتبطة به ونشاطاته، الأحدث أولاً، مع آخر تواصل والموعد القادم. «تسجيل
 * نشاط» يضيف نشاطاً للزبون نفسه في حوار المهمة المشترك.
 */
const props = defineProps<{ personId: number; personName: string }>();
const emit = defineEmits<{ changed: [] }>();

const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();
const timeline = ref<PersonTimeline | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const dialog = ref(false);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    timeline.value = await peopleService.getPersonTimeline(props.personId);
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
watch(() => props.personId, load, { immediate: true });

const canAdd = computed(() => can("followups.create") && can("people.read"));
const UPDATE_PERMISSION = {
  sale_followup: "followups.update",
  rental_followup: "rentals.followups.update",
  activity: "followups.update",
} as const;

async function addActivity(value: TaskFieldsPayload) {
  await activitiesService.createActivity({
    ...value,
    person_id: props.personId,
  });
  notifySuccess("تم تسجيل النشاط.");
  await load();
  emit("changed");
}

async function complete(task: TaskRecord) {
  try {
    await tasksService.patchTask(task.source, task.id, { status: "done" });
    notifySuccess("أُنجزت المهمة.");
    await load();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}

function linkOf(task: TaskRecord) {
  if (task.property_id) return `/properties/${task.property_id}`;
  if (task.rental_id) return `/rentals/${task.rental_id}`;
  return null;
}
const fmt = (value: string | null) => (value ? formatDateTime(value) : "—");

defineExpose({ reload: load });
</script>

<template>
  <div class="person-activity">
    <div class="person-activity__bar">
      <dl v-if="timeline" class="person-activity__summary">
        <div>
          <dt>آخر تواصل</dt>
          <dd>
            <bdi dir="rtl">{{ fmt(timeline.last_interaction_at) }}</bdi>
          </dd>
        </div>
        <div>
          <dt>الموعد القادم</dt>
          <dd>
            <bdi dir="rtl">{{ fmt(timeline.next_followup_at) }}</bdi>
          </dd>
        </div>
        <div>
          <dt>مهام مفتوحة</dt>
          <dd>{{ timeline.open_count }}</dd>
        </div>
        <div>
          <dt>متأخرة</dt>
          <dd :class="{ 'person-activity__late': timeline.overdue_count }">
            {{ timeline.overdue_count }}
          </dd>
        </div>
      </dl>
      <v-spacer />
      <v-btn
        v-if="canAdd"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-plus"
        @click="dialog = true"
        >تسجيل نشاط</v-btn
      >
    </div>

    <v-progress-linear v-if="loading && !timeline" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal" density="compact">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>
    <v-empty-state
      v-else-if="timeline && !timeline.items.length"
      icon="mdi-timeline-clock-outline"
      title="لا يوجد نشاط مسجل بعد"
      text="سجّل اتصالاً أو اجتماعاً أو مهمة لهذا الزبون، أو اربط متابعة عرض به."
    />
    <ol v-else-if="timeline" class="person-activity__list">
      <li v-for="task in timeline.items" :key="`${task.source}:${task.id}`">
        <v-icon
          :icon="followupTypeIcon(task.type)"
          size="20"
          class="person-activity__icon"
          aria-hidden="true"
        />
        <div class="person-activity__body">
          <div class="person-activity__head">
            <strong>{{ followupTypeLabel(task.type) }}</strong>
            <v-chip
              size="x-small"
              variant="tonal"
              label
              :color="task.overdue ? 'error' : taskStatusColor(task.status)"
              >{{
                task.overdue ? "متأخرة" : taskStatusLabel(task.status)
              }}</v-chip
            >
            <v-chip
              v-if="task.priority !== 'normal'"
              size="x-small"
              variant="tonal"
              label
              :color="taskPriorityColor(task.priority)"
              >{{ taskPriorityLabel(task.priority) }}</v-chip
            >
            <router-link
              v-if="linkOf(task)"
              :to="linkOf(task)!"
              class="record-link"
              >{{ task.listing_name ?? task.listing_code }}</router-link
            >
            <span v-else-if="task.request_code" class="text-medium-emphasis"
              ><bdi>{{ task.request_code }}</bdi></span
            >
          </div>
          <p v-if="task.notes" class="person-activity__text">
            {{ task.notes }}
          </p>
          <p v-if="task.outcome" class="person-activity__text">
            <strong>النتيجة:</strong> {{ task.outcome }}
          </p>
          <p class="person-activity__meta">
            <bdi dir="rtl">{{ fmt(task.created_at) }}</bdi>
            <span v-if="task.user_name"> · {{ task.user_name }}</span>
            <span v-if="task.scheduled_at">
              · موعد: <bdi dir="rtl">{{ fmt(task.scheduled_at) }}</bdi></span
            >
            <span v-if="task.assigned_user_name">
              · المكلّف: {{ task.assigned_user_name }}</span
            >
          </p>
        </div>
        <v-btn
          v-if="task.status === 'open' && can(UPDATE_PERMISSION[task.source])"
          icon="mdi-check-circle-outline"
          size="small"
          variant="text"
          :title="`إنجاز: ${followupTypeLabel(task.type)}`"
          :aria-label="`إنجاز ${followupTypeLabel(task.type)}`"
          @click="complete(task)"
        />
      </li>
    </ol>

    <TaskDialog
      v-model="dialog"
      title="تسجيل نشاط"
      :subtitle="`للزبون ${personName}`"
      :initial="{ type: 'phone_call' }"
      person="hidden"
      :save="addActivity"
    />
  </div>
</template>

<style scoped>
.person-activity__bar {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}
.person-activity__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0;
}
.person-activity__summary dt {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface-variant));
}
.person-activity__summary dd {
  margin: 0;
  font-weight: 600;
}
.person-activity__late {
  color: rgb(var(--v-theme-error));
}
.person-activity__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.person-activity__list li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px 0;
  border-bottom: 1px solid rgb(var(--v-border-color), var(--v-border-opacity));
}
.person-activity__icon {
  margin-top: 2px;
  color: rgb(var(--v-theme-primary));
}
.person-activity__body {
  flex: 1;
  min-width: 0;
}
.person-activity__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.person-activity__text {
  margin: 4px 0 0;
}
.person-activity__meta {
  margin: 4px 0 0;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface-variant));
}
</style>
