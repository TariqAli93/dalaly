<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import FormSection from "../shared/FormSection.vue";
import NumberField from "../app/NumberField.vue";
import * as commissionsService from "../../services/commissions.service";
import { getErrorMessage } from "../../services/api.service";
import { ACCOUNT_CURRENCIES } from "../../constants/accounting";
import { dealPartyLabels } from "../../constants/deals";
import { formatAmount, todayIso } from "../../utils/format";
import {
  amountToMinor,
  minorToAmount,
  percentOfAmount,
} from "../../utils/money";
import type {
  AssigneeRecord,
  CommissionDetail,
  CommissionPayload,
  Currency,
  DealRecord,
  PayerRole,
  ShareBasis,
} from "../../types";

/**
 * تسجيل عمولة المكتب على صفقة: يدفعها المشتري أو المستأجر، أو البائع أو
 * المؤجر؛ مبلغ ثابت أو نسبة من السعر المتفق عليه (لا السعر نفسه). حصص
 * الموظفين تُقتطع منها، والباقي للمكتب. يُرحَّل قيد الذمة والإيراد والحصص
 * فور التسجيل، ولا تُعدَّل العمولة بعده بل تُلغى إن لم يُحصَّل منها شيء.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ deal: DealRecord }>();
const emit = defineEmits<{ saved: [CommissionDetail] }>();

const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
};
const BASES: Array<{ value: ShareBasis; title: string }> = [
  { value: "percent", title: "نسبة" },
  { value: "fixed", title: "مبلغ" },
];

const staff = ref<AssigneeRecord[]>([]);
const saving = ref(false);
const error = ref("");
let opener: HTMLElement | null = null;
let nextKey = 0;

type ShareForm = {
  key: number;
  user_id: number | null;
  basis: ShareBasis;
  rate: string | number | null;
  amount: string | number | null;
};
function blank() {
  return {
    payer_role: "client" as PayerRole,
    basis: (props.deal.agreed_price ? "percent" : "fixed") as ShareBasis,
    rate: "" as string | number | null,
    amount: "" as string | number | null,
    currency: props.deal.currency as Currency,
    commission_date: todayIso(),
    description: "",
    splits: [] as ShareForm[],
  };
}
const form = ref(blank());

const parties = computed(() => dealPartyLabels(props.deal.deal_type));
const payers = computed(() => [
  {
    value: "client" as PayerRole,
    title: `${parties.value.client}: ${props.deal.client_name}`,
  },
  {
    value: "owner" as PayerRole,
    title: props.deal.owner_name
      ? `${parties.value.owner}: ${props.deal.owner_name}`
      : `${parties.value.owner} (غير محدد في الصفقة)`,
    props: { disabled: !props.deal.owner_person_id },
  },
]);
const currency = computed(() =>
  form.value.basis === "percent" ? props.deal.currency : form.value.currency,
);

/** The commission as the server will compute it, or null. */
const total = computed(() => {
  if (form.value.basis === "percent")
    return percentOfAmount(props.deal.agreed_price, form.value.rate);
  return amountToMinor(form.value.amount);
});
const shareAmounts = computed(() =>
  form.value.splits.map((share) =>
    share.basis === "percent"
      ? total.value === null
        ? null
        : percentOfAmount(minorToAmount(total.value), share.rate)
      : amountToMinor(share.amount),
  ),
);
const sharesTotal = computed(() =>
  shareAmounts.value.reduce<bigint>((sum, amount) => sum + (amount ?? 0n), 0n),
);
const officeShare = computed(() =>
  total.value === null ? null : total.value - sharesTotal.value,
);
const shown = (minor: bigint | null) =>
  minor === null ? "—" : formatAmount(minorToAmount(minor), currency.value);

watch(open, async (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  form.value = blank();
  error.value = "";
  try {
    staff.value = await commissionsService.listCommissionStaff();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  }
});

function addShare() {
  form.value.splits.push({
    key: nextKey++,
    user_id: null,
    basis: "percent",
    rate: "",
    amount: "",
  });
}
function removeShare(key: number) {
  form.value.splits = form.value.splits.filter((share) => share.key !== key);
}
const staffFor = (share: ShareForm) =>
  staff.value.filter(
    (user) =>
      user.id === share.user_id ||
      !form.value.splits.some((other) => other.user_id === user.id),
  );

const text = (value: string | number | null) =>
  value === null || value === "" ? null : String(value).replace(/,/g, "");

