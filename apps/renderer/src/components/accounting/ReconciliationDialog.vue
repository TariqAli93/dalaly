<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import * as cashService from "../../services/cash.service";
import { getErrorMessage } from "../../services/api.service";
import { formatAmount, todayIso } from "../../utils/format";
import { normalizeDigits } from "../../utils/digits";
import { amountToMinor, minorToAmount } from "../../utils/money";
import type {
  MoneyAccount,
  ReconciliationPayload,
  ReconciliationRecord,
} from "../../types";

/**
 * مطابقة صندوق أو مصرف: ما عُدَّ في الصندوق أو ما يظهر في كشف المصرف، مقابل
 * رصيد الدفاتر في التاريخ نفسه. الفرق يُسجَّل، ويُرحَّل إن طُلب: العجز
 * مصروفاً والزيادة إيراداً آخر، فتطابق الدفاتر ما عُدَّ.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ account?: MoneyAccount | null }>();
const emit = defineEmits<{ saved: [ReconciliationRecord] }>();

const accounts = ref<MoneyAccount[]>([]);
const book = ref<string | null>(null);
const saving = ref(false);
const error = ref("");
let opener: HTMLElement | null = null;

const form = ref({
  account_id: null as number | null,
  statement_date: todayIso(),
  statement_balance: "",
  adjust: false,
  notes: "",
});
const selected = computed(() =>
  accounts.value.find((row) => row.id === form.value.account_id),
);
const accountOptions = computed(() =>
  accounts.value.map((row) => ({
    value: row.id,
    title: `${row.code} — ${row.name}`,
  })),
);

/** A signed amount typed in ("-1,250.50"), as minor units, or null. */
function signedMinor(value: string | null) {
  const text = normalizeDigits(value ?? "")
    .trim()
    .replace(/,/g, "");
  if (!text) return null;
  const negative = text.startsWith("-");
  const minor = amountToMinor(negative ? text.slice(1) : text);
  return minor === null ? null : negative ? -minor : minor;
}
const statementMinor = computed(() =>
  signedMinor(form.value.statement_balance),
);
const difference = computed(() => {
  const bookMinor = signedMinor(book.value);
  return statementMinor.value === null || bookMinor === null
    ? null
    : statementMinor.value - bookMinor;
});
const money = (minor: bigint | null) =>
  minor === null
    ? "—"
    : formatAmount(minorToAmount(minor), selected.value?.currency ?? "IQD");

async function loadBook() {
  book.value = null;
  if (!form.value.account_id || !form.value.statement_date) return;
  try {
    const rows = await cashService.getBalances(form.value.statement_date);
    book.value =
      rows.find((row) => row.id === form.value.account_id)?.balance ?? null;
  } catch {
    book.value = null;
  }
}
watch(
  () => [form.value.account_id, form.value.statement_date],
  () => void loadBook(),
);

watch(open, async (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  error.value = "";
  form.value = {
    account_id: props.account?.id ?? null,
    statement_date: todayIso(),
    statement_balance: "",
    adjust: false,
    notes: "",
  };
  try {
    accounts.value = await cashService.getBalances();
    form.value.account_id ??= accounts.value[0]?.id ?? null;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  }
  void loadBook();
});

async function save() {
  if (saving.value) return;
  if (!form.value.account_id || statementMinor.value === null) {
    error.value = "اختر الحساب واكتب الرصيد المعدود أو رصيد الكشف.";
    return;
  }
  saving.value = true;
  error.value = "";
  const payload: ReconciliationPayload = {
    account_id: form.value.account_id,
    statement_date: form.value.statement_date,
    statement_balance: minorToAmount(statementMinor.value),
    adjust: form.value.adjust,
    notes: form.value.notes.trim() || null,
  };
  try {
    const saved = await cashService.createReconciliation(payload);
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
    max-width="560"
    :persistent="saving"
    aria-labelledby="reconciliation-dialog-title"
  >
    <v-card tag="form" @submit.prevent="save">
      <v-card-title id="reconciliation-dialog-title"
        >مطابقة صندوق أو مصرف</v-card-title
      >
      <v-card-text class="reconcile-form">
        <v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
        <v-select
          v-model="form.account_id"
          :items="accountOptions"
          label="الحساب *"
          hide-details="auto"
        />
        <div class="reconcile-form__pair">
          <v-text-field
            v-model="form.statement_date"
            type="date"
            label="التاريخ *"
            hide-details="auto"
          />
          <v-text-field
            v-model="form.statement_balance"
            label="الرصيد المعدود أو رصيد الكشف *"
            inputmode="decimal"
            dir="ltr"
            hide-details="auto"
          />
        </div>
        <dl class="reconcile-figures">
          <div>
            <dt>رصيد الدفاتر في التاريخ</dt>
            <dd>
              <bdi>{{
                book === null ? "—" : formatAmount(book, selected?.currency)
              }}</bdi>
            </dd>
          </div>
          <div>
            <dt>الفرق</dt>
            <dd
              :class="{
                'text-error': difference !== null && difference < 0n,
                'text-success': difference !== null && difference > 0n,
              }"
            >
              <bdi>{{ money(difference) }}</bdi>
              <span v-if="difference !== null && difference !== 0n">
                ({{ difference < 0n ? "عجز" : "زيادة" }})</span
              >
            </dd>
          </div>
        </dl>
        <v-checkbox
          v-model="form.adjust"
          :disabled="difference === null || difference === 0n"
          hide-details
          density="compact"
          label="ترحيل الفرق لتطابق الدفاتر ما عُدَّ"
        />
        <p v-if="form.adjust" class="text-caption text-medium-emphasis">
          العجز يُقيَّد مصروفاً تشغيلياً، والزيادة إيراداً آخر، بتاريخ المطابقة.
        </p>
        <v-text-field
          v-model="form.notes"
          label="ملاحظة (اختياري)"
          placeholder="مثلاً: جرد نهاية الشهر"
          hide-details="auto"
        />
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
          prepend-icon="mdi-scale-balance"
          >تسجيل المطابقة</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.reconcile-form {
  display: grid;
  gap: 12px;
}
.reconcile-form__pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.reconcile-figures {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.reconcile-figures dt {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.reconcile-figures dd {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
