<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { addMonths } from "@contract-document/index";
import FormSection from "../shared/FormSection.vue";
import NumberField from "../app/NumberField.vue";
import LeaseScheduleSummary from "./LeaseScheduleSummary.vue";
import * as leasesService from "../../services/leases.service";
import { getErrorMessage } from "../../services/api.service";
import { LEASE_FREQUENCIES } from "../../constants/leases";
import { formatAmount, formatDate } from "../../utils/format";
import { sumAmounts } from "../../utils/money";
import type {
  LeaseDetail,
  LeaseFrequency,
  LeaseRenewPayload,
  LeaseSchedule,
} from "../../types";

/**
 * تجديد الإيجار: إيجار جديد بالطرفين والعرض والعملة نفسها، يبدأ في اليوم
 * التالي لانتهاء هذا، ببدل ودورية ومدة جديدة وجدول أقساط يظهر قبل الحفظ.
 * يصير الإيجار القديم «مجدَّداً» وتبقى أقساطه المتأخرة مستحقة؛ وإلغاء
 * التجديد يعيده سارياً.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ lease: LeaseDetail }>();
const emit = defineEmits<{ saved: [LeaseDetail] }>();
const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
};

const shift = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
/** The renewal starts the day after this lease's last. */
const start = computed(() => shift(props.lease.end_date, 1));

function blank() {
  const year = addMonths(start.value, 12);
  return {
    rent_amount: props.lease.rent_amount as string | number | null,
    frequency: props.lease.frequency as LeaseFrequency,
    end_date: year ? shift(year, -1) : "",
    deposit: (props.lease.deposit ?? "") as string | number | null,
    office_collects: props.lease.office_collects,
    notes: "",
  };
}
const form = ref(blank());
const saving = ref(false);
const error = ref("");
const fieldErrors = ref<Record<string, string[]>>({});
let opener: HTMLElement | null = null;

const plain = (value: string | number | null) =>
  String(value ?? "")
    .replace(/,/g, "")
    .trim();

const schedule = ref<LeaseSchedule | null>(null);
const scheduleError = ref("");
let scheduleTimer: ReturnType<typeof setTimeout> | undefined;
let scheduleRequest = 0;
const scheduleTerms = computed(() => ({
  currency: props.lease.currency,
  rent_amount: plain(form.value.rent_amount),
  frequency: form.value.frequency,
  start_date: start.value,
  end_date: form.value.end_date,
}));
watch(scheduleTerms, (terms) => {
  clearTimeout(scheduleTimer);
  schedule.value = null;
  scheduleError.value = "";
  if (!open.value || !terms.rent_amount || !terms.end_date) return;
  scheduleTimer = setTimeout(async () => {
    const current = ++scheduleRequest;
    try {
      const result = await leasesService.previewSchedule(terms);
      if (current === scheduleRequest) schedule.value = result;
    } catch (cause) {
      if (current === scheduleRequest)
        scheduleError.value = getErrorMessage(cause);
    }
  }, 350);
});
onBeforeUnmount(() => clearTimeout(scheduleTimer));

watch(open, (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  form.value = blank();
  error.value = "";
  fieldErrors.value = {};
});

/** The old lease's deposit stays held on it, and is returned from its page. */
const depositKept = computed(
  () => (sumAmounts([props.lease.deposit_held]) ?? 0n) > 0n,
);

async function save() {
  if (saving.value) return;
  saving.value = true;
  error.value = "";
  fieldErrors.value = {};
  const payload: LeaseRenewPayload = {
    rent_amount: plain(form.value.rent_amount),
    frequency: form.value.frequency,
    end_date: form.value.end_date,
    deposit: plain(form.value.deposit) || null,
    office_collects: form.value.office_collects,
    notes: form.value.notes.trim() || null,
  };
  try {
    const saved = await leasesService.renewLease(props.lease.id, payload);
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
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="720"
    scrollable
    :persistent="saving"
    aria-labelledby="lease-renew-title"
  >
    <v-card tag="form" @submit.prevent="save">
      <v-card-title id="lease-renew-title"
        >تجديد الإيجار {{ lease.code }}</v-card-title
      >
      <v-divider />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <p class="text-body-2 mb-3">
          إيجار جديد لـ{{ lease.tenant_name ?? "المستأجر" }} من
          {{ lease.landlord_name ?? "المؤجر" }}، يبدأ في
          <strong>{{ formatDate(start) }}</strong
          >، اليوم التالي لانتهاء هذا. يصير هذا الإيجار «مجدَّداً»، وتبقى أقساطه
          التي لم تُدفع مستحقة.
        </p>
        <v-defaults-provider :defaults="FIELD_DEFAULTS">
          <FormSection title="الشروط الجديدة" :columns="2">
            <NumberField
              v-model="form.rent_amount"
              label="البدل لكل فترة *"
              dir="ltr"
              :error-messages="fieldErrors.rent_amount"
            />
            <v-select
              v-model="form.frequency"
              :items="LEASE_FREQUENCIES"
              label="دورية الدفع"
            />
            <v-text-field
              v-model="form.end_date"
              type="date"
              label="آخر يوم في الإيجار الجديد *"
              :min="start"
              :error-messages="fieldErrors.end_date"
            />
            <NumberField
              v-model="form.deposit"
              label="التأمين"
              dir="ltr"
              placeholder="فارغ: بلا تأمين"
              :error-messages="fieldErrors.deposit"
            />
            <v-switch
              v-model="form.office_collects"
              class="form-section__wide"
              color="primary"
              hide-details
              label="المكتب يقبض الإيجار لحساب المؤجر"
            />
            <v-text-field
              v-model="form.notes"
              class="form-section__wide"
              label="ملاحظة (اختياري)"
              placeholder="مثلاً: زيادة البدل باتفاق الطرفين"
            />
          </FormSection>
        </v-defaults-provider>
        <v-alert
          v-if="depositKept"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          التأمين المقبوض على هذا الإيجار
          <bdi>{{ formatAmount(lease.deposit_held, lease.currency) }}</bdi>
          يبقى محفوظاً عليه، ويُعاد أو يُقبض غيره على الإيجار الجديد من قسم
          المال.
        </v-alert>
        <LeaseScheduleSummary
          :schedule="schedule"
          :error="scheduleError"
          :currency="lease.currency"
        />
      </v-card-text>
      <v-divider />
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
          :disabled="!schedule"
          prepend-icon="mdi-autorenew"
          >تجديد الإيجار</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
