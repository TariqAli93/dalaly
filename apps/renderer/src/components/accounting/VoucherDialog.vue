<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import FormSection from "../shared/FormSection.vue";
import NumberField from "../app/NumberField.vue";
import PersonPicker from "../people/PersonPicker.vue";
import * as vouchersService from "../../services/vouchers.service";
import * as accountingService from "../../services/accounting.service";
import * as cashService from "../../services/cash.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import {
  ACCOUNT_CURRENCIES,
  VOUCHER_PURPOSES,
  voucherKindLabel,
} from "../../constants/accounting";
import { formatAmount, todayIso } from "../../utils/format";
import { amountToMinor } from "../../utils/money";
import type {
  AccountRecord,
  ClientFundsHeld,
  Currency,
  MoneyAccount,
  VoucherDetail,
  VoucherKind,
  VoucherPayload,
  ExpenseCategoryRecord,
} from "../../types";

/**
 * إصدار سند قبض أو صرف. الغرض يحدد الحساب المقابل (عمولة المكتب إيراد، ومال
 * البائع أو المؤجر أمانة). الصرف بحدود رصيد الصندوق أو المصرف، وتسليم
 * الأمانة بحدود ما قُبض للزبون نفسه؛ يُظهر الحوار الرصيدين ويفحصهما الخادم.
 * السند لا يُعدَّل بعد إصداره، بل يُلغى ويُصدر غيره.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  kind: VoucherKind;
  /** Filled from where it was opened: a customer, a deal, a commission. */
  preset?: Partial<VoucherPayload> | null;
  /**
   * Shown when the voucher collects a commission or pays a share: the
   * server then sets the purpose's account, the customer and the deal.
   */
  allocationNote?: string | null;
}>();
const emit = defineEmits<{ saved: [VoucherDetail] }>();

const { can } = usePermissions();
const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
  VAutocomplete: { hideDetails: "auto" },
};

const moneyAccounts = ref<MoneyAccount[]>([]);
const chart = ref<AccountRecord[]>([]);
const held = ref<ClientFundsHeld[]>([]);
const saving = ref(false);
const error = ref("");
const fieldErrors = ref<Record<string, string[]>>({});
let opener: HTMLElement | null = null;

function blank() {
  return {
    voucher_date: todayIso(),
    currency: "IQD" as Currency,
    amount: "" as string | number | null,
    purpose: "commission",
    money_account_id: null as number | null,
    other_account_id: null as number | null,
    person_id: null as number | null,
    party_name: "",
    deal_id: null as number | null,
    description: "",
    reference: "",
    expense_category_id: null as number | null,
  };
}
const form = ref(blank());

const purposes = computed(() => VOUCHER_PURPOSES[props.kind]);
const purpose = computed(() =>
  purposes.value.find((item) => item.value === form.value.purpose),
);
const moneyOptions = computed(() =>
  moneyAccounts.value
    .filter((account) => account.currency === form.value.currency)
    .map((account) => ({
      value: account.id,
      title: `${account.code} — ${account.name}`,
      subtitle: `الرصيد ${formatAmount(account.balance, account.currency)}`,
    })),
);
const selectedMoney = computed(() =>
  moneyAccounts.value.find(
    (account) => account.id === form.value.money_account_id,
  ),
);
/** Other accounts this purpose allows, for users who may read the chart. */
const otherOptions = computed(() => {
  const types = purpose.value?.types ?? [];
  const money = new Set(moneyAccounts.value.map((account) => account.id));
  return chart.value
    .filter(
      (account) =>
        account.is_postable &&
        account.is_active &&
        account.currency === form.value.currency &&
        types.includes(account.account_type) &&
        !money.has(account.id),
    )
    .map((account) => ({
      value: account.id,
      title: `${account.code} — ${account.name}`,
    }));
});
const heldHere = computed(
  () =>
    held.value.find((row) => row.currency === form.value.currency)?.held ??
    "0.00",
);
// Expense payments name what they were for: the category picks the account.
const categories = ref<ExpenseCategoryRecord[]>([]);
const expensePayment = computed(
  () => props.kind === "payment" && form.value.purpose === "expense",
);
const categoryOptions = computed(() =>
  categories.value
    .filter(
      (category) =>
        category.is_active &&
        (form.value.currency === "IQD"
          ? category.iqd_account_id
          : category.usd_account_id),
    )
    .map((category) => ({ value: category.id, title: category.name })),
);
const allocated = computed(
  () =>
    Boolean(props.preset?.commission_id) ||
    Boolean(props.preset?.commission_split_id),
);
const clientFundsPayout = computed(
  () => props.kind === "payment" && form.value.purpose === "client_funds",
);

