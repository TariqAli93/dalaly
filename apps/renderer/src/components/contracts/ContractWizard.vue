<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ContractDetailsStep from "./ContractDetailsStep.vue";
import ContractReviewStep from "./ContractReviewStep.vue";
import PersonDocuments from "./PersonDocuments.vue";
import PersonSelector from "./PersonSelector.vue";
import * as contractsService from "../../services/contracts.service";
import * as peopleService from "../../services/people.service";
import * as propertiesService from "../../services/properties.service";
import * as rentalsService from "../../services/rentals.service";
import * as officeService from "../../services/company-settings.service";
import { getErrorMessage } from "../../services/api.service";
import { toNumber } from "../../utils/format";
import type {
  ContractTemplateRecord,
  ContractValidation,
  PersonRecord,
  PropertyRecord,
  RentalRecord,
} from "../../types";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [];
}>();
const step = ref(1);
const loading = ref(false);
const saving = ref(false);
const previewing = ref(false);
const error = ref("");
const preview = ref("");
const previewOpen = ref(false);
const validation = ref<ContractValidation | null>(null);
const people = ref<PersonRecord[]>([]);
const properties = ref<PropertyRecord[]>([]);
const rentals = ref<RentalRecord[]>([]);
const templates = ref<ContractTemplateRecord[]>([]);
const office = ref<{
  company_name: string;
  phone_primary: string | null;
  address: string | null;
} | null>(null);
const form = ref({
  contract_type: "sale" as "sale" | "rental",
  property_id: null as number | null,
  rental_id: null as number | null,
  contract_date: new Date().toISOString().slice(0, 10),
  start_date: "",
  end_date: "",
  amount: "" as string | number | null,
  template_id: null as number | null,
  notes: "",
});
const partyIds = ref<Record<string, number | null>>({
  seller: null,
  buyer: null,
  lessor: null,
  lessee: null,
});
const partyDocuments = ref<Record<string, number[]>>({
  seller: [],
  buyer: [],
  lessor: [],
  lessee: [],
});

const roleDefinitions = computed(() =>
  form.value.contract_type === "sale"
    ? [
        { key: "seller", label: "البائع" },
        { key: "buyer", label: "المشتري" },
      ]
    : [
        { key: "lessor", label: "المؤجر" },
        { key: "lessee", label: "المستأجر" },
      ],
);
const scope = computed(() =>
  form.value.contract_type === "sale" ? "sale" : "rent",
);
const currentTemplates = computed(() =>
  templates.value.filter(
    (template) => template.contract_type === form.value.contract_type,
  ),
);
const selectedTemplate = computed(
  () =>
    currentTemplates.value.find(
      (template) => template.id === form.value.template_id,
    ) ??
    currentTemplates.value[0] ??
    null,
);
const currentAsset = computed(() =>
  form.value.contract_type === "sale"
    ? properties.value.find((item) => item.id === form.value.property_id)
    : rentals.value.find((item) => item.id === form.value.rental_id),
);
const currentAssetLabel = computed(() =>
  currentAsset.value
    ? `${currentAsset.value.name || currentAsset.value.code}`
    : "",
);
const canNext = computed(() =>
  step.value === 1
    ? !!selectedTemplate.value && !!currentAsset.value
    : step.value === 2
      ? roleDefinitions.value.every((role) => !!partyIds.value[role.key])
      : true,
);

