<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import DateField from "./DateField.vue";
import ContractDocumentPreview from "./ContractDocumentPreview.vue";
const jurisdictions = [
  { title: "العراق الاتحادي", value: "iq_federal" },
  { title: "إقليم كوردستان", value: "iq_kurdistan" },
];
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
import { useAuth } from "../../composables/useAuth";
import { usePermissions } from "../../composables/usePermissions";
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
  assetOwnerId,
  currentContractDate,
  dateOnly,
  remainingAmount,
  recoverLocalDraft,
  requiredDocumentKeys,
  totalAssetAmount,
  type ContractType,
} from "./contract-form";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    contractId?: number | null;
    initialReview?: boolean;
  }>(),
  { contractId: null, initialReview: false },
);
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [ContractBundle];
}>();
const { currentUser } = useAuth();
const { can } = usePermissions();
const draftUserId = ref<number | null>(currentUser.value?.id ?? null);
const loading = ref(false),
  loadFailed = ref(false),
  saving = ref(false);
const autosaving = ref(false),
  previewing = ref(false),
  submitted = ref(false);
const contractCode = ref("");
const draftId = ref<number | null>(null);
const draftMessage = ref("");
const error = ref(""),
  preview = ref(""),
  previewHtml = ref("");
const previewOpen = ref(false);
const previewDocx = ref("");
const previewPayload = ref<unknown>(null);
const formulationOverride = ref<string | null>(null);
const defaultWording = ref("");
let wordingRequest = 0;
async function loadWording() {
  const request = ++wordingRequest;
  try {
    const row = await contractsService.defaultFormulation(
      form.value.contract_type,
    );
    if (request === wordingRequest) defaultWording.value = row?.content ?? "";
  } catch (cause) {
    if (request === wordingRequest) error.value = getErrorMessage(cause);
  }
}
const validation = ref<ContractValidation | null>(null);
const applicableClauses = ref<ContractValidation["optional_clauses"]>([]);
const apiIssues = ref<Array<{ message: string; path?: string }>>([]);
const people = ref<PersonRecord[]>([]),
  properties = ref<PropertyRecord[]>([]);
const rentals = ref<RentalRecord[]>([]),
  templates = ref<ContractTemplateRecord[]>([]);
const office = ref<{
  company_name: string;
  phone_primary: string | null;
  address: string | null;
} | null>(null);
const legalContext = ref({
  jurisdiction: "iq_federal",
  transaction_kind: "preliminary_sale",
  registration_reference: "",
  intended_use: "",
});
function emptyAgreementDetails() {
  return {
    office_capacity: "broker" as
      | "broker"
      | "seller"
      | "buyer"
      | "lessor"
      | "lessee",
    payment_terms: "",
    transfer_due_date: "",
    handover_conditions: "",
    occupancy_conditions: "",
    utilities_responsibilities: "",
    rental_procedures_note: true,
    police_station: "",
    security_approval_reference: "",
    identity_both_sides_required: false,
    witnesses: [] as Array<{ name: string }>,
  };
}
const agreementDetails = ref(emptyAgreementDetails());
const witnessNames = ref("");
const optionalCodes = ref<string[]>([]),
  paymentInfo = ref<Record<string, unknown>>({});