/** What the typed amount exceeds, if anything, before the server says so. */
const overLimit = computed(() => {
  if (props.kind !== "payment") return "";
  const amount = amountToMinor(form.value.amount);
  if (amount === null || amount === 0n) return "";
  const balance = amountToMinor(selectedMoney.value?.balance ?? null);
  if (selectedMoney.value && balance !== null && amount > balance)
    return `أكبر من رصيد ${selectedMoney.value.name} (${formatAmount(selectedMoney.value.balance, form.value.currency)}).`;
  const kept = amountToMinor(heldHere.value);
  if (
    clientFundsPayout.value &&
    form.value.person_id &&
    kept !== null &&
    amount > kept
  )
    return `أكبر مما قُبض لهذا الزبون (${formatAmount(heldHere.value, form.value.currency)}).`;
  return "";
});

watch(open, async (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  const preset = props.preset ?? {};
  form.value = {
    ...blank(),
    purpose:
      preset.purpose ?? (props.kind === "receipt" ? "commission" : "expense"),
    currency: preset.currency ?? "IQD",
    person_id: preset.person_id ?? null,
    deal_id: preset.deal_id ?? null,
    description: preset.description ?? "",
    amount: preset.amount ?? "",
  };
  error.value = "";
  fieldErrors.value = {};
  held.value = [];
  try {
    const [accounts, fullChart, expenseKinds] = await Promise.all([
      vouchersService.listMoneyAccounts(),
      can("accounting.read")
        ? accountingService.listAccounts()
        : Promise.resolve([]),
      props.kind === "payment"
        ? cashService.listExpenseCategories()
        : Promise.resolve([]),
    ]);
    moneyAccounts.value = accounts;
    chart.value = fullChart;
    categories.value = expenseKinds;
    pickMoneyAccount();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  }
});

/** The first cash account of the currency, unless one of it is chosen. */
function pickMoneyAccount() {
  if (
    moneyOptions.value.some(
      (option) => option.value === form.value.money_account_id,
    )
  )
    return;
  const cash = moneyAccounts.value.find(
    (account) =>
      account.currency === form.value.currency && account.kind === "cash",
  );
  form.value.money_account_id =
    cash?.id ?? moneyOptions.value[0]?.value ?? null;
}
watch(
  () => form.value.currency,
  () => {
    pickMoneyAccount();
    form.value.other_account_id = null;
    form.value.expense_category_id = null;
  },
);
watch(
  () => form.value.purpose,
  () => {
    form.value.other_account_id = null;
    form.value.expense_category_id = null;
  },
);
watch(
  () => [form.value.person_id, clientFundsPayout.value] as const,
  async ([personId, payout]) => {
    held.value = [];
    if (!personId || !payout) return;
    try {
      held.value = await vouchersService.getClientFunds(personId);
    } catch {
      held.value = [];
    }
  },
);

