<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import NumberField from "../app/NumberField.vue";
import * as accountingService from "../../services/accounting.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { ACCOUNT_CURRENCIES } from "../../constants/accounting";
import { formatAmount, todayIso } from "../../utils/format";
import { amountToMinor, minorToAmount, sumAmounts } from "../../utils/money";
import type {
  AccountRecord,
  Currency,
  JournalEntryDetail,
  JournalEntryPayload,
} from "../../types";

/**
 * قيد يدوي جديد أو تعديل مسودة. كل سطر مبلغ في المدين أو في الدائن على حساب
 * ترحيل فعّال بعملة القيد. «حفظ مسودة» يقبل قيداً غير متوازن يُكمل لاحقاً؛
 * «ترحيل» لا يُتاح إلا والمدين يساوي الدائن، ولا يُعدَّل القيد بعده.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ entry?: JournalEntryDetail | null }>();
const emit = defineEmits<{ saved: [JournalEntryDetail] }>();

const { can } = usePermissions();
const accounts = ref<AccountRecord[]>([]);
const saving = ref<"draft" | "post" | null>(null);
const error = ref("");
let opener: HTMLElement | null = null;
let nextKey = 0;

type LineForm = {
  key: number;
  account_id: number | null;
  debit: string | number | null;
  credit: string | number | null;
  memo: string;
  person_id: number | null;
  deal_id: number | null;
};
const blankLine = (): LineForm => ({
  key: nextKey++,
  account_id: null,
  debit: "",
  credit: "",
  memo: "",
  person_id: null,
  deal_id: null,
});
const form = ref({
  entry_date: todayIso(),
  currency: "IQD" as Currency,
  description: "",
  lines: [blankLine(), blankLine()],
});

const accountOptions = computed(() =>
  accounts.value
    .filter(
      (account) =>
        account.is_postable &&
        account.is_active &&
        account.currency === form.value.currency,
    )
    .map((account) => ({
      value: account.id,
      title: `${account.code} — ${account.name}`,
    })),
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
  const entry = props.entry;
  form.value = entry
    ? {
        entry_date: entry.entry_date,
        currency: entry.currency,
        description: entry.description,
        lines: entry.lines.map((line) => ({
          key: nextKey++,
          account_id: line.account_id,
          debit: line.debit === "0.00" ? "" : line.debit,
          credit: line.credit === "0.00" ? "" : line.credit,
          memo: line.memo ?? "",
          person_id: line.person_id,
          deal_id: line.deal_id,
        })),
      }
    : {
        entry_date: todayIso(),
        currency: "IQD",
        description: "",
        lines: [blankLine(), blankLine()],
      };
  try {
    accounts.value = await accountingService.listAccounts();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  }
});

/** Another currency takes other accounts: lines keep their amounts only. */
watch(
  () => form.value.currency,
  (currency, previous) => {
    if (!previous || currency === previous) return;
    const allowed = new Set(accountOptions.value.map((option) => option.value));
    for (const line of form.value.lines)
      if (line.account_id !== null && !allowed.has(line.account_id))
        line.account_id = null;
  },
);

/** A line is one side: typing an amount on one clears the other. */
function onAmount(line: LineForm, side: "debit" | "credit") {
  const other = side === "debit" ? "credit" : "debit";
  if (line[side] !== "" && line[side] !== null) line[other] = "";
}

function addLine() {
  form.value.lines.push(blankLine());
}
function removeLine(key: number) {
  if (form.value.lines.length <= 2) return;
  form.value.lines = form.value.lines.filter((line) => line.key !== key);
}

const totals = computed(() => {
  const debit = sumAmounts(form.value.lines.map((line) => line.debit));
  const credit = sumAmounts(form.value.lines.map((line) => line.credit));
  return { debit, credit };
});
const balanced = computed(
  () =>
    totals.value.debit !== null &&
    totals.value.credit !== null &&
    totals.value.debit > 0n &&
    totals.value.debit === totals.value.credit,
);
const difference = computed(() =>
  totals.value.debit !== null && totals.value.credit !== null
    ? minorToAmount(totals.value.debit - totals.value.credit)
    : null,
);
const shown = (minor: bigint | null) =>
  minor === null
    ? "—"
    : formatAmount(minorToAmount(minor), form.value.currency);

/** Why posting is not possible yet, for the button's hint. */
const postHint = computed(() => {
  if (form.value.lines.some((line) => !line.account_id))
    return "اختر حساباً لكل سطر.";
  if (!balanced.value) return "المدين لا يساوي الدائن بعد.";
  return "";
});

function payload(post: boolean): JournalEntryPayload {
  const amount = (value: string | number | null) => {
    const minor = amountToMinor(value);
    return minor === null || minor === 0n
      ? null
      : String(value).replace(/,/g, "");
  };
  return {
    entry_date: form.value.entry_date,
    currency: form.value.currency,
    description: form.value.description.trim(),
    post,
    lines: form.value.lines.map((line) => ({
      account_id: line.account_id ?? 0,
      debit: amount(line.debit),
      credit: amount(line.credit),
      person_id: line.person_id,
      deal_id: line.deal_id,
      memo: line.memo.trim() || null,
    })),
  };
}