function emptyForm() {
  return {
    contract_type: "sale" as ContractType,
    property_ids: [] as number[],
    rental_ids: [] as number[],
    contract_date: currentContractDate(),
    start_date: "",
    end_date: "",
    amount: 0,
    paid_amount: "" as string | number | null,
    template_id: null as number | null,
    status: "draft",
    notes: "",
  };
}
const form = ref(emptyForm());
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
const partyLoading = ref<Record<string, boolean>>({});
const ownerAutofilled = ref<number | null>(null);
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let pendingDraftSave: Promise<ContractBundle | null> | null = null;
let lastServerFingerprint = "";
let lastServerUpdatedAt: string | null = null;
let disposed = false;
let finished = false;

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
  const issues: Array<{ message: string; path: string }> = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (!selectedAssets.value.length)
    add("assets", "اختر عقاراً أو عرضاً إيجارياً واحداً على الأقل.");
  if (totalAmount.value <= 0)
    add("amount", "يجب أن يكون المبلغ الإجمالي أكبر من صفر.");
  if (!form.value.contract_date) add("contract_date", "تاريخ العقد مطلوب.");
  if (!selectedTemplate.value)
    add("template_id", "اختر قالباً فعالاً لنوع العقد.");
  const paid = toNumber(form.value.paid_amount);
  if (paid < 0) add("paid_amount", "لا يمكن أن يكون المبلغ المدفوع سالباً.");
  if (paid > totalAmount.value)
    add("paid_amount", "لا يمكن أن يتجاوز المبلغ المدفوع المبلغ الإجمالي.");
  if (form.value.contract_type === "rental") {
    if (!form.value.start_date) add("start_date", "تاريخ بدء الإيجار مطلوب.");
    if (!form.value.end_date) add("end_date", "تاريخ انتهاء الإيجار مطلوب.");
    if (
      form.value.end_date &&
      form.value.start_date &&
      form.value.end_date < form.value.start_date
    )
      add("end_date", "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.");
  }
  for (const role of roleDefinitions.value) {
    if (!partyIds.value[role.key])
      add(`parties.${role.key}`, `اختر ${role.label}.`);
    else if (partyLoading.value[role.key])
      add(
        `parties.${role.key}.documents`,
        "جارٍ تحميل المستمسكات والتحقق منها.",
      );
    else if (partyMissingDocuments.value[role.key]?.length)
      add(`parties.${role.key}.documents`, `أكمل مستمسكات ${role.label}.`);
  }
  return issues;
});
const fieldErrors = computed(() => {
  const result: Record<string, string[]> = {};
  if (!submitted.value) return result;
  for (const issue of [
    ...localIssues.value,
    ...(validation.value?.issues ?? []),
    ...apiIssues.value,
  ]) {
    let path = issue.path ?? "legal";
    if (["asset", "assets", "property_ids", "rental_ids"].includes(path))
      path = "assets";
    path = path.replace(
      /^parties\.(\d+)/,
      (_, index) =>
        `parties.${roleDefinitions.value[Number(index)]?.key ?? index}`,
    );
    (result[path] ??= []).push(issue.message);
  }
  return result;
});
function errorsFor(path: string) {
  return Object.entries(fieldErrors.value)
    .filter(([key]) => key === path || key.startsWith(`${path}.`))
    .flatMap(([, messages]) => messages);
}
const storageKey = computed(() =>
  draftUserId.value
    ? `dalaly.contract-draft.v1.${draftUserId.value}.${props.contractId ?? "new"}`
    : null,
);
function payload() {
  const propertyIds = form.value.property_ids,
    rentalIds = form.value.rental_ids;
  return {
    contract_type: form.value.contract_type,
    property_ids: propertyIds,
    rental_ids: rentalIds,
    property_id: propertyIds[0] ?? null,
    rental_id: rentalIds[0] ?? null,
    template_id: form.value.template_id || selectedTemplate.value?.id || null,
    status: "draft",
    contract_date: form.value.contract_date,
    start_date:
      form.value.contract_type === "rental"
        ? form.value.start_date || null
        : null,
    end_date:
      form.value.contract_type === "rental"
        ? form.value.end_date || null
        : null,
    amount: totalAmount.value,
    paid_amount: toNumber(form.value.paid_amount),
    payment_info: {
      ...paymentInfo.value,
      paid_amount: toNumber(form.value.paid_amount),
    },
    notes: form.value.notes || null,
    formulation_override: formulationOverride.value,
    legal_context: legalContext.value,
    agreement_details: {
      ...agreementDetails.value,
      witnesses: witnessNames.value
        .split(/\n/)
        .map((name) => ({ name: name.trim() }))
        .filter((w) => w.name),
    },
    optional_clause_codes: optionalCodes.value,
    parties: roleDefinitions.value.map((role) => ({
      person_id: partyIds.value[role.key],
      role: role.key,
      identity_document_ids: partyDocuments.value[role.key] ?? [],
    })),
  };
}
type DraftPayload = ReturnType<typeof payload>;
function fingerprint(value: DraftPayload = payload()) {
  return JSON.stringify(value);
}
function capturePayload(): DraftPayload {
  return JSON.parse(fingerprint()) as DraftPayload;
}
function cacheDraft() {
  if (
    !storageKey.value ||
    currentUser.value?.id !== draftUserId.value ||
    loading.value ||
    loadFailed.value ||
    finished
  )
    return false;
  try {
    localStorage.setItem(
      storageKey.value,
      JSON.stringify({
        version: 1,
        draftId: draftId.value,
        lastServerFingerprint,
        lastServerUpdatedAt,
        savedAt: new Date().toISOString(),
        form: form.value,
        legalContext: legalContext.value,
        formulationOverride: formulationOverride.value,
        agreementDetails: agreementDetails.value,
        witnessNames: witnessNames.value,
        optionalCodes: optionalCodes.value,
        paymentInfo: paymentInfo.value,
        partyIds: partyIds.value,
        partyDocuments: partyDocuments.value,
      }),
    );
    return true;
  } catch {
    draftMessage.value = "تعذر الحفظ المحلي. احفظ المسودة قبل مغادرة الصفحة.";
    return false;
  }
}
function clearCachedDraft() {
  try {
    if (storageKey.value) localStorage.removeItem(storageKey.value);
  } catch {
    // A browser storage failure must not hide a successfully issued contract.
  }
}
function reset() {
  clearTimeout(autosaveTimer);
  finished = false;
  draftUserId.value = currentUser.value?.id ?? null;
  contractCode.value = "";
  draftId.value = props.contractId;
  draftMessage.value = "";
  lastServerFingerprint = "";
  lastServerUpdatedAt = null;
  ownerAutofilled.value = null;
  submitted.value = false;
  error.value = "";
  apiIssues.value = [];
  preview.value = "";
  previewHtml.value = "";
  previewDocx.value = "";
  formulationOverride.value = null;
  previewOpen.value = false;
  validation.value = null;
  applicableClauses.value = [];
  form.value = emptyForm();
  legalContext.value = {
    jurisdiction: "iq_federal",
    transaction_kind: "preliminary_sale",
    registration_reference: "",
    intended_use: "",
  };
  agreementDetails.value = emptyAgreementDetails();
  witnessNames.value = "";
  optionalCodes.value = [];
  paymentInfo.value = {};
  partyIds.value = { seller: null, buyer: null, lessor: null, lessee: null };
  partyDocuments.value = { seller: [], buyer: [], lessor: [], lessee: [] };
  partyMissingDocuments.value = {
    seller: [],
    buyer: [],
    lessor: [],
    lessee: [],
  };
  partyLoading.value = {};
}
function hydrate(bundle: ContractBundle) {
  const contract = bundle.contract;
  draftId.value = contract.id;
  contractCode.value = contract.code;
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
  form.value.notes = contract.notes ?? "";
  formulationOverride.value = contract.formulation_override ?? null;
  paymentInfo.value = { ...contract.payment_info };
  legalContext.value = {
    jurisdiction: "iq_federal",
    transaction_kind:
      contract.contract_type === "rental" ? "lease" : "preliminary_sale",
    registration_reference: "",
    intended_use: "",
    ...contract.legal_context,
  };
  agreementDetails.value = {
    ...emptyAgreementDetails(),
    ...contract.agreement_details,
  };
  witnessNames.value = agreementDetails.value.witnesses
    .map((w) => w.name)
    .join("\n");
  optionalCodes.value = contract.optional_clause_codes ?? [];
  for (const party of bundle.parties) {
    partyIds.value[party.role] = party.person_id;
    partyDocuments.value[party.role] = bundle.attachments
      .filter((item) => item.contract_party_id === party.id)
      .map((item) => item.identity_document_id);
  }
  lastServerFingerprint = fingerprint();
  lastServerUpdatedAt = serverUpdatedAt(bundle);
}
function serverUpdatedAt(bundle: ContractBundle) {
  return (
    (bundle.contract as ContractBundle["contract"] & { updated_at?: string })
      .updated_at ?? null
  );
}
function restoreCachedValues(cached: Record<string, unknown>) {
  formulationOverride.value =
    typeof cached.formulationOverride === "string"
      ? cached.formulationOverride
      : null;
  form.value = {
    ...emptyForm(),
    ...(cached.form as typeof form.value),
    status: "draft",
  };
  legalContext.value = {
    ...legalContext.value,
    ...(cached.legalContext as typeof legalContext.value),
  };
  agreementDetails.value = {
    ...emptyAgreementDetails(),
    ...(cached.agreementDetails as typeof agreementDetails.value),
  };
  witnessNames.value = String(cached.witnessNames ?? "");
  optionalCodes.value = (cached.optionalCodes as string[]) ?? [];
  paymentInfo.value = (cached.paymentInfo as Record<string, unknown>) ?? {};
  partyIds.value = {
    ...partyIds.value,
    ...(cached.partyIds as typeof partyIds.value),
  };
  partyDocuments.value = {
    ...partyDocuments.value,
    ...(cached.partyDocuments as typeof partyDocuments.value),
  };
}
async function load() {
  if (!props.modelValue) return;
  loading.value = true;
  loadFailed.value = false;
  error.value = "";
  try {
    const [
      loadedPeople,
      loadedProperties,
      loadedRentals,
      loadedTemplates,
      loadedOffice,
    ] = await Promise.all([
      peopleService.listPeople(),
      propertiesService.listProperties(),
      rentalsService.listRentals(),
      contractsService.listTemplates(),
      officeService.getCompanySettings(),
    ]);
    people.value = loadedPeople;
    properties.value = loadedProperties;
    rentals.value = loadedRentals;
    templates.value = loadedTemplates.filter(
      (item) =>
        (item.contract_type === "sale" || item.contract_type === "rental") &&
        item.is_active,
    );
    office.value = loadedOffice;
    let cached: Record<string, unknown> | null = null;
    try {
      cached = storageKey.value
        ? JSON.parse(localStorage.getItem(storageKey.value) ?? "null")
        : null;
      if (cached?.version !== 1) cached = null;
    } catch {
      clearCachedDraft();
    }
    const existingId =
      props.contractId ??
      (Number.isSafeInteger(cached?.draftId) ? Number(cached?.draftId) : null);
    if (existingId) {
      const existing = await contractsService.getContract(existingId);
      if (existing.contract.status !== "draft") {
        clearCachedDraft();
        if (props.contractId) throw new Error("يمكن تعديل العقود المسودة فقط.");
        cached = null;
        draftMessage.value =
          "المسودة السابقة صدرت بالفعل. يمكنك إنشاء عقد جديد.";
      } else {
        hydrate(existing);
        const sameServerVersion = recoverLocalDraft(
          {
            status: existing.contract.status,
            updatedAt: lastServerUpdatedAt,
            fingerprint: lastServerFingerprint,
          },
          cached
            ? {
                updatedAt: cached.lastServerUpdatedAt,
                fingerprint: cached.lastServerFingerprint,
              }
            : null,
        );
        if (cached && sameServerVersion) {
          restoreCachedValues(cached);
          draftMessage.value = "استُعيدت المسودة والتغييرات المحلية المحفوظة.";
        } else
          draftMessage.value =
            "استُعيدت أحدث نسخة من المسودة المحفوظة في النظام.";
      }
    } else if (cached) {
      restoreCachedValues(cached);
      draftMessage.value =
        "استُعيدت بيانات العقد غير المكتمل المحفوظة على هذا الجهاز.";
    }
    if (!currentTemplates.value.some((t) => t.id === form.value.template_id))
      form.value.template_id = currentTemplates.value[0]?.id ?? null;
    await loadWording();
    await nextTick();
  } catch (cause) {
    loadFailed.value = true;
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
function onTypeChanged(value: ContractType) {
  form.value.contract_type = value;
  formulationOverride.value = null;
  void loadWording();
  legalContext.value.transaction_kind =
    value === "rental" ? "lease" : "preliminary_sale";
  agreementDetails.value.office_capacity = "broker";
  optionalCodes.value = [];
  paymentInfo.value = {};
  form.value.property_ids = [];
  form.value.rental_ids = [];
  form.value.start_date = "";
  form.value.end_date = "";
  form.value.amount = 0;
  form.value.paid_amount = "";
  form.value.template_id = currentTemplates.value[0]?.id ?? null;
  validation.value = null;
  applicableClauses.value = [];
  ownerAutofilled.value = null;
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
  people.value = [
    person,
    ...people.value.filter((item) => item.id !== person.id),
  ];
}
function personFor(role: string) {
  return (
    people.value.find((person) => person.id === partyIds.value[role]) ?? null
  );
}
function onRequirements(role: string, value: { missingKeys: string[] }) {
  partyMissingDocuments.value[role] = value.missingKeys;
}
function captureError(cause: unknown) {
  const issues = (
    cause as {
      issues?: Array<{ message: string; path?: string | (string | number)[] }>;
    }
  )?.issues;
  if (issues?.length) {
    apiIssues.value = issues.map((issue) => ({
      ...issue,
      path: Array.isArray(issue.path) ? issue.path.join(".") : issue.path,
    }));
    error.value = "";
  } else error.value = getErrorMessage(cause);
}
async function validate(snapshot: DraftPayload = capturePayload()) {
  const result = await contractsService.validateContract(snapshot);
  if (fingerprint(snapshot) === fingerprint()) {
    validation.value = result;
    applicableClauses.value = result.optional_clauses;
  }
  return result;
}
async function persistDraft(
  snapshot: DraftPayload,
  checked?: ContractValidation,
) {
  if (pendingDraftSave) await pendingDraftSave;
  const assertDraftSession = () => {
    if (!draftUserId.value || currentUser.value?.id !== draftUserId.value)
      throw new Error(
        "تغيّرت جلسة المستخدم. افتح العقد مجدداً من حسابك لحفظه.",
      );
  };
  assertDraftSession();
  const serialized = fingerprint(snapshot);
  if (draftId.value && serialized === lastServerFingerprint) {
    const existing = await contractsService.getContract(draftId.value);
    if (existing.contract.status !== "draft")
      throw new Error(
        "المسودة صدرت أو أُلغيت بالفعل. افتح مراجعة العقد للاطلاع على حالته الحالية.",
      );
    return existing;
  }
  const operation = (async () => {
    const result =
      checked ?? (await contractsService.validateContract(snapshot));
    if (fingerprint(snapshot) === fingerprint()) {
      validation.value = result;
      applicableClauses.value = result.optional_clauses;
    }
    if (!result.valid) return null;
    assertDraftSession();
    const bundle = draftId.value
      ? await contractsService.updateContract(draftId.value, snapshot)
      : await contractsService.createContract(snapshot);
    draftId.value = bundle.contract.id;
    contractCode.value = bundle.contract.code;
    lastServerFingerprint = serialized;
    lastServerUpdatedAt = serverUpdatedAt(bundle);
    cacheDraft();
    return bundle;
  })();
  pendingDraftSave = operation;
  try {
    return await operation;
  } finally {
    if (pendingDraftSave === operation) pendingDraftSave = null;
  }
}
async function autosave() {
  if (
    disposed ||
    finished ||
    loading.value ||
    loadFailed.value ||
    saving.value ||
    autosaving.value ||
    !can("contracts.manage")
  )
    return;
  const cached = cacheDraft();
  if (localIssues.value.length) {
    draftMessage.value = cached
      ? "محفوظ تلقائياً على هذا الجهاز. يُحفظ في النظام عند اكتمال البيانات."
      : "تعذر الحفظ المحلي. أكمل البيانات واحفظ المسودة قبل مغادرة الصفحة.";
    return;
  }
  autosaving.value = true;
  const snapshot = capturePayload();
  try {
    const bundle = await persistDraft(snapshot);
    draftMessage.value = bundle
      ? "حُفظت المسودة تلقائياً في النظام."
      : cached
        ? "محفوظ على هذا الجهاز؛ أكمل بيانات الأطراف والمستمسكات للحفظ في النظام."
        : "تعذر الحفظ المحلي. أكمل البيانات واحفظ المسودة قبل مغادرة الصفحة.";
  } catch {
    draftMessage.value = cached
      ? "محفوظ على هذا الجهاز. تعذر الحفظ في النظام؛ ستُعاد المحاولة عند التعديل."
      : "تعذر حفظ المسودة في النظام وعلى هذا الجهاز. أبقِ الصفحة مفتوحة وأعد الحفظ.";
  } finally {
    autosaving.value = false;
    if (
      !disposed &&
      !finished &&
      !saving.value &&
      fingerprint(snapshot) !== fingerprint()
    ) {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => void autosave(), 1200);
    }
  }
}
async function showPreview() {
  if (previewing.value || saving.value) return;
  submitted.value = true;
  error.value = "";
  apiIssues.value = [];
  await nextTick();
  if (localIssues.value.length) return;
  previewing.value = true;
  try {
    const snapshot = capturePayload();
    const result = await validate(snapshot);
    if (!result.valid) return;
    const document = await contractsService.previewContract(snapshot);
    if (fingerprint(snapshot) !== fingerprint()) {
      error.value =
        "تغيّرت البيانات أثناء تجهيز المعاينة. افتح المعاينة مجدداً.";
      return;
    }
    preview.value = document.content;
    previewHtml.value = document.html;
    previewDocx.value = document.docx_data;
    previewPayload.value = snapshot;
    previewOpen.value = true;
  } catch (cause) {
    captureError(cause);
  } finally {
    previewing.value = false;
  }
}
async function save(issue: boolean) {
  if (
    saving.value ||
    !can("contracts.manage") ||
    (issue && !can("contracts.issue"))
  )
    return;
  clearTimeout(autosaveTimer);
  submitted.value = true;
  error.value = "";
  apiIssues.value = [];
  saving.value = true;
  try {
    await nextTick();
    if (pendingDraftSave) await pendingDraftSave;
    const cached = cacheDraft();
    if (localIssues.value.length) {
      if (!issue)
        draftMessage.value = cached
          ? "حُفظت البيانات غير المكتملة على هذا الجهاز؛ أكمل الحقول المشار إليها لحفظ المسودة في النظام."
          : "تعذر الحفظ المحلي. أكمل الحقول المشار إليها واحفظ المسودة قبل مغادرة الصفحة.";
      return;
    }
    const snapshot = capturePayload();
    const result = await validate(snapshot);
    if (!result.valid) return;
    if (issue && !result.legal_ready) {
      apiIssues.value = [
        {
          path: "legal",
          message:
            "الصيغة القانونية المنطبقة غير جاهزة للإصدار. راجع الصيغ الفعالة قبل الإصدار.",
        },
      ];
      return;
    }
    let bundle = await persistDraft(snapshot, result);
    if (!bundle) return;
    if (fingerprint(snapshot) !== fingerprint()) {
      error.value =
        "تغيّرت البيانات أثناء الحفظ. حُفظت المسودة؛ راجع التغييرات ثم أصدر العقد.";
      return;
    }
    if (issue) {
      if (currentUser.value?.id !== draftUserId.value)
        throw new Error("تغيّرت جلسة المستخدم أثناء الحفظ. أُبقي العقد مسودة.");
      bundle = await contractsService.issueContract(bundle.contract.id);
    }
    finished = true;
    clearCachedDraft();
    emit("saved", bundle);
    emit("update:modelValue", false);
  } catch (cause) {
    captureError(cause);
  } finally {
    saving.value = false;
  }
}
watch(selectedAssets, () => {
  if (loading.value) return;
  applicableClauses.value = [];
  optionalCodes.value = [];
  form.value.amount = totalAmount.value;
  const ownerRole = form.value.contract_type === "sale" ? "seller" : "lessor";
  const current = partyIds.value[ownerRole],
    ownerId = assetOwnerId(selectedAssets.value, people.value);
  if (!current || current === ownerAutofilled.value) {
    partyIds.value[ownerRole] = ownerId;
    ownerAutofilled.value = ownerId;
  }
});
watch(
  [
    form,
    legalContext,
    formulationOverride,
    agreementDetails,
    witnessNames,
    optionalCodes,
    paymentInfo,
    partyIds,
    partyDocuments,
  ],
  () => {
    if (
      loading.value ||
      loadFailed.value ||
      !props.modelValue ||
      disposed ||
      finished
    )
      return;
    validation.value = null;
    apiIssues.value = [];
    cacheDraft();
    clearTimeout(autosaveTimer);
    if (!saving.value) autosaveTimer = setTimeout(() => void autosave(), 1200);
  },
  { deep: true },
);
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      reset();
      void load();
    } else clearTimeout(autosaveTimer);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  cacheDraft();
  disposed = true;
  clearTimeout(autosaveTimer);
});
</script>