async function save() {
  if (saving.value) return;
  if (!form.value.money_account_id) {
    error.value = "اختر الصندوق أو المصرف.";
    return;
  }
  saving.value = true;
  error.value = "";
  fieldErrors.value = {};
  const payload: VoucherPayload = {
    kind: props.kind,
    voucher_date: form.value.voucher_date,
    currency: form.value.currency,
    amount: String(form.value.amount ?? "").replace(/,/g, ""),
    purpose: form.value.purpose,
    money_account_id: form.value.money_account_id,
    other_account_id: form.value.other_account_id,
    person_id: form.value.person_id,
    party_name: form.value.person_id
      ? null
      : form.value.party_name.trim() || null,
    deal_id: form.value.deal_id,
    description: form.value.description.trim(),
    reference: form.value.reference.trim() || null,
    commission_id: props.preset?.commission_id ?? null,
    commission_split_id: props.preset?.commission_split_id ?? null,
    expense_category_id: expensePayment.value
      ? form.value.expense_category_id
      : null,
  };
  try {
    const saved = await vouchersService.issueVoucher(payload);
    open.value = false;
    emit("saved", saved);
  } catch (cause) {
    const issues = (
      cause as { issues?: Array<{ field?: string; message: string }> }
    )?.issues;
    if (issues?.length)
      for (const issue of issues) {
        if (issue.field)
          (fieldErrors.value[issue.field] ??= []).push(issue.message);
        else error.value = issue.message;
      }
    else error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return;
  event.preventDefault();
  void save();
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="720"
    scrollable
    :persistent="saving"
    aria-labelledby="voucher-dialog-title"
  >
    <v-card tag="form" @submit.prevent="save" @keydown="onKeydown">
      <v-card-title id="voucher-dialog-title">{{
        `${voucherKindLabel(kind)} جديد`
      }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <v-defaults-provider :defaults="FIELD_DEFAULTS">
          <FormSection title="السند" :columns="2">
            <v-alert
              v-if="allocated"
              class="form-section__wide"
              type="info"
              variant="tonal"
              density="compact"
              >{{ allocationNote }}</v-alert
            >
            <v-select
              v-model="form.purpose"
              class="form-section__wide"
              :items="purposes"
              label="الغرض"
              :hint="purpose?.hint"
              persistent-hint
              :disabled="allocated"
            />
            <v-text-field
              v-model="form.voucher_date"
              type="date"
              label="التاريخ *"
              :error-messages="fieldErrors.voucher_date"
            />
            <v-select
              v-model="form.currency"
              :items="ACCOUNT_CURRENCIES"
              label="العملة"
              :disabled="allocated"
            />
            <NumberField
              v-model="form.amount"
              label="المبلغ *"
              dir="ltr"
              :error-messages="
                fieldErrors.amount ?? (overLimit ? [overLimit] : undefined)
              "
            />
            <v-select
              v-model="form.money_account_id"
              :items="moneyOptions"
              :label="kind === 'receipt' ? 'يُقبض في *' : 'يُصرف من *'"
              no-data-text="لا صندوق ولا مصرف فعّال بهذه العملة"
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" />
              </template>
            </v-select>
          </FormSection>
          <FormSection
            v-if="!allocated"
            :title="kind === 'receipt' ? 'الدافع' : 'المستلم'"
            :columns="2"
          >
            <PersonPicker
              v-model="form.person_id"
              label="الزبون"
              placeholder="ابحث بالاسم أو الهاتف"
              clearable
              :error-messages="fieldErrors.person_id"
            />
            <v-text-field
              v-if="!form.person_id"
              v-model="form.party_name"
              label="أو الاسم"
              placeholder="لمن ليس زبوناً مسجلاً"
              :error-messages="fieldErrors.party_name"
            />
            <v-alert
              v-else-if="clientFundsPayout"
              type="info"
              variant="tonal"
              density="compact"
            >
              المحتفظ به لهذا الزبون:
              <bdi>{{ formatAmount(heldHere, form.currency) }}</bdi>
            </v-alert>
          </FormSection>
          <FormSection title="البيان" :columns="2">
            <v-text-field
              v-model="form.description"
              class="form-section__wide"
              label="وذلك عن *"
              placeholder="مثلاً: عمولة بيع بيت المنصور"
              :error-messages="fieldErrors.description"
            />
            <v-text-field
              v-model="form.reference"
              label="مرجع (اختياري)"
              placeholder="رقم صك أو حوالة"
            />
            <v-select
              v-if="expensePayment"
              v-model="form.expense_category_id"
              :items="categoryOptions"
              label="تصنيف المصروف"
              placeholder="يحدد حساب المصروف"
              clearable
              no-data-text="لا تصنيف بحساب بهذه العملة"
            />
            <v-autocomplete
              v-if="
                can('accounting.read') &&
                !allocated &&
                !form.expense_category_id
              "
              v-model="form.other_account_id"
              :items="otherOptions"
              label="الحساب المقابل (اختياري)"
              placeholder="الحساب الأساسي للغرض"
              clearable
              no-data-text="لا حساب يناسب هذا الغرض بهذه العملة"
            />
          </FormSection>
        </v-defaults-provider>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <span class="text-caption text-medium-emphasis ms-2"
          >السند لا يُعدَّل بعد إصداره؛ يُلغى ويُصدر غيره.</span
        >
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          type="submit"
          :loading="saving"
          prepend-icon="mdi-check"
          title="إصدار (Ctrl+S)"
          aria-keyshortcuts="Control+S"
          >إصدار</v-btn
        >
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
