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
import { formatAmount, formatDate, todayIso } from "../../utils/format";
import { amountToMinor } from "../../utils/money";
import type {
  AccountRecord,
  ClientFundsHeld,
  Currency,
  MoneyAccount,
  VoucherDetail,
  VoucherKind,
  VoucherPayload,
  VoucherRecord,
  ExpenseCategoryRecord,
} from "../../types";

/**
 * إصدار سند قبض أو صرف. الغرض يحدد الحساب المقابل (عمولة المكتب إيراد، ومال
 * البائع أو المؤجر أمانة). الأمانة تُحفظ لصاحبها (المالك أو البائع) لا لمن
 * دفعها، فإيجار المستأجر للمؤجر وعربون المشتري للبائع. الصرف بحدود رصيد
 * الصندوق أو المصرف، وتسليم الأمانة بحدود ما يُحفظ لصاحبها؛ يُظهر الحوار
 * الرصيدين ويفحصهما الخادم. سند الإيجار (قسطه أو تأمينه أو تسليمه) أمانة
 * بعملة الإيجار، وتسليمه بحدود ما يحفظه الإيجار لصاحبها. السند لا يُعدَّل بعد
 * إصداره، بل يُلغى ويُصدر غيره.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  kind: VoucherKind;
  /** Filled from where it was opened: a customer, a deal, a commission. */
  preset?: Partial<VoucherPayload> | null;
  /**
   * Where it was opened from, shown on top: a commission collected or a
   * share paid (the server then sets the account, customer and deal), or
   * the deal whose client funds it moves.
   */
  allocationNote?: string | null;
  /**
   * What the lease of the preset holds for each of its two sides (person
   * id to amount): a payout from it takes no more.
   */
  leaseHeld?: Record<number, string> | null;
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
    held_for_person_id: null as number | null,
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
const heldHere = computed(() => {
  const all =
    held.value.find((row) => row.currency === form.value.currency)?.held ??
    "0.00";
  const owner = fundsOwner.value;
  const onLease = owner ? props.leaseHeld?.[owner] : undefined;
  if (onLease === undefined) return all;
  return (amountToMinor(onLease) ?? 0n) < (amountToMinor(all) ?? 0n)
    ? onLease
    : all;
});
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
/** A lease's client funds: in its currency, held for one of its sides. */
const leaseBound = computed(
  () =>
    Boolean(props.preset?.lease_id) ||
    Boolean(props.preset?.lease_installment_id),
);
/** An installment's rent is held for the landlord: the server sets it. */
const rentReceipt = computed(() => Boolean(props.preset?.lease_installment_id));
const clientFunds = computed(() => form.value.purpose === "client_funds");
const clientFundsPayout = computed(
  () => props.kind === "payment" && clientFunds.value,
);
/** Whose held funds a payment draws on: the one named, else the payee. */
const fundsOwner = computed(
  () => form.value.held_for_person_id ?? form.value.person_id,
);
const heldForHint = computed(() =>
  props.kind === "receipt"
    ? rentReceipt.value
      ? "إيجار القسط يُحفظ للمؤجر."
      : form.value.deal_id
        ? "فارغ: البائع أو المؤجر في الصفقة."
        : leaseBound.value
          ? "فارغ: المؤجر في الإيجار."
          : "فارغ: الدافع نفسه."
    : leaseBound.value
      ? "فارغ: المستلم نفسه، وهو أحد طرفي الإيجار."
      : "فارغ: المستلم نفسه. لإعادة عربون إلى المشتري اختر البائع.",
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
    fundsOwner.value &&
    kept !== null &&
    amount > kept
  )
    return leaseBound.value
      ? `أكبر مما يحفظه الإيجار لصاحب الأمانة (${formatAmount(heldHere.value, form.value.currency)}).`
      : `أكبر مما يُحفظ لصاحب الأمانة (${formatAmount(heldHere.value, form.value.currency)}).`;
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
    held_for_person_id: preset.held_for_person_id ?? null,
    deal_id: preset.deal_id ?? null,
    description: preset.description ?? "",
    amount: preset.amount ?? "",
  };
  error.value = "";
  fieldErrors.value = {};
  held.value = [];
  more.value = false;
  filledFromCategory.value = { description: "", payee: null };
  lastExpenses = null;
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
    // No cash or bank account of the currency: the user has to choose one.
    if (!form.value.money_account_id) more.value = true;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  }
});

