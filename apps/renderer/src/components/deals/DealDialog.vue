<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import FormSection from "../shared/FormSection.vue";
import NumberField from "../app/NumberField.vue";
import PersonPicker from "../people/PersonPicker.vue";
import ListingPicker from "../contracts/ListingPicker.vue";
import * as dealsService from "../../services/deals.service";
import { getErrorMessage } from "../../services/api.service";
import { useAssignees } from "../../composables/useAssignees";
import { DEAL_TYPES, dealPartyLabels } from "../../constants/deals";
import { TASK_PRIORITIES } from "../../constants/crm";
import type {
  Currency,
  DealPayload,
  DealRecord,
  DealType,
  PropertyRecord,
  RentalRecord,
  TaskPriority,
} from "../../types";

/**
 * إنشاء صفقة وتعديل بياناتها. المرحلة لا تُعدَّل هنا (لها أوامرها في صفحة
 * الصفقة). مع عرض مختار: يأخذ الخادم مالكه وسعره إن تُركا فارغين. `preset`
 * يملأ النموذج من حيث فُتح (زبون، عرض، طلب، مطابقة).
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  deal?: DealRecord | null;
  preset?: Partial<DealPayload> | null;
}>();
const emit = defineEmits<{ saved: [DealRecord] }>();

const CURRENCIES: Array<{ value: Currency; title: string }> = [
  { value: "IQD", title: "دينار عراقي" },
  { value: "USD", title: "دولار أمريكي" },
];
const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
  VTextarea: { hideDetails: "auto" },
};

const { assignees, loadAssignees } = useAssignees();
const saving = ref(false);
const error = ref("");
const fieldErrors = ref<Record<string, string[]>>({});
let opener: HTMLElement | null = null;

function blank() {
  return {
    deal_type: "sale" as DealType,
    title: "",
    priority: "normal" as TaskPriority,
    client_person_id: null as number | null,
    owner_person_id: null as number | null,
    listing_id: null as number | null,
    assigned_user_id: null as number | null,
    purchase_request_id: null as number | null,
    rental_request_id: null as number | null,
    currency: "IQD" as Currency,
    asking_price: "" as string | number | null,
    agreed_price: "" as string | number | null,
    expected_commission: "" as string | number | null,
    expected_close_date: "",
    notes: "",
  };
}
const form = ref(blank());
const parties = computed(() => dealPartyLabels(form.value.deal_type));

watch(open, (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  const source: Partial<DealPayload> & Partial<DealRecord> =
    props.deal ?? props.preset ?? {};
  form.value = {
    ...blank(),
    deal_type: source.deal_type ?? "sale",
    title: source.title ?? "",
    priority: source.priority ?? "normal",
    client_person_id: source.client_person_id ?? null,
    owner_person_id: source.owner_person_id ?? null,
    listing_id:
      (source.deal_type === "rent" ? source.rental_id : source.property_id) ??
      null,
    assigned_user_id: source.assigned_user_id ?? null,
    purchase_request_id: source.purchase_request_id ?? null,
    rental_request_id: source.rental_request_id ?? null,
    currency: source.currency ?? "IQD",
    asking_price: source.asking_price ?? "",
    agreed_price: source.agreed_price ?? "",
    expected_commission: source.expected_commission ?? "",
    expected_close_date: source.expected_close_date ?? "",
    notes: source.notes ?? "",
  };
  error.value = "";
  fieldErrors.value = {};
  void loadAssignees();
});

/** Changing the kind clears what belongs to the other kind. */
watch(
  () => form.value.deal_type,
  (type, previous) => {
    if (!previous || type === previous || props.deal) return;
    form.value.listing_id = null;
    form.value.purchase_request_id = null;
    form.value.rental_request_id = null;
  },
);

/** A picked listing brings its owner when none is chosen yet. */
function listingPicked(listing: PropertyRecord | RentalRecord | null) {
  if (listing?.owner_person_id && !form.value.owner_person_id)
    form.value.owner_person_id = listing.owner_person_id;
}

const amount = (value: string | number | null) =>
  value === null || value === "" ? null : String(value);

