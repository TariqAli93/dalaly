<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  CURRENCY_LABELS,
  INSTALLMENT_FREQUENCY_LABELS,
  RENT_PERIOD_LABELS,
  TEMPLATES,
  addMonths,
  formatAmount,
  formatContractDate,
  formatDuration,
  scheduleFor,
  type AgreementTerms,
  type ContractIssue,
  type TemplateKey,
} from "@contract-document/index";
import FormSection from "../shared/FormSection.vue";
import NumberField from "../app/NumberField.vue";

/**
 * The deal: date and place, amounts, payment, dates and conditions, as the
 * template needs them, plus the brokerage commission and witnesses. The
 * payment table is computed from these fields and shown as it will print.
 */
const terms = defineModel<AgreementTerms>({ required: true });
const props = defineProps<{
  template: TemplateKey;
  readonly?: boolean;
  issues: ContractIssue[];
}>();

const kind = computed(() => TEMPLATES[props.template].kind);
const schedule = computed(() => scheduleFor(props.template, terms.value));
const errorFor = (field: keyof AgreementTerms) => {
  const issue = props.issues.find(
    (item) => item.code === "TERM_MISSING" && item.field === field,
  );
  return issue ? [issue.message] : [];
};

function set<K extends keyof AgreementTerms>(
  field: K,
  value: AgreementTerms[K],
) {
  terms.value = { ...terms.value, [field]: value };
}
const amount = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const date = (value: string | null | undefined) => (value ? value : null);
const text = (value: string | null | undefined) =>
  value?.trim() ? value : null;

const CURRENCIES = (
  Object.keys(CURRENCY_LABELS) as Array<keyof typeof CURRENCY_LABELS>
).map((value) => ({
  title: CURRENCY_LABELS[value],
  value,
}));
const FREQUENCIES = Object.entries(INSTALLMENT_FREQUENCY_LABELS).map(
  ([value, title]) => ({ title, value }),
);
const PERIODS = Object.entries(RENT_PERIOD_LABELS).map(([value, title]) => ({
  title,
  value,
}));

const remaining = computed(() =>
  terms.value.sale_price !== null && terms.value.down_payment !== null
    ? terms.value.sale_price - terms.value.down_payment
    : null,
);
const duration = computed(() =>
  formatDuration(terms.value.start_date, terms.value.end_date),
);

