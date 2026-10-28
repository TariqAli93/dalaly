<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

/**
 * Asks for the reason of an irreversible contract step (cancelling, or
 * reopening an issued contract for a new revision). The reason is kept in
 * the audit log and on the revision.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  title: string;
  body: string;
  confirmText: string;
  color?: string;
  busy?: boolean;
}>();
const emit = defineEmits<{ confirm: [string] }>();

const reason = ref("");
const field = ref<{ focus: () => void } | null>(null);
const tooShort = () => reason.value.trim().length < 3;

watch(open, (isOpen) => {
  if (!isOpen) return;
  reason.value = "";
  void nextTick(() => field.value?.focus());
});

function submit() {
  if (tooShort() || props.busy) return;
  emit("confirm", reason.value.trim());
}
</script>

<template>
  <v-dialog v-model="open" max-width="480" :persistent="Boolean(reason)">
    <v-card>
      <v-card-title class="text-subtitle-1 font-weight-bold">{{
        title
      }}</v-card-title>
      <v-card-text>
        <p class="mb-3">{{ body }}</p>
        <v-textarea
          ref="field"
          v-model="reason"
          label="السبب"
          rows="3"
          auto-grow
          maxlength="1000"
          counter
          :error-messages="
            reason && tooShort() ? ['اكتب السبب بوضوح (3 أحرف على الأقل).'] : []
          "
          @keydown.ctrl.enter="submit"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">تراجع</v-btn>
        <v-btn
          :color="color ?? 'primary'"
          variant="flat"
          :loading="busy"
          :disabled="tooShort()"
          @click="submit"
          >{{ confirmText }}</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
