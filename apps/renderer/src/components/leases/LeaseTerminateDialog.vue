<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import * as leasesService from "../../services/leases.service";
import { getErrorMessage } from "../../services/api.service";
import { installmentCount } from "../../constants/leases";
import { formatAmount, formatDate, todayIso } from "../../utils/format";
import { minorToAmount, sumAmounts } from "../../utils/money";
import type { LeaseDetail } from "../../types";

/**
 * إنهاء الإيجار قبل آخر يوم فيه: تسقط الأقساط المستحقة بعد تاريخ الإنهاء،
 * ويبقى المتأخر قبله مستحقاً يُحصَّل، ويعود العرض متاحاً. يُرفض إن قُبض قسط
 * يُستحق بعد ذلك اليوم. الإنهاء لا يُتراجع عنه.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ lease: LeaseDetail }>();
const emit = defineEmits<{ saved: [LeaseDetail] }>();

const date = ref("");
const reason = ref("");
const saving = ref(false);
const error = ref("");
let opener: HTMLElement | null = null;

/** The day before the lease's last: the latest it can end early. */
const lastDay = computed(() => {
  const end = new Date(`${props.lease.end_date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
});

watch(open, (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  const today = todayIso();
  date.value =
    today < props.lease.start_date
      ? props.lease.start_date
      : today > lastDay.value
        ? lastDay.value
        : today;
  reason.value = "";
  error.value = "";
});

const valid = computed(
  () =>
    /^\d{4}-\d{2}-\d{2}$/.test(date.value) &&
    date.value >= props.lease.start_date &&
    date.value <= lastDay.value,
);
/** Installments due after the date: released by the termination. */
const released = computed(() =>
  valid.value
    ? props.lease.installments.filter((row) => row.due_date > date.value)
    : [],
);
/** One of them already paid (wholly or partly) stops the termination. */
const paidAfter = computed(() =>
  props.lease.office_collects
    ? released.value.find((row) => sumAmounts([row.paid]) !== 0n)
    : undefined,
);
/** What stays owed of those due on or before the date. */
const arrears = computed(() => {
  if (!valid.value || !props.lease.office_collects) return null;
  const total = sumAmounts(
    props.lease.installments
      .filter((row) => row.due_date <= date.value)
      .map((row) => row.left),
  );
  return total && total > 0n ? minorToAmount(total) : null;
});
const releasedTotal = computed(() => {
  const total = sumAmounts(released.value.map((row) => row.amount));
  return total === null ? "0.00" : minorToAmount(total);
});

async function save() {
  if (saving.value) return;
  if (!valid.value) {
    error.value = `تاريخ الإنهاء بين ${formatDate(props.lease.start_date)} و${formatDate(lastDay.value)}.`;
    return;
  }
  if (!reason.value.trim()) {
    error.value = "اذكر سبب إنهاء الإيجار.";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const saved = await leasesService.terminateLease(props.lease.id, {
      termination_date: date.value,
      reason: reason.value.trim(),
    });
    open.value = false;
    emit("saved", saved);
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="520"
    :persistent="saving"
    aria-labelledby="lease-terminate-title"
  >
    <v-card tag="form" @submit.prevent="save">
      <v-card-title id="lease-terminate-title"
        >إنهاء الإيجار {{ lease.code }} مبكراً</v-card-title
      >
      <v-card-text>
        <p class="text-body-2 mb-3">
          ينتهي الإيجار في اليوم المختار بدل
          {{ formatDate(lease.end_date) }}، ويعود العرض متاحاً. الإنهاء لا
          يُتراجع عنه.
        </p>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <v-text-field
          v-model="date"
          type="date"
          label="آخر يوم في الإيجار *"
          :min="lease.start_date"
          :max="lastDay"
          hide-details="auto"
          class="mb-3"
        />
        <v-text-field
          v-model="reason"
          label="سبب الإنهاء *"
          placeholder="مثلاً: سافر المستأجر واتفق الطرفان على الإنهاء"
          hide-details="auto"
          class="mb-3"
        />
        <div aria-live="polite">
          <v-alert
            v-if="paidAfter"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-2"
          >
            قُبض من القسط {{ paidAfter.seq }} وهو يُستحق في
            {{ formatDate(paidAfter.due_date) }}، بعد هذا التاريخ. اختر يوماً
            بعده، أو ألغِ سند قبضه أولاً.
          </v-alert>
          <ul v-else-if="valid" class="lease-terminate__effects">
            <li v-if="released.length">
              تسقط {{ installmentCount(released.length) }} تُستحق بعد هذا اليوم،
              مجموعها
              <bdi>{{ formatAmount(releasedTotal, lease.currency) }}</bdi
              >.
            </li>
            <li v-else>لا يسقط قسط: كل الأقساط تُستحق قبل هذا اليوم.</li>
            <li v-if="arrears">
              يبقى على المستأجر
              <bdi>{{ formatAmount(arrears, lease.currency) }}</bdi>
              من أقساط حلّ موعدها، ويُحصَّل بعد الإنهاء.
            </li>
            <li v-if="sumAmounts([lease.deposit_held]) !== 0n">
              التأمين المحفوظ
              <bdi>{{ formatAmount(lease.deposit_held, lease.currency) }}</bdi>
              يُعاد إلى المستأجر من قسم المال.
            </li>
          </ul>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >تراجع</v-btn
        >
        <v-btn
          color="warning"
          variant="flat"
          type="submit"
          :loading="saving"
          :disabled="Boolean(paidAfter)"
          >إنهاء الإيجار</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.lease-terminate__effects {
  margin: 0;
  padding-inline-start: 1.25rem;
  font-size: 0.875rem;
  display: grid;
  gap: 4px;
}
</style>