// التاريخ والعملة والصندوق مملوءة مسبقاً (اليوم، الدينار، أول صندوق)، فتُطوى في
// سطر واحد يذكرها ويُفتح بنقرة؛ تُفتح وحدها إن رفض الخادم أحدها.
const more = ref(false);
const MORE_FIELDS = [
  "voucher_date",
  "currency",
  "money_account_id",
  "reference",
  "other_account_id",
];
watch(fieldErrors, (errors) => {
  if (MORE_FIELDS.some((field) => errors[field]?.length)) more.value = true;
});
const moreSummary = computed(() =>
  [
    form.value.voucher_date === todayIso()
      ? "اليوم"
      : formatDate(form.value.voucher_date),
    selectedMoney.value?.name ?? "اختر الصندوق أو المصرف",
    ACCOUNT_CURRENCIES.find((item) => item.value === form.value.currency)
      ?.title,
  ]
    .filter(Boolean)
    .join(" · "),
);

/**
 * مصروف بتصنيف: «وذلك عن» يأخذ اسم التصنيف، والمستلم يؤخذ من آخر مصروف صدر
 * بالتصنيف نفسه (إيجار المكتب لصاحب البناية نفسه كل شهر)، ما لم يكتب المستخدم
 * غيرهما. كلاهما ظاهر ويُعدَّل قبل الإصدار.
 */
const filledFromCategory = ref<{
  description: string;
  payee: { person_id: number | null; party_name: string } | null;
}>({ description: "", payee: null });
let lastExpenses: Promise<VoucherRecord[]> | null = null;
function recentExpenses() {
  lastExpenses ??= vouchersService
    .listVouchersPage(
      { kind: "payment", purpose: "expense", status: "posted" },
      { page: 1, page_size: 50, sort_by: "voucher_date", sort_order: "desc" },
    )
    .then((page) => page.items)
    .catch(() => []);
  return lastExpenses;
}
watch(
  () => form.value.expense_category_id,
  async (id) => {
    if (!expensePayment.value || !id) return;
    const name = categories.value.find((item) => item.id === id)?.name ?? "";
    const description = form.value.description.trim();
    if (!description || description === filledFromCategory.value.description) {
      form.value.description = name;
      filledFromCategory.value.description = name;
    }
    const filled = filledFromCategory.value.payee;
    const untouched = filled
      ? form.value.person_id === filled.person_id &&
        form.value.party_name === filled.party_name
      : !form.value.person_id && !form.value.party_name.trim();
    if (!untouched) return;
    const last = (await recentExpenses()).find(
      (voucher) => voucher.expense_category_id === id,
    );
    if (form.value.expense_category_id !== id) return;
    const payee = {
      person_id: last?.person_id ?? null,
      party_name: last && !last.person_id ? last.party_name : "",
    };
    form.value.person_id = payee.person_id;
    form.value.party_name = payee.party_name;
    filledFromCategory.value.payee = last ? payee : null;
  },
);

