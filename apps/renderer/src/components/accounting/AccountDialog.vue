<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import FormSection from "../shared/FormSection.vue";
import * as accountingService from "../../services/accounting.service";
import { getErrorMessage } from "../../services/api.service";
import {
  ACCOUNT_CURRENCIES,
  ACCOUNT_TYPES,
  accountTypeLabel,
} from "../../constants/accounting";
import type {
  AccountPayload,
  AccountRecord,
  AccountType,
  Currency,
} from "../../types";

/**
 * إضافة حساب أو تعديله. الحساب الفرعي يأخذ نوع حسابه الأب وعملته إن كانت له
 * عملة؛ حساب الترحيل بعملة واحدة، والحساب الرئيسي قد يجمع العملتين. حسابات
 * الدليل الأساسي يُعدَّل اسمها ووصفها فقط. بقية القواعد يفحصها الخادم.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  account?: AccountRecord | null;
  /** The heading a new account goes under. */
  parent?: AccountRecord | null;
  chart: AccountRecord[];
}>();
const emit = defineEmits<{ saved: [AccountRecord] }>();

const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
  VAutocomplete: { hideDetails: "auto" },
  VTextarea: { hideDetails: "auto" },
};

const saving = ref(false);
const error = ref("");
const fieldErrors = ref<Record<string, string[]>>({});
let opener: HTMLElement | null = null;

function blank() {
  return {
    code: "",
    name: "",
    account_type: "expense" as AccountType,
    parent_id: null as number | null,
    currency: "IQD" as Currency | null,
    is_postable: true,
    is_active: true,
    description: "",
  };
}
const form = ref(blank());

const isSystem = computed(() => Boolean(props.account?.system_key));
const hasChildren = computed(
  () =>
    Boolean(props.account) &&
    props.chart.some((row) => row.parent_id === props.account!.id),
);
const parentAccount = computed(
  () => props.chart.find((row) => row.id === form.value.parent_id) ?? null,
);

/** Ids of the account being edited and everything under it. */
const ownSubtree = computed(() => {
  const ids = new Set<number>();
  if (!props.account) return ids;
  const stack = [props.account.id];
  while (stack.length) {
    const id = stack.pop()!;
    ids.add(id);
    for (const row of props.chart) if (row.parent_id === id) stack.push(row.id);
  }
  return ids;
});
const parentOptions = computed(() =>
  props.chart
    .filter(
      (row) =>
        !row.is_postable &&
        !ownSubtree.value.has(row.id) &&
        (row.is_active || row.id === props.account?.parent_id),
    )
    .map((row) => ({
      value: row.id,
      title: `${row.code} — ${row.name}`,
      subtitle: accountTypeLabel(row.account_type),
    })),
);

/** The next free two-digit code under a heading: 53 → 5301, 5302… */
function nextChildCode(parent: AccountRecord) {
  const taken = new Set(props.chart.map((row) => row.code));
  for (let n = 1; n < 100; n++) {
    const code = `${parent.code}${String(n).padStart(2, "0")}`;
    if (code.length <= 10 && !taken.has(code)) return code;
  }
  return "";
}

watch(open, (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  const account = props.account;
  if (account)
    form.value = {
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      parent_id: account.parent_id,
      currency: account.currency,
      is_postable: account.is_postable,
      is_active: account.is_active,
      description: account.description ?? "",
    };
  else {
    form.value = blank();
    if (props.parent) {
      form.value.parent_id = props.parent.id;
      form.value.account_type = props.parent.account_type;
      form.value.currency = props.parent.currency ?? "IQD";
      form.value.code = nextChildCode(props.parent);
    }
  }
  error.value = "";
  fieldErrors.value = {};
});

/** A picked heading brings its type and currency; a new account its code. */
watch(
  () => form.value.parent_id,
  (id, previous) => {
    if (!open.value || id === previous) return;
    const parent = parentAccount.value;
    if (!parent) return;
    form.value.account_type = parent.account_type;
    if (parent.currency) form.value.currency = parent.currency;
    if (!props.account) form.value.code = nextChildCode(parent);
  },
);

