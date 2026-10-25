<script setup lang="ts">
import { ref, watch } from "vue";
import { createFollowup } from "../../services/followups.service";
import { createRentalFollowup } from "../../services/rental-followups.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";
import { FOLLOWUP_TYPES } from "../../constants/crm";
import type { FollowupTarget, FollowupType } from "../../types";

/**
 * تسجيل متابعة على عرض بيع أو إيجار عبر خدمات المتابعة القائمة نفسها التي
 * تستخدمها صفحة العرض. المتابعة تُحفظ على العرض؛ notes تقترح نصاً يذكر
 * الزبون والطلب ويمكن تعديله.
 */

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ target: FollowupTarget | null }>();
const emit = defineEmits<{ saved: [] }>();
const { notifySuccess } = useSnackbar();

const type = ref<FollowupType>("phone_call");
const notes = ref("");
const scheduled = ref("");
const saving = ref(false);
const error = ref<string | null>(null);

watch(open, (value) => {
  if (!value) return;
  type.value = "phone_call";
  notes.value = props.target?.notes ?? "";
  scheduled.value = "";
  error.value = null;
});

async function save() {
  if (!props.target || saving.value) return;
  saving.value = true;
  error.value = null;
  const payload = {
    type: type.value,
    notes: notes.value.trim() || null,
    // الخادم يقبل وقت ISO مع المنطقة الزمنية فقط؛ datetime-local بلا منطقة.
    scheduled_at: scheduled.value
      ? new Date(scheduled.value).toISOString()
      : null,
  };
  try {
    if (props.target.kind === "sale")
      await createFollowup(props.target.listingId, payload);
    else await createRentalFollowup(props.target.listingId, payload);
    open.value = false;
    notifySuccess("تم حفظ المتابعة على العرض.");
    emit("saved");
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="520" :persistent="saving">
    <v-card>
      <v-card-title>تسجيل متابعة</v-card-title>
      <v-card-subtitle v-if="target"
        >على {{ target.listingLabel }}</v-card-subtitle
      >
      <v-card-text>
        <v-form @submit.prevent="save">
          <v-select
            v-model="type"
            :items="FOLLOWUP_TYPES"
            label="نوع المتابعة"
            density="compact"
          />
          <v-textarea
            v-model="notes"
            label="ما الذي حدث أو ما المطلوب"
            rows="3"
            auto-grow
            density="compact"
          />
          <v-text-field
            v-model="scheduled"
            type="datetime-local"
            label="موعد المتابعة القادمة (اختياري)"
            density="compact"
            hint="يظهر في مواعيد لوحة التحكم في يومه."
            persistent-hint
          />
          <v-alert
            v-if="error"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            {{ error }}
          </v-alert>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
        <v-btn color="primary" variant="flat" :loading="saving" @click="save"
          >حفظ</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