async function save() {
  if (saving.value) return;
  if (form.value.splits.some((share) => !share.user_id)) {
    error.value = "اختر الموظف لكل حصة، أو احذف الحصة الفارغة.";
    return;
  }
  saving.value = true;
  error.value = "";
  const payload: CommissionPayload = {
    deal_id: props.deal.id,
    payer_role: form.value.payer_role,
    basis: form.value.basis,
    rate: form.value.basis === "percent" ? text(form.value.rate) : null,
    amount: form.value.basis === "fixed" ? text(form.value.amount) : null,
    ...(form.value.basis === "fixed" ? { currency: form.value.currency } : {}),
    commission_date: form.value.commission_date,
    description: form.value.description.trim() || null,
    splits: form.value.splits.map((share) => ({
      user_id: share.user_id!,
      basis: share.basis,
      rate: share.basis === "percent" ? text(share.rate) : null,
      amount: share.basis === "fixed" ? text(share.amount) : null,
    })),
  };
  try {
    const saved = await commissionsService.recordCommission(payload);
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

function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return;
  event.preventDefault();
  void save();
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="760"
    scrollable
    :persistent="saving"
    aria-labelledby="commission-dialog-title"
  >
    <v-card tag="form" @submit.prevent="save" @keydown="onKeydown">
      <v-card-title id="commission-dialog-title"
        >عمولة على الصفقة {{ deal.code }}</v-card-title
      >
      <v-divider />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <v-defaults-provider :defaults="FIELD_DEFAULTS">
          <FormSection title="العمولة" :columns="2">
            <v-select
              v-model="form.payer_role"
              class="form-section__wide"
              :items="payers"
              label="يدفعها"
            />
            <v-btn-toggle
              v-model="form.basis"
              mandatory
              divided
              variant="outlined"
              color="primary"
              aria-label="طريقة حساب العمولة"
            >
              <v-btn
                v-for="basis in BASES"
                :key="basis.value"
                :value="basis.value"
                :disabled="basis.value === 'percent' && !deal.agreed_price"
                >{{ basis.title }}</v-btn
              >
            </v-btn-toggle>
            <v-text-field
              v-model="form.commission_date"
              type="date"
              label="التاريخ *"
            />
            <template v-if="form.basis === 'percent'">
              <v-text-field
                v-model="form.rate"
                label="النسبة % *"
                inputmode="decimal"
                dir="ltr"
                :hint="`من السعر المتفق عليه ${formatAmount(deal.agreed_price, deal.currency)}`"
                persistent-hint
              />
            </template>
            <template v-else>
              <NumberField v-model="form.amount" label="المبلغ *" dir="ltr" />
              <v-select
                v-model="form.currency"
                :items="ACCOUNT_CURRENCIES"
                label="العملة"
              />
            </template>
            <v-alert
              class="form-section__wide"
              type="info"
              variant="tonal"
              density="compact"
            >
              العمولة <bdi>{{ shown(total) }}</bdi> إيراد للمكتب وذمة على الدافع
              حتى تُحصَّل بسند قبض.
              <template v-if="!deal.agreed_price">
                النسبة تحتاج سعراً متفقاً عليه في الصفقة.</template
              >
            </v-alert>
          </FormSection>

          <FormSection title="حصص الموظفين" :columns="1">
            <p
              v-if="!form.splits.length"
              class="text-body-2 text-medium-emphasis"
            >
              لا حصص: العمولة كلها للمكتب.
            </p>
            <div
              v-for="(share, index) in form.splits"
              :key="share.key"
              class="share-row"
            >
              <v-select
                v-model="share.user_id"
                :items="staffFor(share)"
                item-title="display_name"
                item-value="id"
                :label="`الموظف ${index + 1}`"
              />
              <v-btn-toggle
                v-model="share.basis"
                mandatory
                divided
                density="compact"
                variant="outlined"
                :aria-label="`طريقة حساب حصة الموظف ${index + 1}`"
              >
                <v-btn
                  v-for="basis in BASES"
                  :key="basis.value"
                  :value="basis.value"
                  size="small"
                  >{{ basis.title }}</v-btn
                >
              </v-btn-toggle>
              <v-text-field
                v-if="share.basis === 'percent'"
                v-model="share.rate"
                label="% من العمولة"
                inputmode="decimal"
                dir="ltr"
              />
              <NumberField
                v-else
                v-model="share.amount"
                label="المبلغ"
                dir="ltr"
              />
              <bdi class="share-row__amount">{{
                shown(shareAmounts[index] ?? null)
              }}</bdi>
              <v-btn
                icon="mdi-close"
                size="small"
                variant="text"
                :aria-label="`حذف حصة الموظف ${index + 1}`"
                @click="removeShare(share.key)"
              />
            </div>
            <div class="share-foot">
              <v-btn
                variant="text"
                size="small"
                prepend-icon="mdi-plus"
                :disabled="form.splits.length >= staff.length"
                @click="addShare"
                >حصة موظف</v-btn
              >
              <span v-if="form.splits.length">
                حصة المكتب:
                <bdi
                  :class="{
                    'text-error': officeShare !== null && officeShare < 0n,
                  }"
                  >{{ shown(officeShare) }}</bdi
                >
              </span>
            </div>
          </FormSection>

          <FormSection title="ملاحظة" :columns="1">
            <v-text-field
              v-model="form.description"
              label="ملاحظة (اختياري)"
              placeholder="مثلاً: حسب الاتفاق مع المشتري"
            />
          </FormSection>
        </v-defaults-provider>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <span class="text-caption text-medium-emphasis ms-2"
          >لا تُعدَّل العمولة بعد تسجيلها؛ تُلغى ما لم يُحصَّل منها شيء.</span
        >
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          type="submit"
          :loading="saving"
          prepend-icon="mdi-check"
          title="تسجيل (Ctrl+S)"
          aria-keyshortcuts="Control+S"
          >تسجيل</v-btn
        >
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.share-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) auto minmax(0, 1fr) minmax(
      0,
      1fr
    ) auto;
  gap: 8px;
  align-items: center;
}
.share-row__amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.share-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
@media (max-width: 640px) {
  .share-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}
</style>