function reset() {
  step.value = 1;
  error.value = "";
  preview.value = "";
  previewOpen.value = false;
  validation.value = null;
  form.value = {
    contract_type: "sale",
    property_id: null,
    rental_id: null,
    contract_date: new Date().toISOString().slice(0, 10),
    start_date: "",
    end_date: "",
    amount: "",
    template_id: null,
    notes: "",
  };
  partyIds.value = { seller: null, buyer: null, lessor: null, lessee: null };
  partyDocuments.value = { seller: [], buyer: [], lessor: [], lessee: [] };
}
async function load() {
  if (!props.modelValue) return;
  loading.value = true;
  error.value = "";
  try {
    [
      people.value,
      properties.value,
      rentals.value,
      templates.value,
      office.value,
    ] = await Promise.all([
      peopleService.listPeople(),
      propertiesService.listProperties(),
      rentalsService.listRentals(),
      contractsService.listTemplates(),
      officeService.getCompanySettings(),
    ]);
    if (!form.value.template_id)
      form.value.template_id = currentTemplates.value[0]?.id ?? null;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
function onTypeChanged(value: "sale" | "rental") {
  form.value.contract_type = value;
  form.value.property_id = null;
  form.value.rental_id = null;
  form.value.template_id = currentTemplates.value[0]?.id ?? null;
  validation.value = null;
  partyIds.value = { seller: null, buyer: null, lessor: null, lessee: null };
  partyDocuments.value = { seller: [], buyer: [], lessor: [], lessee: [] };
}
function onPersonCreated(person: PersonRecord) {
  if (!people.value.some((item) => item.id === person.id))
    people.value = [person, ...people.value];
}
function personFor(role: string) {
  const id = partyIds.value[role];
  return people.value.find((person) => person.id === id) ?? null;
}
function payload() {
  return {
    contract_type: form.value.contract_type,
    property_id:
      form.value.contract_type === "sale" ? form.value.property_id : null,
    rental_id:
      form.value.contract_type === "rental" ? form.value.rental_id : null,
    template_id: form.value.template_id || selectedTemplate.value?.id || null,
    status: "active",
    contract_date: form.value.contract_date,
    start_date: form.value.start_date || null,
    end_date: form.value.end_date || null,
    amount: toNumber(form.value.amount),
    payment_info: {},
    notes: form.value.notes || null,
    parties: roleDefinitions.value.map((role) => ({
      person_id: partyIds.value[role.key],
      role: role.key,
      identity_document_ids: partyDocuments.value[role.key] ?? [],
    })),
  };
}
async function validate() {
  error.value = "";
  validation.value = null;
  try {
    validation.value = await contractsService.validateContract(payload());
  } catch (cause) {
    error.value = getErrorMessage(cause);
  }
}
async function next() {
  if (!canNext.value) return;
  if (step.value === 2) {
    step.value = 3;
    await validate();
    return;
  }
  step.value += 1;
}
async function showPreview() {
  previewing.value = true;
  error.value = "";
  try {
    const result = await contractsService.previewContract(payload());
    preview.value = result.content;
    previewOpen.value = true;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    previewing.value = false;
  }
}
async function save() {
  if (!validation.value?.valid) {
    await validate();
    if (!validation.value?.valid) return;
  }
  saving.value = true;
  error.value = "";
  try {
    await contractsService.createContract(payload());
    emit("saved");
    emit("update:modelValue", false);
    reset();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      reset();
      void load();
    }
  },
);
watch(
  () => form.value.contract_type,
  () => {
    if (props.modelValue && templates.value.length)
      form.value.template_id = currentTemplates.value[0]?.id ?? null;
  },
);
</script>
<template>
  <v-dialog
    :model-value="props.modelValue"
    max-width="1120"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center"
        ><span>إنشاء عقد</span><v-spacer /><v-btn
          icon="mdi-close"
          variant="text"
          @click="emit('update:modelValue', false)"
      /></v-card-title>
      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate class="mb-3" />
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <v-stepper v-model="step" flat>
          <v-stepper-header
            ><v-stepper-item
              :value="1"
              title="تفاصيل العقد" /><v-divider /><v-stepper-item
              :value="2"
              title="الأطراف والمستمَسكات" /><v-divider /><v-stepper-item
              :value="3"
              title="المراجعة والإصدار"
          /></v-stepper-header>
          <v-stepper-window>
            <v-stepper-window-item :value="1"
              ><ContractDetailsStep
                :contract-type="form.contract_type"
                :property-id="form.property_id"
                :rental-id="form.rental_id"
                :contract-date="form.contract_date"
                :start-date="form.start_date"
                :end-date="form.end_date"
                :amount="form.amount"
                :template-id="form.template_id || selectedTemplate?.id || null"
                :properties="properties"
                :rentals="rentals"
                :templates="currentTemplates"
                @update:contract-type="onTypeChanged"
                @update:property-id="form.property_id = $event"
                @update:rental-id="form.rental_id = $event"
                @update:contract-date="form.contract_date = $event"
                @update:start-date="form.start_date = $event"
                @update:end-date="form.end_date = $event"
                @update:amount="form.amount = $event"
                @update:template-id="form.template_id = $event" /><v-textarea
                v-model="form.notes"
                class="mt-3"
                label="ملاحظات العقد"
                rows="2"
            /></v-stepper-window-item>
            <v-stepper-window-item :value="2"
              ><div class="parties-grid">
                <v-card
                  v-for="role in roleDefinitions"
                  :key="role.key"
                  variant="flat"
                  border
                  ><v-card-title>{{ role.label }}</v-card-title
                  ><v-card-text
                    ><PersonSelector
                      v-model="partyIds[role.key]"
                      :people="people"
                      :label="role.label"
                      @created="onPersonCreated" /><PersonDocuments
                      v-model="partyDocuments[role.key]"
                      :person="personFor(role.key)"
                      :scope="scope" /></v-card-text
                ></v-card></div
            ></v-stepper-window-item>
            <v-stepper-window-item :value="3"
              ><ContractReviewStep
                :contract-label="
                  form.contract_type === 'sale' ? 'عقد بيع' : 'عقد إيجار'
                "
                :asset-label="currentAssetLabel"
                :template-name="selectedTemplate?.name ?? ''"
                :office-ready="
                  !!office?.company_name &&
                  !!office?.phone_primary &&
                  !!office?.address
                "
                :parties="
                  roleDefinitions.map((role) => ({
                    label: role.label,
                    name: personFor(role.key)?.full_name ?? '',
                    documents: partyDocuments[role.key]?.length ?? 0,
                    missing:
                      validation?.issues.filter(
                        (issue) =>
                          issue.code === 'document_missing' &&
                          issue.path?.includes(`.${role.key}.`),
                      ).length ?? 0,
                  }))
                " /><v-alert
                v-if="validation && !validation.valid"
                type="warning"
                variant="tonal"
                class="mt-4"
                ><div class="font-weight-bold mb-1">
                  لا يمكن إصدار العقد بعد
                </div>
                <div
                  v-for="issue in validation.issues"
                  :key="`${issue.code}-${issue.path}-${issue.message}`"
                >
                  {{ issue.message }}
                </div></v-alert
              ><v-alert
                v-else-if="validation"
                type="success"
                variant="tonal"
                class="mt-4"
                >اكتملت متطلبات العقد ويمكن إصداره.</v-alert
              ><v-textarea
                v-model="form.notes"
                class="mt-4"
                label="ملاحظات العقد"
                rows="2"
            /></v-stepper-window-item>
          </v-stepper-window>
        </v-stepper>
        <v-dialog v-model="previewOpen" max-width="850"
          ><v-card
            ><v-card-title>معاينة العقد</v-card-title
            ><v-card-text class="contract-preview">{{ preview }}</v-card-text
            ><v-card-actions
              ><v-spacer /><v-btn @click="previewOpen = false"
                >إغلاق</v-btn
              ></v-card-actions
            ></v-card
          ></v-dialog
        >
      </v-card-text>
      <v-card-actions
        ><v-btn v-if="step > 1" variant="text" @click="step -= 1">رجوع</v-btn
        ><v-spacer /><v-btn
          variant="text"
          @click="emit('update:modelValue', false)"
          >إلغاء</v-btn
        ><v-btn
          v-if="step === 3"
          variant="tonal"
          :loading="previewing"
          @click="showPreview"
          >معاينة العقد</v-btn
        ><v-btn
          v-if="step < 3"
          color="primary"
          :disabled="!canNext"
          @click="next"
          >التالي</v-btn
        ><v-btn
          v-else
          color="primary"
          :loading="saving"
          :disabled="!validation?.valid"
          @click="save"
          >إنشاء العقد</v-btn
        ></v-card-actions
      >
    </v-card>
  </v-dialog>
</template>
<style scoped>
.parties-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.contract-preview {
  white-space: pre-wrap;
  line-height: 2;
  max-height: 70vh;
  overflow: auto;
  direction: rtl;
}
@media (max-width: 820px) {
  .parties-grid {
    grid-template-columns: 1fr;
  }
}
</style>
