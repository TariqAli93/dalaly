<script setup lang="ts">
import { computed } from "vue";
import TaskDialog from "../tasks/TaskDialog.vue";
import { createFollowup } from "../../services/followups.service";
import { createRentalFollowup } from "../../services/rental-followups.service";
import { useSnackbar } from "../../composables/useSnackbar";
import type { FollowupTarget, TaskFieldsPayload } from "../../types";

/**
 * تسجيل متابعة على عرض بيع أو إيجار من لوحة التحكم، بحوار المهمة المشترك
 * (TaskDialog) وخدمات المتابعة نفسها التي تستخدمها صفحة العرض. notes تقترح
 * نصاً يذكر الزبون والطلب ويمكن تعديله.
 */

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ target: FollowupTarget | null }>();
const emit = defineEmits<{ saved: [] }>();
const { notifySuccess } = useSnackbar();

const initial = computed(() => ({
  type: "phone_call" as const,
  notes: props.target?.notes ?? "",
}));

async function save(payload: TaskFieldsPayload) {
  if (!props.target) return;
  if (props.target.kind === "sale")
    await createFollowup(props.target.listingId, payload);
  else await createRentalFollowup(props.target.listingId, payload);
  notifySuccess("تم حفظ المتابعة على العرض.");
}
</script>

<template>
  <TaskDialog
    v-model="open"
    title="تسجيل متابعة"
    :subtitle="target ? `على ${target.listingLabel}` : ''"
    :initial="initial"
    person="optional"
    :save="save"
    @saved="emit('saved')"
  />
</template>