/** A posting account needs a currency; a heading may span both. */
watch(
  () => form.value.is_postable,
  (postable) => {
    if (postable && !form.value.currency)
      form.value.currency = parentAccount.value?.currency ?? "IQD";
  },
);

const currencyOptions = computed(() => [
  ...ACCOUNT_CURRENCIES,
  ...(form.value.is_postable ? [] : [{ value: null, title: "العملتان" }]),
]);

async function save() {
  if (saving.value) return;
  saving.value = true;
  error.value = "";
  fieldErrors.value = {};
  const payload: AccountPayload = {
    code: form.value.code.trim(),
    name: form.value.name.trim(),
    account_type: form.value.account_type,
    parent_id: form.value.parent_id,
    currency: form.value.currency,
    is_postable: form.value.is_postable,
    is_active: form.value.is_active,
    description: form.value.description.trim() || null,
  };
  try {
    const saved = props.account
      ? await accountingService.updateAccount(props.account.id, payload)
      : await accountingService.createAccount(payload);
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
    max-width="640"
    scrollable
    :persistent="saving"
    aria-labelledby="account-dialog-title"
  >
    <v-card tag="form" @submit.prevent="save" @keydown="onKeydown">
      <v-card-title id="account-dialog-title">{{
        account ? `تعديل الحساب ${account.code}` : "حساب جديد"
      }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <v-alert
          v-if="isSystem"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
          >حساب من الدليل الأساسي يعتمد عليه النظام في القيود؛ يُعدَّل اسمه
          ووصفه فقط.</v-alert
        >
        <v-defaults-provider :defaults="FIELD_DEFAULTS">
          <FormSection title="الحساب" :columns="2">
            <v-btn-toggle
              v-model="form.is_postable"
              class="form-section__wide"
              mandatory
              divided
              variant="outlined"
              color="primary"
              :disabled="isSystem || hasChildren"
              aria-label="صنف الحساب"
            >
              <v-btn :value="true">حساب ترحيل</v-btn>
              <v-btn :value="false">حساب رئيسي</v-btn>
            </v-btn-toggle>
            <v-autocomplete
              v-model="form.parent_id"
              class="form-section__wide"
              :items="parentOptions"
              label="تحت الحساب الرئيسي"
              placeholder="بلا حساب أب: حساب في أعلى الدليل"
              clearable
              :disabled="isSystem"
              :error-messages="fieldErrors.parent_id"
            />
            <v-text-field
              v-model="form.code"
              label="رمز الحساب *"
              inputmode="numeric"
              dir="ltr"
              hint="أرقام فقط"
              persistent-hint
              :disabled="isSystem"
              :error-messages="fieldErrors.code"
            />
            <v-text-field
              v-model="form.name"
              label="اسم الحساب *"
              :error-messages="fieldErrors.name"
            />
            <v-select
              v-model="form.account_type"
              :items="ACCOUNT_TYPES"
              label="النوع"
              :disabled="isSystem || Boolean(parentAccount) || hasChildren"
              :hint="parentAccount ? 'نوع حسابه الأب' : undefined"
              persistent-hint
            />
            <v-select
              v-model="form.currency"
              :items="currencyOptions"
              label="العملة"
              :disabled="isSystem || Boolean(parentAccount?.currency)"
              :hint="
                form.is_postable
                  ? 'لحساب الترحيل عملة واحدة'
                  : 'العملتان: تجمع حسابات بالدينار والدولار'
              "
              persistent-hint
              :error-messages="fieldErrors.currency"
            />
            <v-textarea
              v-model="form.description"
              class="form-section__wide"
              label="وصف (اختياري)"
              rows="2"
              auto-grow
            />
            <v-switch
              v-if="account"
              v-model="form.is_active"
              class="form-section__wide"
              color="primary"
              hide-details
              :disabled="isSystem"
              label="الحساب فعّال"
            />
          </FormSection>
        </v-defaults-provider>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          type="submit"
          :loading="saving"
          prepend-icon="mdi-content-save-outline"
          title="حفظ (Ctrl+S)"
          aria-keyshortcuts="Control+S"
          >حفظ</v-btn
        >
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
