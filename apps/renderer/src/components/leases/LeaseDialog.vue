<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import FormSection from "../shared/FormSection.vue";
import NumberField from "../app/NumberField.vue";
import PersonPicker from "../people/PersonPicker.vue";
import LeaseScheduleSummary from "./LeaseScheduleSummary.vue";
import * as leasesService from "../../services/leases.service";
import * as rentalsService from "../../services/rentals.service";
import { getErrorMessage } from "../../services/api.service";
import { ACCOUNT_CURRENCIES } from "../../constants/accounting";
import { LEASE_FREQUENCIES } from "../../constants/leases";
import type {
  Currency,
  LeaseDetail,
  LeaseFrequency,
  LeasePayload,
  LeaseSchedule,
  RentalRecord,
} from "../../types";

/**
 * إيجار بلا عقد في النظام: عقد ورقي قديم أو إيجار اتُّفق عليه خارج المكتب.
 * يُدخل بطرفيه وبدله ودوريته ومدته، ويظهر جدول أقساطه قبل حفظه. اختيار
 * العرض يملأ مؤجره وبدله ودوريته. لا يُعدَّل الإيجار بعد حفظه؛ يُلغى.
 */
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [LeaseDetail] }>();
const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
  VAutocomplete: { hideDetails: "auto" },
};

function blank() {
  return {
    rental_id: null as number | null,
    landlord_person_id: null as number | null,
    tenant_person_id: null as number | null,
    currency: "IQD" as Currency,
    rent_amount: "" as string | number | null,
    frequency: "monthly" as LeaseFrequency,
    start_date: "",
    end_date: "",
    deposit: "" as string | number | null,
    office_collects: false,
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

// ─── العرض ─────────────────────────────────────────────────────────────
const rentals = ref<RentalRecord[]>([]);
const rentalsLoading = ref(false);
let rentalTimer: ReturnType<typeof setTimeout> | undefined;
async function searchRentals(q: string) {
  rentalsLoading.value = true;
  try {
    rentals.value = (
      await rentalsService.listRentalsPage(
        { q },
        { page: 1, page_size: 20, sort_by: "code", sort_order: "asc" },
      )
    ).items;
  } catch {
    rentals.value = [];
  } finally {
    rentalsLoading.value = false;
  }
}
const rentalTitle = (rental: RentalRecord) =>
  `${rental.code} — ${rental.name ?? rental.owner_name}`;
// The picked listing stays among the options while others are searched,
// so its title still shows (choosing one puts its title in the search).
const picked = ref<RentalRecord | null>(null);
function onRentalSearch(q: string | null) {
  clearTimeout(rentalTimer);
  if (picked.value && q === rentalTitle(picked.value)) return;
  rentalTimer = setTimeout(() => void searchRentals(q?.trim() ?? ""), 300);
}
const rentalOptions = computed(() =>
  (picked.value && !rentals.value.some((row) => row.id === picked.value!.id)
    ? [picked.value, ...rentals.value]
    : rentals.value
  ).map((rental) => ({ value: rental.id, title: rentalTitle(rental) })),
);
watch(
  () => form.value.rental_id,
  (id) => {
    const rental =
      rentals.value.find((row) => row.id === id) ??
      (picked.value?.id === id ? picked.value : null);
    picked.value = rental;
    if (!rental) return;
    form.value.landlord_person_id ??= rental.owner_person_id;
    if (!plain(form.value.rent_amount))
      form.value.rent_amount = String(rental.rent_price);
    form.value.frequency = rental.rent_period;
  },
);

// ─── جدول الأقساط ──────────────────────────────────────────────────────
const schedule = ref<LeaseSchedule | null>(null);
const scheduleError = ref("");
let scheduleTimer: ReturnType<typeof setTimeout> | undefined;
let scheduleRequest = 0;
const scheduleTerms = computed(() => ({
  currency: form.value.currency,
  rent_amount: plain(form.value.rent_amount),
  frequency: form.value.frequency,
  start_date: form.value.start_date,
  end_date: form.value.end_date,
}));
watch(scheduleTerms, (terms) => {
  clearTimeout(scheduleTimer);
  schedule.value = null;
  scheduleError.value = "";
  if (!terms.rent_amount || !terms.start_date || !terms.end_date) return;
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
onBeforeUnmount(() => {
  clearTimeout(scheduleTimer);
  clearTimeout(rentalTimer);
});

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
  schedule.value = null;
  scheduleError.value = "";
  void searchRentals("");
});

async function save() {
  if (saving.value) return;
  if (!form.value.landlord_person_id || !form.value.tenant_person_id) {
    error.value = "اختر المؤجر والمستأجر.";
    return;
  }
  saving.value = true;
  error.value = "";
  fieldErrors.value = {};
  const payload: LeasePayload = {
    ...scheduleTerms.value,
    rental_id: form.value.rental_id,
    landlord_person_id: form.value.landlord_person_id,
    tenant_person_id: form.value.tenant_person_id,
    deposit: plain(form.value.deposit) || null,
    office_collects: form.value.office_collects,
    notes: form.value.notes.trim() || null,
  };
  try {
    const saved = await leasesService.createLease(payload);
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
    max-width="760"
    scrollable
    :persistent="saving"
    aria-labelledby="lease-dialog-title"
  >
    <v-card tag="form" @submit.prevent="save">
      <v-card-title id="lease-dialog-title"
        >إيجار بلا عقد في النظام</v-card-title
      >
      <v-divider />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <p class="text-body-2 text-medium-emphasis mb-3">
          لعقد إيجار ورقي أو قديم ليس في النظام. عقد الإيجار الصادر في النظام
          يُفعَّل من صفحته.
        </p>
        <v-defaults-provider :defaults="FIELD_DEFAULTS">
          <FormSection title="الطرفان والعرض" :columns="2">
            <v-autocomplete
              v-model="form.rental_id"
              class="form-section__wide"
              :items="rentalOptions"
              :loading="rentalsLoading"
              label="عرض الإيجار (اختياري)"
              placeholder="ابحث برمز العرض أو اسمه"
              no-filter
              clearable
              no-data-text="لا عرض بهذا الرمز أو الاسم"
              @update:search="onRentalSearch"
            />
            <PersonPicker
              v-model="form.landlord_person_id"
              label="المؤجر *"
              :error-messages="fieldErrors.landlord_person_id"
            />
            <PersonPicker
              v-model="form.tenant_person_id"
              label="المستأجر *"
              :error-messages="fieldErrors.tenant_person_id"
            />
          </FormSection>
          <FormSection title="البدل والمدة" :columns="2">
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
              v-model="form.start_date"
              type="date"
              label="تاريخ البدء *"
              :error-messages="fieldErrors.start_date"
            />
            <v-text-field
              v-model="form.end_date"
              type="date"
              label="آخر يوم في الإيجار *"
              :error-messages="fieldErrors.end_date"
            />
            <v-select
              v-model="form.currency"
              :items="ACCOUNT_CURRENCIES"
              label="العملة"
            />
            <NumberField
              v-model="form.deposit"
              label="التأمين (اختياري)"
              dir="ltr"
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
              placeholder="مثلاً: عقد ورقي مؤرخ 2025/12/20"
            />
          </FormSection>
        </v-defaults-provider>
        <LeaseScheduleSummary
          :schedule="schedule"
          :error="scheduleError"
          :currency="form.currency"
        />
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <span class="text-caption text-medium-emphasis ms-2"
          >الإيجار لا يُعدَّل بعد حفظه؛ يُلغى ويُدخل غيره.</span
        >
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
          prepend-icon="mdi-check"
          >حفظ الإيجار</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