async function save(post: boolean) {
  if (saving.value) return;
  if (form.value.lines.some((line) => !line.account_id)) {
    error.value = "اختر حساباً لكل سطر، أو احذف السطر الفارغ.";
    return;
  }
  saving.value = post ? "post" : "draft";
  error.value = "";
  try {
    const saved = props.entry
      ? await accountingService.updateJournalEntry(
          props.entry.id,
          payload(post),
        )
      : await accountingService.createJournalEntry(payload(post));
    open.value = false;
    emit("saved", saved);
  } catch (cause) {
    const issues = (cause as { issues?: Array<{ message: string }> })?.issues;
    error.value = issues?.length
      ? issues.map((issue) => issue.message).join(" ")
      : getErrorMessage(cause);
  } finally {
    saving.value = null;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return;
  event.preventDefault();
  void save(false);
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="980"
    scrollable
    :persistent="Boolean(saving)"
    aria-labelledby="journal-dialog-title"
  >
    <v-card tag="form" @submit.prevent="save(false)" @keydown="onKeydown">
      <v-card-title id="journal-dialog-title">{{
        entry ? `تعديل المسودة ${entry.code}` : "قيد يدوي جديد"
      }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <div class="journal-head">
          <v-text-field
            v-model="form.entry_date"
            type="date"
            label="تاريخ القيد *"
            hide-details="auto"
          />
          <v-select
            v-model="form.currency"
            :items="ACCOUNT_CURRENCIES"
            label="العملة"
            hint="سطور القيد كلها بعملته؛ لا تحويل بين العملات"
            persistent-hint
          />
          <v-text-field
            v-model="form.description"
            class="journal-head__wide"
            label="البيان *"
            placeholder="مثلاً: إيداع نقدية الصندوق في المصرف"
            hide-details="auto"
          />
        </div>

        <v-table density="compact" class="journal-lines">
          <thead>
            <tr>
              <th scope="col" class="journal-lines__account">الحساب</th>
              <th scope="col" class="journal-lines__amount">مدين</th>
              <th scope="col" class="journal-lines__amount">دائن</th>
              <th scope="col">ملاحظة</th>
              <th scope="col"><span class="d-sr-only">حذف</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, index) in form.lines" :key="line.key">
              <td>
                <v-autocomplete
                  v-model="line.account_id"
                  :items="accountOptions"
                  :aria-label="`حساب السطر ${index + 1}`"
                  placeholder="اختر حساب ترحيل"
                  auto-select-first
                  density="compact"
                  variant="plain"
                  hide-details
                  no-data-text="لا حساب ترحيل فعّال بهذه العملة"
                />
              </td>
              <td>
                <NumberField
                  v-model="line.debit"
                  :aria-label="`مدين السطر ${index + 1}`"
                  density="compact"
                  variant="plain"
                  hide-details
                  dir="ltr"
                  @update:model-value="onAmount(line, 'debit')"
                />
              </td>
              <td>
                <NumberField
                  v-model="line.credit"
                  :aria-label="`دائن السطر ${index + 1}`"
                  density="compact"
                  variant="plain"
                  hide-details
                  dir="ltr"
                  @update:model-value="onAmount(line, 'credit')"
                />
              </td>
              <td>
                <v-text-field
                  v-model="line.memo"
                  :aria-label="`ملاحظة السطر ${index + 1}`"
                  density="compact"
                  variant="plain"
                  hide-details
                />
              </td>
              <td class="journal-lines__remove">
                <v-btn
                  icon="mdi-close"
                  size="small"
                  variant="text"
                  :disabled="form.lines.length <= 2"
                  :aria-label="`حذف السطر ${index + 1}`"
                  @click="removeLine(line.key)"
                />
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>
                <v-btn
                  variant="text"
                  size="small"
                  prepend-icon="mdi-plus"
                  @click="addLine"
                  >سطر</v-btn
                >
              </td>
              <td>
                <bdi>{{ shown(totals.debit) }}</bdi>
              </td>
              <td>
                <bdi>{{ shown(totals.credit) }}</bdi>
              </td>
              <td colspan="2">
                <v-chip
                  v-if="balanced"
                  size="small"
                  color="success"
                  variant="tonal"
                  label
                  prepend-icon="mdi-scale-balance"
                  >متوازن</v-chip
                >
                <v-chip
                  v-else-if="difference !== null && difference !== '0.00'"
                  size="small"
                  color="warning"
                  variant="tonal"
                  label
                  >الفرق
                  <bdi class="ms-1">{{
                    formatAmount(difference, form.currency)
                  }}</bdi></v-chip
                >
                <v-chip
                  v-else-if="difference === null"
                  size="small"
                  color="error"
                  variant="tonal"
                  label
                  >مبلغ غير صالح: منزلتان عشريتان على الأكثر</v-chip
                >
              </td>
            </tr>
          </tfoot>
        </v-table>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <span
          v-if="postHint && can('accounting.journal.post')"
          class="text-caption text-medium-emphasis ms-2"
          >{{ postHint }}</span
        >
        <v-spacer />
        <v-btn
          v-if="can('accounting.journal.post')"
          color="primary"
          variant="flat"
          prepend-icon="mdi-check-decagram-outline"
          :loading="saving === 'post'"
          :disabled="Boolean(postHint) || Boolean(saving)"
          @click="save(true)"
          >ترحيل</v-btn
        >
        <v-btn
          variant="tonal"
          type="submit"
          prepend-icon="mdi-content-save-outline"
          :loading="saving === 'draft'"
          :disabled="Boolean(saving)"
          title="حفظ مسودة (Ctrl+S)"
          aria-keyshortcuts="Control+S"
          >حفظ مسودة</v-btn
        >
        <v-btn variant="text" :disabled="Boolean(saving)" @click="open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.journal-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px 16px;
  margin-block-end: 16px;
}
.journal-head__wide {
  grid-column: 1 / -1;
}
.journal-lines__account {
  width: 38%;
}
.journal-lines__amount {
  width: 17%;
}
.journal-lines__remove {
  width: 1%;
}
.journal-lines tfoot td {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 640px) {
  .journal-head {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
