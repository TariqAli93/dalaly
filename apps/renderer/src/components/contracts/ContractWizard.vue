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
  ContractBundle,
  ContractTemplateRecord,
  ContractValidation,
  PersonRecord,
  PropertyRecord,
  RentalRecord,
} from "../../types";
import {
  dateOnly,
  remainingAmount,
  requiredDocumentKeys,
  totalAssetAmount,
  type ContractType,
} from "./contract-form";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    contractId?: number | null;
  }>(),
  { contractId: null },
);
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
  contract_type: "sale" as ContractType,
  property_ids: [] as number[],
  rental_ids: [] as number[],
  contract_date: new Date().toISOString().slice(0, 10),
  start_date: "",
  end_date: "",
  amount: 0,
  paid_amount: "" as string | number | null,
  template_id: null as number | null,
  status: "draft",
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
const partyMissingDocuments = ref<Record<string, string[]>>({
  seller: [],
  buyer: [],
  lessor: [],
  lessee: [],
});

const roleDefinitions = computed(() =>
  form.value.contract_type === "sale"
    ? [
        { key: "seller", label: "البائع / Seller" },
        { key: "buyer", label: "المشتري / Buyer" },
      ]
    : [
        { key: "lessor", label: "المؤجر" },
        { key: "lessee", label: "المستأجر / Tenant" },
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
const selectedAssets = computed(() =>
  form.value.contract_type === "sale"
    ? properties.value.filter((item) =>
        form.value.property_ids.includes(item.id),
      )
    : rentals.value.filter((item) => form.value.rental_ids.includes(item.id)),
);
const totalAmount = computed(() =>
  totalAssetAmount(selectedAssets.value, form.value.contract_type),
);
const calculatedRemaining = computed(() =>
  remainingAmount(totalAmount.value, form.value.paid_amount),
);
const assetLabel = computed(() =>
  selectedAssets.value.map((item) => item.name || item.code).join("، "),
);
const localIssues = computed(() => {
  const issues: string[] = [];
  if (!selectedAssets.value.length)
    issues.push("اختر عقاراً أو عرضاً إيجارياً واحداً على الأقل.");
  if (totalAmount.value <= 0)
    issues.push("يجب أن يكون المبلغ الإجمالي أكبر من صفر.");
  const paid = toNumber(form.value.paid_amount);
  if (paid < 0) issues.push("لا يمكن أن يكون المبلغ المدفوع سالباً.");
  if (paid > totalAmount.value)
    issues.push("لا يمكن أن يتجاوز المبلغ المدفوع المبلغ الإجمالي.");
  for (const role of roleDefinitions.value) {
    if (!partyIds.value[role.key]) issues.push(`اختر ${role.label}.`);
    if (partyMissingDocuments.value[role.key]?.length)
      issues.push(`أكمل مستمسكات ${role.label}.`);
  }
  return issues;
});
const canNext = computed(() => {
  if (step.value === 1)
    return (
      Boolean(selectedTemplate.value) &&
      localIssues.value.slice(0, 4).length === 0
    );
  if (step.value === 2)
    return roleDefinitions.value.every(
      (role) =>
        Boolean(partyIds.value[role.key]) &&
        !partyMissingDocuments.value[role.key]?.length,
    );
  return true;
});

function reset() {
  step.value = 1;
  error.value = "";
  preview.value = "";
  previewOpen.value = false;
  validation.value = null;
  form.value = {
    contract_type: "sale",
    property_ids: [],
    rental_ids: [],
    contract_date: new Date().toISOString().slice(0, 10),
    start_date: "",
    end_date: "",
    amount: 0,
    paid_amount: "",
    template_id: null,
    status: "draft",
    notes: "",
  };
  partyIds.value = { seller: null, buyer: null, lessor: null, lessee: null };
  partyDocuments.value = { seller: [], buyer: [], lessor: [], lessee: [] };
  partyMissingDocuments.value = {
    seller: [],
    buyer: [],
    lessor: [],
    lessee: [],
  };
}

function hydrate(bundle: ContractBundle) {
  const contract = bundle.contract;
  const assets = bundle.assets ?? (bundle.asset ? [bundle.asset] : []);
  form.value.contract_type = contract.contract_type;
  form.value.property_ids = assets
    .filter((item) => item.source_type === "property")
    .map((item) => item.source_id);
  form.value.rental_ids = assets
    .filter((item) => item.source_type === "rental")
    .map((item) => item.source_id);
  if (!assets.length) {
    if (contract.property_id) form.value.property_ids = [contract.property_id];
    if (contract.rental_id) form.value.rental_ids = [contract.rental_id];
  }
  form.value.contract_date = dateOnly(contract.contract_date);
  form.value.start_date = dateOnly(contract.start_date);
  form.value.end_date = dateOnly(contract.end_date);
  form.value.amount = toNumber(contract.amount);
  form.value.paid_amount = contract.paid_amount ?? 0;
  form.value.template_id = contract.template_id;
  form.value.status = contract.status;
  form.value.notes = contract.notes ?? "";
  for (const party of bundle.parties) {
    partyIds.value[party.role] = party.person_id;
    partyDocuments.value[party.role] = bundle.attachments
      .filter((item) => item.contract_party_id === party.id)
      .map((item) => item.identity_document_id);
  }
}

async function load() {
  if (!props.modelValue) return;
  loading.value = true;
  error.value = "";
  try {
    const [
      loadedPeople,
      loadedProperties,
      loadedRentals,
      loadedTemplates,
      loadedOffice,
      existing,
    ] = await Promise.all([
      peopleService.listPeople(),
      propertiesService.listProperties(),
      rentalsService.listRentals(),
      contractsService.listTemplates(),
      officeService.getCompanySettings(),
      props.contractId
        ? contractsService.getContract(props.contractId)
        : Promise.resolve(null),
    ]);
    people.value = loadedPeople;
    properties.value = loadedProperties;
    rentals.value = loadedRentals;
    templates.value = loadedTemplates.filter(
      (item) =>
        item.contract_type === "sale" || item.contract_type === "rental",
    );
    office.value = loadedOffice;
    if (existing) hydrate(existing);
    if (!form.value.template_id)
      form.value.template_id = currentTemplates.value[0]?.id ?? null;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

function onTypeChanged(value: ContractType) {
  form.value.contract_type = value;
  form.value.property_ids = [];
  form.value.rental_ids = [];
  form.value.amount = 0;
  form.value.paid_amount = "";
  form.value.template_id = currentTemplates.value[0]?.id ?? null;
  validation.value = null;
  partyIds.value = { seller: null, buyer: null, lessor: null, lessee: null };
  partyDocuments.value = { seller: [], buyer: [], lessor: [], lessee: [] };
  partyMissingDocuments.value = {
    seller: [],
    buyer: [],
    lessor: [],
    lessee: [],
  };
}

function onPersonCreated(person: PersonRecord) {
  if (!people.value.some((item) => item.id === person.id))
    people.value = [person, ...people.value];
}

function personFor(role: string) {
  const id = partyIds.value[role];
  return people.value.find((person) => person.id === id) ?? null;
}

function onRequirements(role: string, value: { missingKeys: string[] }) {
  partyMissingDocuments.value[role] = value.missingKeys;
}

function payload() {
  const propertyIds = form.value.property_ids;
  const rentalIds = form.value.rental_ids;
  return {
    contract_type: form.value.contract_type,
    property_ids: propertyIds,
    rental_ids: rentalIds,
    property_id: propertyIds[0] ?? null,
    rental_id: rentalIds[0] ?? null,
    template_id: form.value.template_id || selectedTemplate.value?.id || null,
    status: form.value.status,
    contract_date: form.value.contract_date,
    start_date: form.value.start_date || null,
    end_date: form.value.end_date || null,
    amount: totalAmount.value,
    paid_amount: toNumber(form.value.paid_amount),
    payment_info: { paid_amount: toNumber(form.value.paid_amount) },
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
  if (localIssues.value.length) {
    error.value = localIssues.value[0];
    return;
  }
  try {
    validation.value = await contractsService.validateContract(payload());
  } catch (cause) {
    error.value = getErrorMessage(cause);
  }
}

async function next() {
  if (!canNext.value) {
    error.value = localIssues.value[0] ?? "أكمل الحقول المطلوبة.";
    return;
  }
  if (step.value === 2) {
    step.value = 3;
    await validate();
    return;
  }
  step.value += 1;
}

async function showPreview() {
  await validate();
  if (!validation.value?.valid) return;
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
  if (localIssues.value.length) {
    error.value = localIssues.value[0];
    return;
  }
  if (!validation.value?.valid) {
    await validate();
    if (!validation.value?.valid) return;
  }
  saving.value = true;
  error.value = "";
  try {
    if (props.contractId)
      await contractsService.updateContract(props.contractId, payload());
    else await contractsService.createContract(payload());
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
  () => [
    form.value.contract_type,
    form.value.property_ids,
    form.value.rental_ids,
  ],
  () => {
    if (!props.contractId || !loading.value)
      form.value.amount = totalAmount.value;
  },
  { deep: true },
);
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
    if (props.modelValue && templates.value.length && !props.contractId)
      form.value.template_id = currentTemplates.value[0]?.id ?? null;
  },
);
</script>

<template>
  <v-dialog
    :model-value="props.modelValue"
    max-width="1180"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <span>{{ props.contractId ? "تعديل عقد مسودة" : "إنشاء عقد" }}</span>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          @click="emit('update:modelValue', false)"
        />
      </v-card-title>
      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate class="mb-3" />
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <v-stepper v-model="step" flat>
          <v-stepper-header>
            <v-stepper-item :value="1" title="تفاصيل العقد" />
            <v-divider />
            <v-stepper-item :value="2" title="الأطراف والمستمَسكات" />
            <v-divider />
            <v-stepper-item :value="3" title="المراجعة والإصدار" />
          </v-stepper-header>
          <v-stepper-window>
            <v-stepper-window-item :value="1">
              <ContractDetailsStep
                :contract-type="form.contract_type"
                :property-ids="form.property_ids"
                :rental-ids="form.rental_ids"
                :contract-date="form.contract_date"
                :start-date="form.start_date"
                :end-date="form.end_date"
                :amount="totalAmount"
                :paid-amount="form.paid_amount"
                :remaining-amount="calculatedRemaining"
                :template-id="form.template_id || selectedTemplate?.id || null"
                :properties="properties"
                :rentals="rentals"
                :templates="currentTemplates"
                @update:contract-type="onTypeChanged"
                @update:property-ids="form.property_ids = $event"
                @update:rental-ids="form.rental_ids = $event"
                @update:contract-date="form.contract_date = $event"
                @update:start-date="form.start_date = $event"
                @update:end-date="form.end_date = $event"
                @update:paid-amount="form.paid_amount = $event"
                @update:template-id="form.template_id = $event"
              />
              <v-textarea
                v-model="form.notes"
                class="mt-3"
                label="ملاحظات العقد"
                rows="2"
              />
            </v-stepper-window-item>
            <v-stepper-window-item :value="2">
              <div class="parties-grid">
                <v-card
                  v-for="role in roleDefinitions"
                  :key="role.key"
                  variant="flat"
                  border
                >
                  <v-card-title>{{ role.label }}</v-card-title>
                  <v-card-text>
                    <PersonSelector
                      v-model="partyIds[role.key]"
                      :people="people"
                      :label="role.label"
                      @created="onPersonCreated"
                    />
                    <PersonDocuments
                      v-model="partyDocuments[role.key]"
                      :person="personFor(role.key)"
                      :scope="scope"
                      :required-document-keys="
                        requiredDocumentKeys(form.contract_type, role.key)
                      "
                      @requirements="onRequirements(role.key, $event)"
                    />
                  </v-card-text>
                </v-card>
              </div>
            </v-stepper-window-item>
            <v-stepper-window-item :value="3">
              <ContractReviewStep
                :contract-label="
                  form.contract_type === 'sale' ? 'عقد بيع' : 'عقد إيجار'
                "
                :asset-label="assetLabel"
                :template-name="selectedTemplate?.name ?? ''"
                :total-amount="totalAmount"
                :paid-amount="toNumber(form.paid_amount)"
                :remaining-amount="calculatedRemaining"
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
                    missing: partyMissingDocuments[role.key]?.length ?? 0,
                  }))
                "
              />
              <v-alert
                v-if="validation && !validation.valid"
                type="warning"
                variant="tonal"
                class="mt-4"
              >
                <div class="font-weight-bold mb-1">لا يمكن إصدار العقد بعد</div>
                <div
                  v-for="issue in validation.issues"
                  :key="`${issue.code}-${issue.path}-${issue.message}`"
                >
                  {{ issue.message }}
                </div>
              </v-alert>
              <v-alert
                v-else-if="validation"
                type="success"
                variant="tonal"
                class="mt-4"
              >
                اكتملت متطلبات العقد ويمكن إصداره.
              </v-alert>
              <v-textarea
                v-model="form.notes"
                class="mt-4"
                label="ملاحظات العقد"
                rows="2"
              />
            </v-stepper-window-item>
          </v-stepper-window>
        </v-stepper>
        <v-dialog v-model="previewOpen" max-width="850">
          <v-card>
            <v-card-title>معاينة العقد</v-card-title>
            <v-card-text class="contract-preview">{{ preview }}</v-card-text>
            <v-card-actions
              ><v-spacer /><v-btn @click="previewOpen = false"
                >إغلاق</v-btn
              ></v-card-actions
            >
          </v-card>
        </v-dialog>
      </v-card-text>
      <v-card-actions>
        <v-btn v-if="step > 1" variant="text" @click="step -= 1">رجوع</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)"
          >إلغاء</v-btn
        >
        <v-btn
          v-if="step === 3"
          variant="tonal"
          :loading="previewing"
          @click="showPreview"
          >معاينة العقد</v-btn
        >
        <v-btn
          v-if="step < 3"
          color="primary"
          :disabled="!canNext"
          @click="next"
          >التالي</v-btn
        >
        <v-btn
          v-else
          color="primary"
          :loading="saving"
          :disabled="!validation?.valid"
          @click="save"
        >
          {{ props.contractId ? "حفظ التعديل" : "إنشاء العقد" }}
        </v-btn>
      </v-card-actions>
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