<template>
  <v-card class="contract-wizard" variant="flat" border dir="rtl">
    <v-card-text>
      <v-progress-linear v-if="loading" indeterminate class="mb-3" />
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="mb-3"
        role="alert"
      >
        {{ error }}
        <template v-if="loadFailed" #append
          ><v-btn variant="text" :loading="loading" @click="load"
            >إعادة المحاولة</v-btn
          ></template
        >
      </v-alert>
      <v-alert type="info" variant="tonal" class="mb-4" density="compact"
        >اتفاق المكتب العقاري لا يغني عن التصديق أو التسجيل الرسمي المطلوب.
        تتابع هذه الإجراءات بصورة مستقلة عن إصدار العقد في النظام.</v-alert
      >
      <fieldset
        :disabled="loading || loadFailed || saving"
        :inert="loading || loadFailed || saving || undefined"
        class="contract-form-sections"
      >
        <v-sheet class="contract-section" border rounded>
          <h2 class="wizard-section-title">معلومات العقد والعقار</h2>
          <v-text-field
            :model-value="contractCode || 'يُنشأ تلقائياً عند الحفظ'"
            label="رقم العقد"
            readonly
            class="contract-number"
          />
          <ContractDetailsStep
            section="information"
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
            :errors="fieldErrors"
            @update:contract-type="onTypeChanged"
            @update:contract-date="form.contract_date = $event"
            @update:start-date="form.start_date = $event"
            @update:end-date="form.end_date = $event"
            @update:template-id="form.template_id = $event"
          />
          <ContractDetailsStep
            section="assets"
            :contract-type="form.contract_type"
            :property-ids="form.property_ids"
            :rental-ids="form.rental_ids"
            :contract-date="form.contract_date"
            :start-date="form.start_date"
            :end-date="form.end_date"
            :amount="totalAmount"
            :paid-amount="form.paid_amount"
            :remaining-amount="calculatedRemaining"
            :template-id="form.template_id"
            :properties="properties"
            :rentals="rentals"
            :templates="currentTemplates"
            :errors="fieldErrors"
            @update:property-ids="form.property_ids = $event"
            @update:rental-ids="form.rental_ids = $event"
          />
          <div v-if="selectedAssets.length" class="selected-assets">
            <v-sheet
              v-for="asset in selectedAssets"
              :key="asset.id"
              class="selected-asset"
              color="surface-variant"
              rounded
              ><v-icon icon="mdi-home-city-outline" color="primary" />
              <div>
                <strong>{{ asset.name || asset.code }}</strong
                ><small>{{
                  [
                    asset.governorate,
                    asset.district,
                    asset.neighborhood,
                    asset.address_details,
                  ]
                    .filter(Boolean)
                    .join("، ")
                }}</small
                ><small
                  >المالك: {{ asset.owner_name || "غير مسجل" }} ·
                  {{ asset.owner_phone || "الهاتف غير مسجل" }}</small
                >
              </div></v-sheet
            >
          </div>
          <div v-if="ownerAutofilled" class="text-success text-caption mt-2">
            اختير المالك المسجل تلقائياً؛ يمكنك تغيير الطرف عند الحاجة.
          </div>
          <div
            v-else-if="selectedAssets.length"
            class="text-medium-emphasis text-caption mt-2"
          >
            اختر المالك من الأطراف؛ لا يوجد مالك مسجل مشترك يمكن تعبئته تلقائياً
            لهذه العقارات.
          </div>
        </v-sheet>
        <v-sheet class="contract-section" border rounded>
          <h2 class="wizard-section-title">الأطراف والمستمسكات</h2>
          <div class="parties-grid">
            <v-card
              v-for="role in roleDefinitions"
              :key="role.key"
              variant="flat"
              border
              ><v-card-title>{{ role.label }}</v-card-title
              ><v-card-text>
                <PersonSelector
                  v-model="partyIds[role.key]"
                  :people="people"
                  :label="role.label"
                  :error-messages="
                    errorsFor(`parties.${role.key}`).filter(
                      (message) =>
                        !errorsFor(`parties.${role.key}.documents`).includes(
                          message,
                        ),
                    )
                  "
                  @created="onPersonCreated"
                />
                <PersonDocuments
                  v-model="partyDocuments[role.key]"
                  :person="personFor(role.key)"
                  :scope="scope"
                  :required-document-keys="
                    requiredDocumentKeys(form.contract_type, role.key)
                  "
                  :error-messages="errorsFor(`parties.${role.key}.documents`)"
                  @requirements="onRequirements(role.key, $event)"
                  @loading="partyLoading[role.key] = $event"
                /> </v-card-text
            ></v-card>
          </div>
        </v-sheet>
        <v-sheet class="contract-section" border rounded>
          <h2 class="wizard-section-title">المبالغ والمدفوعات</h2>
          <ContractDetailsStep
            section="payments"
            :contract-type="form.contract_type"
            :property-ids="form.property_ids"
            :rental-ids="form.rental_ids"
            :contract-date="form.contract_date"
            :start-date="form.start_date"
            :end-date="form.end_date"
            :amount="totalAmount"
            :paid-amount="form.paid_amount"
            :remaining-amount="calculatedRemaining"
            :template-id="form.template_id"
            :properties="properties"
            :rentals="rentals"
            :templates="currentTemplates"
            :errors="fieldErrors"
            @update:paid-amount="form.paid_amount = $event"
          />
        </v-sheet>
        <v-sheet class="contract-section" border rounded>
          <h2 class="wizard-section-title">الشروط القانونية</h2>
          <v-textarea
            v-model="form.notes"
            label="الشروط الإضافية التي اتفق عليها الطرفان"
            rows="2"
            :error-messages="errorsFor('notes')"
          />
          <v-row
            ><v-col cols="12" md="6"
              ><v-select
                v-model="legalContext.jurisdiction"
                :items="jurisdictions"
                label="الاختصاص القانوني"
                :error-messages="errorsFor('legal_context')" /></v-col
            ><v-col cols="12" md="6"
              ><v-text-field
                v-model="legalContext.intended_use"
                label="الاستخدام المتفق عليه للعقار" /></v-col
            ><v-col
              v-if="
                legalContext.transaction_kind === 'registered_transfer_record'
              "
              cols="12"
              ><v-text-field
                v-model="legalContext.registration_reference"
                label="مرجع التسجيل العقاري"
                :error-messages="
                  errorsFor('legal_context.registration_reference')
                " /></v-col
          ></v-row>
          <v-expansion-panels
            ><v-expansion-panel title="تفاصيل الاتفاق والدفع والتسليم (اختياري)"
              ><v-expansion-panel-text>
                <v-select
                  v-model="agreementDetails.office_capacity"
                  label="صفة المكتب في هذا الاتفاق"
                  :items="[
                    { title: 'الوسيط العقاري', value: 'broker' },
                    ...roleDefinitions.map((r) => ({
                      title: `طرف بصفة ${r.label} — أدرجه ضمن الأطراف`,
                      value: r.key,
                    })),
                  ]"
                  :error-messages="
                    errorsFor('agreement_details.office_capacity')
                  "
                />
                <v-textarea
                  v-model="agreementDetails.payment_terms"
                  label="شروط وجدول الدفع المتفق عليه"
                  rows="2"
                />
                <DateField
                  v-if="form.contract_type === 'sale'"
                  v-model="agreementDetails.transfer_due_date"
                  label="موعد استكمال إجراءات نقل الملكية المتفق عليه، إن توفر"
                />
                <v-textarea
                  v-model="agreementDetails.handover_conditions"
                  label="شروط وتسليم العقار"
                  rows="2"
                />
                <template v-if="form.contract_type === 'rental'"
                  ><v-textarea
                    v-model="agreementDetails.occupancy_conditions"
                    label="شروط الإشغال المتفق عليها"
                    rows="2" /><v-textarea
                    v-model="agreementDetails.utilities_responsibilities"
                    label="مسؤوليات الماء والكهرباء والخدمات حسب الاتفاق"
                    rows="2" /><v-switch
                    v-model="agreementDetails.rental_procedures_note"
                    label="إظهار ملاحظة التسجيل والموافقات عند اشتراطها"
                    color="primary" /><v-text-field
                    v-model="agreementDetails.police_station"
                    label="مركز الشرطة المعني، عند الاقتضاء" /><v-text-field
                    v-model="agreementDetails.security_approval_reference"
                    label="بيانات الموافقة الأمنية أو السكنية المتاحة"
                /></template>
                <v-textarea
                  v-model="witnessNames"
                  label="أسماء الشهود، اسم في كل سطر، عند وجودهم"
                  rows="2"
                /><v-switch
                  v-model="agreementDetails.identity_both_sides_required"
                  label="طلب وجهي الهوية لهذا الاتفاق"
                  color="primary"
                /> </v-expansion-panel-text></v-expansion-panel
          ></v-expansion-panels>
          <v-select
            v-if="applicableClauses.length"
            v-model="optionalCodes"
            :items="
              applicableClauses.map((c) => ({
                title: c.title,
                value: c.code,
              }))
            "
            label="البنود القانونية الاختيارية المنطبقة"
            multiple
            chips
            class="mt-3"
          />
          <v-alert
            v-if="errorsFor('legal').length"
            type="warning"
            variant="tonal"
            class="mt-3"
            ><div v-for="message in errorsFor('legal')" :key="message">
              {{ message }}
            </div></v-alert
          >
          <v-textarea
            :model-value="formulationOverride ?? defaultWording"
            label="نص الصيغة لهذا العقد"
            hint="يمكن تعديل النص قبل الإصدار. المتغيرات تُملأ تلقائياً، وتبقى الصيغة الأصلية محفوظة."
            persistent-hint
            variant="outlined"
            rows="6"
            auto-grow
            class="mt-4"
            @update:model-value="formulationOverride = $event || null"
          />
          <v-btn
            v-if="formulationOverride !== null"
            variant="tonal"
            color="primary"
            @click="formulationOverride = null"
            >استخدام الصيغة الافتراضية</v-btn
          >
          <v-alert
            v-if="validation?.legal_warnings.length"
            type="warning"
            variant="tonal"
            class="mt-3"
            ><div v-for="warning in validation.legal_warnings" :key="warning">
              {{ warning }}
            </div></v-alert
          >
        </v-sheet>
        <v-expansion-panels
          ><v-expansion-panel title="ملخص العقد والمكتب"
            ><v-expansion-panel-text
              ><ContractReviewStep
                :contract-label="
                  form.contract_type === 'sale'
                    ? 'اتفاق بيع عقار'
                    : 'اتفاق إيجار عقار'
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
                " /></v-expansion-panel-text></v-expansion-panel
        ></v-expansion-panels>
        <v-alert
          v-if="errorsFor('office').length"
          type="warning"
          variant="tonal"
          ><div v-for="message in errorsFor('office')" :key="message">
            {{ message }}
          </div>
          <v-btn variant="text" to="/settings"
            >استكمال بيانات المكتب</v-btn
          ></v-alert
        >
      </fieldset>
      <v-dialog v-model="previewOpen" max-width="1000"
        ><v-card
          ><v-card-title>معاينة العقد قبل الإصدار</v-card-title
          ><v-card-text
            ><ContractDocumentPreview
              :docx-data="previewDocx"
              :load-pdf="() => contractsService.previewDraftPdf(previewPayload)"
              :html="previewHtml"
              :text="preview" /></v-card-text
          ><v-card-actions
            ><v-spacer /><v-btn @click="previewOpen = false"
              >إغلاق</v-btn
            ></v-card-actions
          ></v-card
        ></v-dialog
      >
    </v-card-text>
    <v-card-actions
      class="contract-actions"
      role="toolbar"
      aria-label="حفظ وإصدار العقد"
    >
      <div class="draft-status text-caption" role="status">
        <v-progress-circular
          v-if="autosaving"
          indeterminate
          size="14"
          width="2"
          class="me-1"
        />{{ draftMessage || "تُحفظ بيانات العقد تلقائياً أثناء العمل." }}
      </div>
      <v-spacer />
      <v-btn
        variant="text"
        :disabled="saving"
        @click="emit('update:modelValue', false)"
        >رجوع</v-btn
      >
      <v-btn
        variant="text"
        :disabled="loading || loadFailed || saving"
        :loading="previewing"
        @click="showPreview"
        >معاينة</v-btn
      >
      <v-btn
        v-if="can('contracts.manage')"
        variant="tonal"
        :disabled="loading || loadFailed || saving || previewing"
        @click="save(false)"
        >حفظ مسودة</v-btn
      >
      <v-btn
        v-if="can('contracts.manage') && can('contracts.issue')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-file-check-outline"
        :loading="saving"
        :disabled="loading || loadFailed || previewing"
        @click="save(true)"
        >حفظ وإصدار العقد</v-btn
      >
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.contract-wizard {
  overflow: visible;
}
.contract-form-sections {
  border: 0;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 20px;
  min-inline-size: 0;
}
.contract-section {
  padding: 20px;
}
.wizard-section-title {
  font-size: calc(17px * var(--dal-font-scale));
  font-weight: 600;
  margin-bottom: 18px;
}
.contract-number {
  max-width: 420px;
}
.selected-assets,
.parties-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.selected-assets {
  margin-top: 14px;
}
.selected-asset {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
}
.selected-asset strong,
.selected-asset small {
  display: block;
}
.selected-asset small {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.contract-actions {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: 12px 20px;
  flex-wrap: wrap;
  border-top: 1px solid var(--dal-stroke);
  background: rgb(var(--v-theme-surface));
}
.draft-status {
  flex-basis: 100%;
  color: var(--dal-muted);
}
@media (max-width: 820px) {
  .parties-grid,
  .selected-assets {
    grid-template-columns: 1fr;
  }
  .contract-section {
    padding: 14px;
  }
  .contract-actions {
    padding: 12px;
  }
}
</style>
