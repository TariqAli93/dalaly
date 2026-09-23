<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { FollowupRecord, FollowupType } from "../../types";
import * as service from "../../services/rental-followups.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";
const props = defineProps<{ rentalId: number }>();
const { notifyError, notifySuccess } = useSnackbar();
const items = ref<FollowupRecord[]>([]);
const notes = ref("");
const type = ref<FollowupType>("phone_call");
const scheduled = ref("");
const saving = ref(false);
const types = [
  { title: "اتصال", value: "phone_call" },
  { title: "زيارة", value: "visit" },
  { title: "رسالة", value: "message" },
  { title: "أخرى", value: "other" },
];
async function load() {
  try {
    items.value = await service.listRentalFollowups(props.rentalId);
  } catch (e) {
    notifyError(getErrorMessage(e));
  }
}
async function add() {
  saving.value = true;
  try {
    await service.createRentalFollowup(props.rentalId, {
      type: type.value,
      notes: notes.value || null,
      scheduled_at: scheduled.value || null,
    });
    notes.value = "";
    scheduled.value = "";
    await load();
    notifySuccess("تمت إضافة المتابعة.");
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    saving.value = false;
  }
}
async function remove(item: FollowupRecord) {
  try {
    await service.deleteRentalFollowup(props.rentalId, item.id);
    await load();
  } catch (e) {
    notifyError(getErrorMessage(e));
  }
}
onMounted(() => void load());
</script>
<template>
  <div>
    <div class="d-flex flex-wrap ga-2 align-start">
      <v-select
        v-model="type"
        :items="types"
        label="نوع المتابعة"
        density="compact"
        class="followup-type"
      /><v-text-field
        v-model="scheduled"
        type="datetime-local"
        label="موعد المتابعة"
        density="compact"
        class="followup-date"
      /><v-text-field
        v-model="notes"
        label="ملاحظات"
        density="compact"
        class="flex-grow-1"
      /><v-btn color="primary" :loading="saving" @click="add">إضافة</v-btn>
    </div>
    <v-list v-if="items.length" density="compact"
      ><v-list-item
        v-for="item in items"
        :key="item.id"
        :title="item.notes || 'متابعة إيجار'"
        :subtitle="`${item.type} · ${item.scheduled_at ? new Date(item.scheduled_at).toLocaleString('ar-IQ') : 'بدون موعد'}`"
        ><template #append
          ><v-btn
            icon="mdi-delete-outline"
            variant="text"
            size="small"
            color="error"
            @click="remove(item)" /></template></v-list-item></v-list
    ><v-empty-state
      v-else
      icon="mdi-calendar-check-outline"
      title="لا توجد متابعات"
      text="أضف متابعة لهذا العرض الإيجاري."
    />
  </div>
</template>
<style scoped>
.followup-type {
  min-width: 140px;
  max-width: 180px;
}
.followup-date {
  min-width: 190px;
  max-width: 230px;
}
</style>