/** A commission receipt with no recorded commission: income on its own. */
const unallocatedCommission = computed(
  () =>
    props.kind === "receipt" &&
    form.value.purpose === "commission" &&
    !allocated.value,
);

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
    if (!clientFunds.value) form.value.held_for_person_id = null;
  },
);
watch(
  () => [fundsOwner.value, clientFundsPayout.value] as const,
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
    held_for_person_id: clientFunds.value
      ? form.value.held_for_person_id
      : null,
    deal_id: form.value.deal_id,
    description: form.value.description.trim(),
    reference: form.value.reference.trim() || null,
    commission_id: props.preset?.commission_id ?? null,
    commission_split_id: props.preset?.commission_split_id ?? null,
    expense_category_id: expensePayment.value
      ? form.value.expense_category_id
      : null,
    lease_id: props.preset?.lease_id ?? null,
    lease_installment_id: props.preset?.lease_installment_id ?? null,
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
              v-if="allocationNote"
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
              :disabled="allocated || leaseBound"
            />
            <v-alert
              v-if="unallocatedCommission"
              class="form-section__wide"
              type="warning"
              variant="tonal"
              density="compact"
              >لقبض عمولة مسجّلة على صفقة استخدم «تسديد عمولة» أو «تحصيل» في
              صفّها، فينقص المتبقي منها. هذا السند يُسجَّل إيراداً لا يرتبط
              بعمولة.</v-alert
            >
            <v-select
              v-if="expensePayment"
              v-model="form.expense_category_id"
              :items="categoryOptions"
              label="نوع المصروف"
              placeholder="إيجار، كهرباء، رواتب…"
              persistent-placeholder
              hint="يحدد حساب المصروف، ويملأ البيان والمستلم من آخر مصروف مثله"
              persistent-hint
              clearable
              no-data-text="لا تصنيف بحساب بهذه العملة"
            />
            <NumberField
              v-model="form.amount"
              label="المبلغ *"
              dir="ltr"
              :error-messages="
                fieldErrors.amount ?? (overLimit ? [overLimit] : undefined)
              "
            />
            <div v-if="!more" class="voucher-more form-section__wide">
              <span class="voucher-more__text">{{ moreSummary }}</span>
              <v-btn
                variant="text"
                size="small"
                prepend-icon="mdi-pencil-outline"
                aria-label="تغيير التاريخ أو العملة أو الصندوق، أو إضافة مرجع"
                @click="more = true"
                >تغيير</v-btn
              >
            </div>
            <template v-else>
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
                :disabled="allocated || leaseBound"
              />
              <v-select
                v-model="form.money_account_id"
                :items="moneyOptions"
                :label="kind === 'receipt' ? 'يُقبض في *' : 'يُصرف من *'"
                no-data-text="لا صندوق ولا مصرف فعّال بهذه العملة"
                :error-messages="fieldErrors.money_account_id"
              >
                <template #item="{ props: itemProps, item }">
                  <v-list-item
                    v-bind="itemProps"
                    :subtitle="item.raw.subtitle"
                  />
                </template>
              </v-select>
            </template>
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
              label="أو الاسم *"
              placeholder="لمن ليس زبوناً مسجلاً"
              :hint="
                filledFromCategory.payee ? 'من آخر مصروف بهذا النوع' : undefined
              "
              :persistent-hint="Boolean(filledFromCategory.payee)"
              :error-messages="fieldErrors.party_name"
            />
            <template v-if="clientFunds">
              <PersonPicker
                v-model="form.held_for_person_id"
                label="الأمانة لحساب"
                :hint="heldForHint"
                persistent-hint
                :disabled="rentReceipt"
                clearable
                :error-messages="fieldErrors.held_for_person_id"
              />
              <v-alert
                v-if="clientFundsPayout && fundsOwner"
                type="info"
                variant="tonal"
                density="compact"
              >
                {{
                  leaseBound
                    ? "يحفظه الإيجار لصاحب الأمانة:"
                    : "المحتفظ به لصاحب الأمانة:"
                }}
                <bdi>{{ formatAmount(heldHere, form.currency) }}</bdi>
              </v-alert>
            </template>
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
              v-if="more"
              v-model="form.reference"
              label="مرجع (اختياري)"
              placeholder="رقم صك أو حوالة"
            />
            <v-autocomplete
              v-if="
                more &&
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

<style scoped>
/* ما مُلئ مسبقاً (التاريخ والصندوق والعملة) سطر واحد يُفتح بنقرة. */
.voucher-more {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding-inline: 12px 4px;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-control);
}
.voucher-more__text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(13px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>