async function save() {
  if (saving.value) return;
  if (!form.value.client_person_id) {
    error.value = `اختر ${parties.value.client}.`;
    return;
  }
  saving.value = true;
  error.value = "";
  fieldErrors.value = {};
  const sale = form.value.deal_type === "sale";
  const payload: DealPayload = {
    deal_type: form.value.deal_type,
    title: form.value.title.trim() || null,
    priority: form.value.priority,
    property_id: sale ? form.value.listing_id : null,
    rental_id: sale ? null : form.value.listing_id,
    client_person_id: form.value.client_person_id,
    owner_person_id: form.value.owner_person_id,
    assigned_user_id: form.value.assigned_user_id,
    purchase_request_id: sale ? form.value.purchase_request_id : null,
    rental_request_id: sale ? null : form.value.rental_request_id,
    currency: form.value.currency,
    asking_price: amount(form.value.asking_price),
    agreed_price: amount(form.value.agreed_price),
    expected_commission: amount(form.value.expected_commission),
    expected_close_date: form.value.expected_close_date || null,
    notes: form.value.notes.trim() || null,
  };
  try {
    const saved = props.deal
      ? await dealsService.updateDeal(props.deal.id, payload)
      : await dealsService.createDeal(payload);
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
    max-width="760"
    scrollable
    :persistent="saving"
    aria-labelledby="deal-dialog-title"
  >
    <v-card tag="form" @submit.prevent="save" @keydown="onKeydown">
      <v-card-title id="deal-dialog-title">{{
        deal ? `تعديل الصفقة ${deal.code}` : "صفقة جديدة"
      }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <v-defaults-provider :defaults="FIELD_DEFAULTS">
          <FormSection title="الصفقة" :columns="2">
            <v-btn-toggle
              v-model="form.deal_type"
              mandatory
              divided
              variant="outlined"
              color="primary"
              :disabled="Boolean(deal)"
              aria-label="نوع الصفقة"
            >
              <v-btn
                v-for="type in DEAL_TYPES"
                :key="type.value"
                :value="type.value"
                >{{ type.title }}</v-btn
              >
            </v-btn-toggle>
            <v-select
              v-model="form.priority"
              :items="TASK_PRIORITIES"
              label="الأولوية"
            />
            <v-text-field
              v-model="form.title"
              class="form-section__wide"
              label="عنوان مختصر (اختياري)"
              placeholder="مثلاً: بيت المنصور لعائلة أحمد"
            />
          </FormSection>
          <FormSection title="الأطراف والعرض" :columns="2">
            <PersonPicker
              v-model="form.client_person_id"
              :label="`${parties.client} *`"
              placeholder="ابحث بالاسم أو الهاتف"
              :error-messages="fieldErrors.client_person_id"
            />
            <PersonPicker
              v-model="form.owner_person_id"
              :label="parties.owner"
              placeholder="يؤخذ من العرض إن تُرك فارغاً"
              clearable
              :error-messages="fieldErrors.owner_person_id"
            />
            <ListingPicker
              v-model="form.listing_id"
              class="form-section__wide"
              :kind="form.deal_type"
              :label="form.deal_type === 'sale' ? 'عرض البيع' : 'عرض الإيجار'"
              placeholder="ابحث برمز العرض أو المنطقة أو المالك"
              clearable
              @picked="listingPicked"
            />
            <v-select
              v-model="form.assigned_user_id"
              :items="assignees"
              item-title="display_name"
              item-value="id"
              label="الموظف المسؤول"
              clearable
            />
            <v-text-field
              v-model="form.expected_close_date"
              type="date"
              label="الإغلاق المتوقع"
              :error-messages="fieldErrors.expected_close_date"
            />
          </FormSection>
          <FormSection title="المبالغ" :columns="2">
            <v-select
              v-model="form.currency"
              :items="CURRENCIES"
              label="العملة"
            />
            <NumberField
              v-model="form.asking_price"
              label="السعر المطلوب"
              hint="يؤخذ من العرض إن تُرك فارغاً"
              persistent-hint
              :error-messages="fieldErrors.asking_price"
            />
            <NumberField
              v-model="form.agreed_price"
              label="السعر المتفق عليه"
              :error-messages="fieldErrors.agreed_price"
            />
            <NumberField
              v-model="form.expected_commission"
              label="العمولة المتوقعة"
              :error-messages="fieldErrors.expected_commission"
            />
          </FormSection>
          <FormSection title="الملاحظات" :columns="1">
            <v-textarea
              v-model="form.notes"
              label="ملاحظات"
              rows="2"
              auto-grow
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
