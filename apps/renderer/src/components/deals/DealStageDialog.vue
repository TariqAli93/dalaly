<script setup lang="ts">
import { computed, ref, watch } from "vue";
import * as dealsService from "../../services/deals.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { DEAL_STAGES, isClosedDealStage } from "../../constants/deals";
import type { DealDetail, DealRecord, DealStage } from "../../types";

/**
 * Moves a deal to another stage. The server checks the move (an agreed price
 * before "won", an issued contract before "contract issued"…) and answers in
 * Arabic; a reason is asked for when losing, cancelling or reopening.
 * Closing and reopening are offered only with deals.close.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  deal: DealRecord | null;
  target?: DealStage | null;
}>();
const emit = defineEmits<{ moved: [DealDetail] }>();

const { can } = usePermissions();
const stage = ref<DealStage | null>(null);
const reason = ref("");
const saving = ref(false);
const error = ref("");

const fromClosed = computed(() =>
  props.deal ? isClosedDealStage(props.deal.stage) : false,
);
const choices = computed(() =>
  DEAL_STAGES.filter((item) => {
    if (!props.deal || item.value === props.deal.stage) return false;
    const closing = Boolean(item.closed);
    if ((closing || fromClosed.value) && !can("deals.close")) return false;
    // A closed deal is reopened before it can close another way.
    return !(fromClosed.value && closing);
  }),
);
const needsReason = computed(
  () =>
    fromClosed.value || stage.value === "lost" || stage.value === "cancelled",
);
const reasonLabel = computed(() =>
  stage.value === "lost"
    ? "سبب الخسارة *"
    : stage.value === "cancelled"
      ? "سبب الإلغاء *"
      : "سبب إعادة الفتح *",
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  stage.value = props.target ?? null;
  reason.value = "";
  error.value = "";
});

async function submit() {
  if (!props.deal || !stage.value || saving.value) return;
  if (needsReason.value && reason.value.trim().length < 3) {
    error.value = "اكتب السبب (ثلاثة أحرف على الأقل).";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const text = reason.value.trim() || null;
    const moved = await dealsService.moveDealStage(
      props.deal.id,
      stage.value,
      stage.value === "lost" ? { lost_reason: text } : { reason: text },
    );
    open.value = false;
    emit("moved", moved);
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="480" :persistent="saving">
    <v-card tag="form" @submit.prevent="submit">
      <v-card-title class="text-subtitle-1 font-weight-bold"
        >نقل الصفقة {{ deal?.code }}</v-card-title
      >
      <v-card-text class="d-flex flex-column ga-3">
        <v-select
          v-model="stage"
          :items="choices"
          item-title="title"
          item-value="value"
          label="إلى المرحلة"
          hide-details="auto"
          autofocus
        />
        <v-textarea
          v-if="needsReason"
          v-model="reason"
          :label="reasonLabel"
          rows="2"
          auto-grow
          hide-details="auto"
        />
        <v-alert v-if="error" type="error" variant="tonal" density="compact">{{
          error
        }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
        <v-btn
          color="primary"
          variant="flat"
          type="submit"
          :loading="saving"
          :disabled="!stage"
          >نقل</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
