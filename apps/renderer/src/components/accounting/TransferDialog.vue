<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import NumberField from "../app/NumberField.vue";
import * as cashService from "../../services/cash.service";
import { getErrorMessage } from "../../services/api.service";
import { ACCOUNT_CURRENCIES } from "../../constants/accounting";
import { formatAmount, todayIso } from "../../utils/format";
import { amountToMinor } from "../../utils/money";
import type {
  CashTransferRecord,
  Currency,
  MoneyAccount,
  TransferPayload,
} from "../../types";

/**
 * تحويل بين صندوق ومصرف بالعملة نفسها: إيداع النقد في المصرف أو سحبه منه.
 * لا يُحوَّل أكثر من رصيد الحساب المحوَّل منه، ولا تحويل بين الدينار والدولار.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ from?: MoneyAccount | null }>();
const emit = defineEmits<{ saved: [CashTransferRecord] }>();

const accounts = ref<MoneyAccount[]>([]);
const saving = ref(false);
const error = ref("");
let opener: HTMLElement | null = null;

const form = ref({
  transfer_date: todayIso(),
  currency: "IQD" as Currency,
  from_account_id: null as number | null,
  to_account_id: null as number | null,
  amount: "" as string | number | null,
  description: "",
  reference: "",
});

const options = (excluded: number | null) =>
  accounts.value
    .filter(
      (account) =>
        account.currency === form.value.currency && account.id !== excluded,
    )
    .map((account) => ({
      value: account.id,
      title: `${account.code} — ${account.name}`,
      subtitle: `الرصيد ${formatAmount(account.balance, account.currency)}`,
    }));
const fromOptions = computed(() => options(null));
const toOptions = computed(() => options(form.value.from_account_id));
const source = computed(() =>
  accounts.value.find((account) => account.id === form.value.from_account_id),
);
const overBalance = computed(() => {
  const amount = amountToMinor(form.value.amount);
  const balance = amountToMinor(source.value?.balance ?? null);
  return amount !== null && balance !== null && amount > balance
    ? `أكبر من رصيد ${source.value!.name} (${formatAmount(source.value!.balance, form.value.currency)}).`
    : "";
});

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
    transfer_date: todayIso(),
    currency: props.from?.currency ?? "IQD",
    from_account_id: props.from?.id ?? null,
    to_account_id: null,
    amount: "",
    description: "",
    reference: "",
  };
  try {
    accounts.value = await cashService.getBalances();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  }
  pickDefaults();
});

/** Cash to bank by default: the usual deposit. */
function pickDefaults() {
  const ofCurrency = accounts.value.filter(
    (account) => account.currency === form.value.currency,
  );
  if (!ofCurrency.some((account) => account.id === form.value.from_account_id))
    form.value.from_account_id =
      ofCurrency.find((account) => account.kind === "cash")?.id ??
      ofCurrency[0]?.id ??
      null;
  if (
    !ofCurrency.some((account) => account.id === form.value.to_account_id) ||
    form.value.to_account_id === form.value.from_account_id
  )
    form.value.to_account_id =
      ofCurrency.find(
        (account) =>
          account.id !== form.value.from_account_id && account.kind === "bank",
      )?.id ??
      ofCurrency.find((account) => account.id !== form.value.from_account_id)
        ?.id ??
      null;
}
watch(() => form.value.currency, pickDefaults);
watch(
  () => form.value.from_account_id,
  () => {
    if (form.value.to_account_id === form.value.from_account_id)
      form.value.to_account_id = null;
  },
);

async function save() {
  if (saving.value) return;
  if (!form.value.from_account_id || !form.value.to_account_id) {
    error.value = "اختر الحسابين.";
    return;
  }
  saving.value = true;
  error.value = "";
  const payload: TransferPayload = {
    transfer_date: form.value.transfer_date,
    currency: form.value.currency,
    from_account_id: form.value.from_account_id,
    to_account_id: form.value.to_account_id,
    amount: String(form.value.amount ?? "").replace(/,/g, ""),
    description: form.value.description.trim(),
    reference: form.value.reference.trim() || null,
  };
  try {
    const saved = await cashService.createTransfer(payload);
    open.value = false;
    emit("saved", saved);
  } catch (cause) {
    const issues = (cause as { issues?: Array<{ message: string }> })?.issues;
    error.value = issues?.length
      ? issues.map((issue) => issue.message).join(" ")
      : getErrorMessage(cause);
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
    aria-labelledby="transfer-dialog-title"
  >
    <v-card tag="form" @submit.prevent="save">
      <v-card-title id="transfer-dialog-title">تحويل بين الحسابات</v-card-title>
      <v-card-text class="transfer-form">
        <v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
        <div class="transfer-form__pair">
          <v-text-field
            v-model="form.transfer_date"
            type="date"
            label="التاريخ *"
            hide-details="auto"
          />
          <v-select
            v-model="form.currency"
            :items="ACCOUNT_CURRENCIES"
            label="العملة"
            hide-details="auto"
          />
        </div>
        <v-select
          v-model="form.from_account_id"
          :items="fromOptions"
          label="من *"
          hide-details="auto"
          no-data-text="لا صندوق ولا مصرف بهذه العملة"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" />
          </template>
        </v-select>
        <v-select
          v-model="form.to_account_id"
          :items="toOptions"
          label="إلى *"
          hide-details="auto"
          no-data-text="لا حساب آخر بهذه العملة"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" />
          </template>
        </v-select>
        <NumberField
          v-model="form.amount"
          label="المبلغ *"
          dir="ltr"
          :error-messages="overBalance ? [overBalance] : undefined"
          hide-details="auto"
        />
        <v-text-field
          v-model="form.description"
          label="البيان *"
          placeholder="مثلاً: إيداع إيرادات الأسبوع في المصرف"
          hide-details="auto"
        />
        <v-text-field
          v-model="form.reference"
          label="مرجع (اختياري)"
          placeholder="رقم وصل الإيداع"
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
          prepend-icon="mdi-swap-horizontal"
          >تحويل</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.transfer-form {
  display: grid;
  gap: 12px;
}
.transfer-form__pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
</style>