/** A lease of N months ending the day before the same date. */
function setLength(months: number) {
  if (!terms.value.start_date) return;
  const end = addMonths(terms.value.start_date, months);
  if (!end) return;
  const dayBefore = new Date(`${end}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  set("end_date", dayBefore.toISOString().slice(0, 10));
}

// المكتب يحرّر عقوده عادةً في مدينته: آخر مكان كُتب على هذا الجهاز يُقترح
// بنقرة حين يكون الحقل فارغاً، ولا يُملأ وحده.
const PLACE_KEY = "dalaly.contract.place.v1";
function savedPlace() {
  try {
    return localStorage.getItem(PLACE_KEY) ?? "";
  } catch {
    return "";
  }
}
const lastPlace = ref(savedPlace());
watch(
  () => terms.value.contract_place,
  (value) => {
    const place = value?.trim();
    if (!place) return;
    try {
      localStorage.setItem(PLACE_KEY, place);
    } catch {
      // The suggestion stays for this session only.
    }
  },
);
const placeSuggestion = computed(() =>
  !props.readonly && !terms.value.contract_place && lastPlace.value
    ? lastPlace.value
    : null,
);
/** An empty delivery date can take the contract's date in one click. */
const deliverySuggestion = computed(() =>
  !props.readonly && !terms.value.delivery_date && terms.value.contract_date
    ? terms.value.contract_date
    : null,
);

function witness(index: number) {
  return (
    terms.value.witnesses?.[index] ?? {
      name: null,
      national_id: null,
      address: null,
    }
  );
}
function setWitness(
  index: number,
  field: "name" | "national_id" | "address",
  value: string | null,
) {
  const witnesses = [0, 1].map((i) => ({ ...witness(i) }));
  witnesses[index]![field] = text(value);
  // Trailing empty witnesses are not stored.
  while (
    witnesses.length &&
    !witnesses.at(-1)!.name &&
    !witnesses.at(-1)!.national_id &&
    !witnesses.at(-1)!.address
  )
    witnesses.pop();
  set("witnesses", witnesses);
}
</script>

<template>
  <v-defaults-provider
    :defaults="{
      VTextField: { hideDetails: 'auto' },
      VSelect: { hideDetails: 'auto' },
      VTextarea: { hideDetails: 'auto' },
    }"
  >
    <fieldset class="terms" :disabled="readonly">
      <FormSection title="العقد" :columns="3">
        <v-text-field
          type="date"
          label="تاريخ العقد"
          :model-value="terms.contract_date ?? ''"
          :error-messages="errorFor('contract_date')"
          @update:model-value="set('contract_date', date($event))"
        />
        <v-text-field
          label="مكان التحرير (المدينة)"
          :model-value="terms.contract_place ?? ''"
          maxlength="120"
          :error-messages="errorFor('contract_place')"
          @update:model-value="set('contract_place', text($event))"
        >
          <template v-if="placeSuggestion" #append-inner>
            <v-btn
              size="x-small"
              variant="tonal"
              color="primary"
              :title="`«${placeSuggestion}» كالعقد السابق`"
              @click="set('contract_place', placeSuggestion)"
              >{{ placeSuggestion }}</v-btn
            >
          </template>
        </v-text-field>
        <v-select
          label="العملة"
          :items="CURRENCIES"
          :model-value="terms.currency"
          @update:model-value="set('currency', $event)"
        />
      </FormSection>

      <template v-if="kind === 'sale'">
        <FormSection title="الثمن والتسليم" :columns="3">
          <NumberField
            label="ثمن البيع"
            :decimals="false"
            :model-value="terms.sale_price"
            :suffix="CURRENCY_LABELS[terms.currency]"
            :error-messages="errorFor('sale_price')"
            @update:model-value="set('sale_price', amount($event))"
          />
          <v-text-field
            type="date"
            label="تاريخ التسليم"
            :model-value="terms.delivery_date ?? ''"
            :error-messages="errorFor('delivery_date')"
            @update:model-value="set('delivery_date', date($event))"
          >
            <template v-if="deliverySuggestion" #append-inner>
              <v-btn
                size="x-small"
                variant="tonal"
                color="primary"
                title="تاريخ التسليم هو تاريخ العقد"
                @click="set('delivery_date', deliverySuggestion)"
                >تاريخ العقد</v-btn
              >
            </template>
          </v-text-field>
          <div />
          <v-textarea
            class="terms__wide"
            label="طريقة دفع الثمن"
            rows="2"
            auto-grow
            :model-value="terms.payment_terms ?? ''"
            maxlength="2000"
            @update:model-value="set('payment_terms', text($event))"
          />
          <v-textarea
            class="terms__wide"
            label="شروط التسليم (اختياري)"
            rows="2"
            auto-grow
            :model-value="terms.delivery_terms ?? ''"
            maxlength="2000"
            @update:model-value="set('delivery_terms', text($event))"
          />
        </FormSection>
      </template>

      <template v-if="template === 'installment_sale'">
        <FormSection title="التقسيط" :columns="3">
          <NumberField
            label="الدفعة المقدمة"
            :decimals="false"
            :model-value="terms.down_payment"
            :suffix="CURRENCY_LABELS[terms.currency]"
            :error-messages="errorFor('down_payment')"
            @update:model-value="set('down_payment', amount($event))"
          />
          <v-text-field
            label="عدد الأقساط"
            type="number"
            min="1"
            max="600"
            :model-value="terms.installment_count ?? ''"
            :error-messages="errorFor('installment_count')"
            @update:model-value="
              set(
                'installment_count',
                amount($event) === null ? null : Math.floor(amount($event)!),
              )
            "
          />
          <v-select
            label="دورية القسط"
            :items="FREQUENCIES"
            :model-value="terms.installment_frequency"
            @update:model-value="set('installment_frequency', $event)"
          />
          <v-text-field
            type="date"
            label="تاريخ استحقاق أول قسط"
            :model-value="terms.first_due_date ?? ''"
            :error-messages="errorFor('first_due_date')"
            @update:model-value="set('first_due_date', date($event))"
          />
          <div class="terms__computed">
            <span>المبلغ المتبقي</span>
            <strong
              ><bdi>{{
                remaining !== null
                  ? `${formatAmount(remaining)} ${CURRENCY_LABELS[terms.currency]}`
                  : "—"
              }}</bdi></strong
            >
          </div>
          <div class="terms__computed">
            <span>مبلغ القسط</span>
            <strong
              ><bdi>{{
                schedule.length
                  ? `${formatAmount(schedule[0]!.amount)} ${CURRENCY_LABELS[terms.currency]}`
                  : "—"
              }}</bdi></strong
            >
          </div>
          <v-textarea
            class="terms__wide"
            label="أحكام التأخر عن السداد (اختياري)"
            rows="2"
            auto-grow
            :model-value="terms.late_terms ?? ''"
            maxlength="2000"
            @update:model-value="set('late_terms', text($event))"
          />
        </FormSection>
      </template>

      <template v-if="kind === 'rent'">
        <FormSection title="الإيجار" :columns="3">
          <NumberField
            label="بدل الإيجار"
            :decimals="false"
            :model-value="terms.rent_amount"
            :suffix="CURRENCY_LABELS[terms.currency]"
            :error-messages="errorFor('rent_amount')"
            @update:model-value="set('rent_amount', amount($event))"
          />
          <v-select
            label="يُدفع"
            :items="PERIODS"
            :model-value="terms.rent_period"
            @update:model-value="set('rent_period', $event)"
          />
          <NumberField
            label="مبلغ التأمين (اختياري)"
            :decimals="false"
            :model-value="terms.deposit"
            :suffix="CURRENCY_LABELS[terms.currency]"
            @update:model-value="set('deposit', amount($event))"
          />
          <v-text-field
            type="date"
            label="تاريخ بدء الإيجار"
            :model-value="terms.start_date ?? ''"
            :error-messages="errorFor('start_date')"
            @update:model-value="set('start_date', date($event))"
          />
          <v-text-field
            type="date"
            label="تاريخ انتهاء الإيجار"
            :model-value="terms.end_date ?? ''"
            :error-messages="errorFor('end_date')"
            @update:model-value="set('end_date', date($event))"
          />
          <div class="terms__computed">
            <span>المدة</span>
            <strong>{{ duration ?? "—" }}</strong>

            <v-divider vertical class="mx-1.5" />
            <span v-if="!readonly && terms.start_date" class="terms__quick">
              <v-btn size="x-small" variant="text" @click="setLength(6)"
                >6 أشهر</v-btn
              >
              <v-btn size="x-small" variant="text" @click="setLength(12)"
                >سنة</v-btn
              >
              <v-btn size="x-small" variant="text" @click="setLength(24)"
                >سنتان</v-btn
              >
            </span>
          </div>
          <v-text-field
            label="موعد دفع البدل"
            :model-value="terms.payment_due ?? ''"
            maxlength="300"
            @update:model-value="set('payment_due', text($event))"
          />
          <v-text-field
            label="مدة الإشعار بالإخلاء (أيام)"
            type="number"
            min="0"
            :model-value="terms.notice_days ?? ''"
            @update:model-value="
              set(
                'notice_days',
                amount($event) === null ? null : Math.floor(amount($event)!),
              )
            "
          />
          <v-text-field
            v-if="template === 'commercial_rent'"
            label="الغرض المسموح (النشاط التجاري)"
            :model-value="terms.permitted_use ?? ''"
            maxlength="300"
            :error-messages="errorFor('permitted_use')"
            @update:model-value="set('permitted_use', text($event))"
          />
          <v-textarea
            class="terms__wide"
            label="شروط التجديد (اختياري)"
            rows="2"
            auto-grow
            :model-value="terms.renewal_terms ?? ''"
            maxlength="2000"
            @update:model-value="set('renewal_terms', text($event))"
          />
          <v-textarea
            class="terms__wide"
            label="الخدمات والفواتير (اختياري)"
            rows="2"
            auto-grow
            :model-value="terms.utilities_terms ?? ''"
            maxlength="2000"
            @update:model-value="set('utilities_terms', text($event))"
          />
        </FormSection>
      </template>

      <FormSection
        v-if="schedule.length"
        :title="
          template === 'installment_sale'
            ? `جدول الأقساط (${schedule.length})`
            : `دفعات الإيجار (${schedule.length})`
        "
        :columns="1"
      >
        <div class="terms__schedule">
          <v-table density="compact">
            <thead>
              <tr>
                <th>#</th>
                <th>تاريخ الاستحقاق</th>
                <th v-if="kind === 'rent'">عن المدة حتى</th>
                <th>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in schedule" :key="row.index">
                <td>{{ row.index }}</td>
                <td>
                  <bdi>{{ formatContractDate(row.due_date) ?? "—" }}</bdi>
                </td>
                <td v-if="kind === 'rent'">
                  <bdi>{{ formatContractDate(row.period_end) ?? "—" }}</bdi>
                </td>
                <td>
                  <bdi>{{ formatAmount(row.amount) }}</bdi>
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
      </FormSection>

      <FormSection title="عمولة المكتب (اختياري)" :columns="3">
        <NumberField
          label="مبلغ العمولة"
          :decimals="false"
          :model-value="terms.commission"
          :suffix="CURRENCY_LABELS[terms.currency]"
          @update:model-value="set('commission', amount($event))"
        />
        <v-text-field
          class="terms__wide2"
          label="شروط دفع العمولة"
          :model-value="terms.commission_terms ?? ''"
          maxlength="2000"
          @update:model-value="set('commission_terms', text($event))"
        />
      </FormSection>

      <FormSection title="الشهود (اختياري)" :columns="3">
        <template v-for="index in [0, 1]" :key="index">
          <v-text-field
            :label="`اسم الشاهد ${index === 0 ? 'الأول' : 'الثاني'}`"
            :model-value="witness(index).name ?? ''"
            maxlength="200"
            @update:model-value="setWitness(index, 'name', $event)"
          />
          <v-text-field
            label="رقم الهوية"
            :model-value="witness(index).national_id ?? ''"
            maxlength="60"
            @update:model-value="setWitness(index, 'national_id', $event)"
          />
          <v-text-field
            label="العنوان"
            :model-value="witness(index).address ?? ''"
            maxlength="300"
            @update:model-value="setWitness(index, 'address', $event)"
          />
        </template>
      </FormSection>
    </fieldset>
  </v-defaults-provider>
</template>

<style scoped>
.terms {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dal-gutter);
}
.terms__wide {
  grid-column: 1 / -1;
}
.terms__wide2 {
  grid-column: span 2;
}
.terms__computed {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  padding: 6px 2px;
  font-size: 13px;
}
.terms__computed > span:first-child {
  color: var(--dal-muted);
}
.terms__quick {
  display: inline-flex;
}
.terms__schedule {
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-control);
}
</style>
