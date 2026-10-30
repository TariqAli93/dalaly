<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import * as accountingService from "../../services/accounting.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useConfirm } from "../../composables/useConfirm";
import { useSnackbar } from "../../composables/useSnackbar";
import { formatDateTime, todayIso } from "../../utils/format";
import type { AccountingPeriod } from "../../types";

/**
 * الأشهر المقفلة: الشهر المقفل لا يُرحَّل إليه قيد حتى يُعاد فتحه. يُقفل الشهر
 * بعد مراجعته؛ المسودات المؤرخة فيه تبقى مسودات حتى يُعاد فتحه.
 */
const open = defineModel<boolean>({ required: true });
const { can } = usePermissions();
const { openConfirm } = useConfirm();
const { notifySuccess } = useSnackbar();

const periods = ref<AccountingPeriod[]>([]);
const loading = ref(false);
const closing = ref(false);
const error = ref("");
/** The previous month: the one usually closed next. */
function previousMonth() {
  const [year, month] = todayIso().split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
const month = ref(previousMonth());
const notes = ref("");
let opener: HTMLElement | null = null;

async function load() {
  loading.value = true;
  error.value = "";
  try {
    periods.value = await accountingService.listPeriods();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

watch(open, (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  month.value = previousMonth();
  notes.value = "";
  void load();
});

async function close() {
  if (closing.value || !month.value) return;
  closing.value = true;
  error.value = "";
  try {
    const result = await accountingService.closePeriod(
      month.value,
      notes.value.trim() || null,
    );
    notifySuccess(
      result.drafts_left
        ? `أُقفل الشهر ${result.period}؛ فيه ${result.drafts_left} مسودة لن تُرحَّل حتى يُعاد فتحه.`
        : `أُقفل الشهر ${result.period}.`,
    );
    notes.value = "";
    await load();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    closing.value = false;
  }
}

function reopen(period: AccountingPeriod) {
  openConfirm({
    title: `إعادة فتح الشهر ${period.period}`,
    body: "يُتاح الترحيل إليه من جديد. القيود المرحَّلة فيه تبقى كما هي.",
    confirmText: "إعادة الفتح",
    onConfirm: async () => {
      await accountingService.reopenPeriod(period.period);
      notifySuccess(`أُعيد فتح الشهر ${period.period}.`);
      await load();
    },
  });
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="560"
    scrollable
    aria-labelledby="periods-dialog-title"
  >
    <v-card>
      <v-card-title id="periods-dialog-title">الأشهر المقفلة</v-card-title>
      <v-divider />
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-3">
          لا يُرحَّل قيد إلى شهر مقفل، ولا تُعكس فيه القيود، حتى يُعاد فتحه.
        </p>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <form
          v-if="can('accounting.periods.manage')"
          class="periods-close"
          @submit.prevent="close"
        >
          <v-text-field
            v-model="month"
            type="month"
            label="الشهر"
            density="compact"
            hide-details
          />
          <v-text-field
            v-model="notes"
            label="ملاحظة (اختياري)"
            density="compact"
            hide-details
          />
          <v-btn
            type="submit"
            color="primary"
            variant="flat"
            prepend-icon="mdi-lock-outline"
            :loading="closing"
            :disabled="!month"
            >إقفال</v-btn
          >
        </form>
        <v-progress-linear v-if="loading && !periods.length" indeterminate />
        <p v-else-if="!periods.length" class="text-body-2 py-4 text-center">
          لا أشهر مقفلة.
        </p>
        <v-list v-else density="compact">
          <v-list-item
            v-for="period in periods"
            :key="period.period"
            prepend-icon="mdi-calendar-lock-outline"
          >
            <v-list-item-title
              ><bdi>{{ period.period }}</bdi></v-list-item-title
            >
            <v-list-item-subtitle>
              أُقفل <span>{{ formatDateTime(period.closed_at) }}</span>
              <template v-if="period.closed_by_name">
                · {{ period.closed_by_name }}</template
              >
              <template v-if="period.notes"> · {{ period.notes }}</template>
            </v-list-item-subtitle>
            <template v-if="can('accounting.periods.manage')" #append>
              <v-btn
                variant="text"
                size="small"
                prepend-icon="mdi-lock-open-variant-outline"
                @click="reopen(period)"
                >إعادة الفتح</v-btn
              >
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">إغلاق</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.periods-close {
  display: grid;
  grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  margin-block-end: 12px;
}
@media (max-width: 520px) {
  .periods-close {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
