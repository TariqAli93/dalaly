<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  TEMPLATES,
  TEMPLATE_KEYS,
  deepClone,
  findIssues,
  pickListing,
  pickParty,
  resolveValues,
  rolesOf,
  scheduleFor,
  type AgreementContext,
  type AgreementTerms,
  type ContractDocument,
  type ListingRecord,
  type PartyRecord,
  type PartyRole,
  type RenderContext,
  type TemplateKey,
} from "@contract-document/index";
import AppPage from "../components/app/AppPage.vue";
import ContractStudio from "../components/contracts/ContractStudio.vue";
import AgreementPartiesStep from "../components/contracts/AgreementPartiesStep.vue";
import AgreementListingStep from "../components/contracts/AgreementListingStep.vue";
import AgreementTermsStep from "../components/contracts/AgreementTermsStep.vue";
import AgreementReviewStep from "../components/contracts/AgreementReviewStep.vue";
import AgreementRevisionsDialog from "../components/contracts/AgreementRevisionsDialog.vue";
import ReasonDialog from "../components/contracts/ReasonDialog.vue";
import LeaseActivateDialog from "../components/leases/LeaseActivateDialog.vue";
import DraftNotice from "../components/shared/DraftNotice.vue";
import * as agreementsService from "../services/agreements.service";
import * as peopleService from "../services/people.service";
import * as propertiesService from "../services/properties.service";
import * as rentalsService from "../services/rentals.service";
import { ApiError, getErrorMessage } from "../services/api.service";
import { platform } from "../platform";
import { useConfirm } from "../composables/useConfirm";
import { usePermissions } from "../composables/usePermissions";
import { useSaveShortcut } from "../composables/useSaveShortcut";
import { useSnackbar } from "../composables/useSnackbar";
import {
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_STEPS,
  agreementStatusColor,
  type AgreementStepKey,
} from "../constants/agreements";
import {
  exportContractDocx,
  exportContractPdf,
  exportSourceFor,
  officeLogoUrl,
  printContract,
} from "../utils/contractExport";
import {
  clearLocalDraft,
  readLocalDraft,
  writeLocalDraft,
  type LocalDraft,
} from "../utils/localDraft";
import { formatDateTime } from "../utils/format";
import type {
  AgreementRecord,
  AgreementRevisionRecord,
  AgreementSavePayload,
  AgreementTemplateRecord,
  LeaseDetail,
} from "../types";

/**
 * One contract from choosing its type to issuing it: parties, property,
 * details, clauses and content (the studio, for this contract only), then
 * preview and issue. A draft saves itself a moment after each change; a
 * failed or interrupted save stays on disk and is offered on the next visit.
 * An issued contract shows its stored revision and changes only through a
 * new revision.
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { notifyError, notifySuccess, notifyInfo } = useSnackbar();
const { openConfirm, confirmAsync } = useConfirm();

type EditState = {
  terms: AgreementTerms;
  document: ContractDocument;
  parties: Partial<Record<PartyRole, number | null>>;
  listingId: number | null;
};

const isNew = computed(() => route.name === "contract-new");
const agreementId = computed(() => Number(route.params.id) || 0);
const record = shallowRef<AgreementRecord | null>(null);
const state = ref<EditState | null>(null);
const context = ref<AgreementContext>({
  parties: {},
  listing: null,
  company: null,
});
const revision = shallowRef<AgreementRevisionRecord | null>(null);
const reference = shallowRef<AgreementTemplateRecord | null>(null);
const loading = ref(false);
const creating = ref(false);
const draftRev = ref(0);
const saveState = ref<"saved" | "pending" | "saving" | "error" | "conflict">(
  "saved",
);
const localDraft = shallowRef<LocalDraft<EditState> | null>(null);
const busy = ref(false);
const revisionsOpen = ref(false);
const reasonMode = ref<"amend" | "cancel" | null>(null);
// An issued rent contract is put in force as a lease from here.
const leaseOpen = ref(false);
function onLeaseActivated(lease: LeaseDetail) {
  notifySuccess(`فُعّل الإيجار ${lease.code}.`);
  void router.push(`/leases/${lease.id}`);
}
let savedParts: Record<string, string> = {};

const step = computed<AgreementStepKey>({
  get: () => {
    const value = String(route.query.step ?? "parties");
    return (
      AGREEMENT_STEPS.some((item) => item.key === value) ? value : "parties"
    ) as AgreementStepKey;
  },
  set: (value) =>
    void router.replace({ query: { ...route.query, step: value } }),
});

const template = computed<TemplateKey | null>(
  () => record.value?.template_key ?? null,
);
const roles = computed(() => (template.value ? rolesOf(template.value) : []));
const editable = computed(
  () => record.value?.status === "draft" && can("agreements.manage"),
);
const showsRevision = computed(
  () =>
    (record.value?.status === "issued" ||
      record.value?.status === "cancelled") &&
    Boolean(revision.value),
);
const localKey = () => `agreement:${agreementId.value}`;

// ─── Values, issues, render contexts ────────────────────────────────────
const values = computed(() =>
  record.value && state.value
    ? resolveValues(
        {
          template: record.value.template_key,
          number: record.value.code,
          revision: record.value.current_revision + 1,
        },
        context.value,
        state.value.terms,
      )
    : {},
);
const issues = computed(() =>
  record.value &&
  state.value &&
  (record.value.status === "draft" || record.value.status === "review")
    ? findIssues(
        record.value.template_key,
        state.value.document,
        context.value,
        state.value.terms,
        values.value,
      )
    : [],
);
const issueCount = (key: AgreementStepKey) =>
  key === "review"
    ? 0
    : issues.value.filter((issue) => issue.step === key).length;

const schedule = computed(() =>
  template.value && state.value
    ? scheduleFor(template.value, state.value.terms)
    : [],
);
const reviewCtx = computed<RenderContext | null>(() => {
  if (!record.value) return null;
  if (showsRevision.value && revision.value)
    return {
      template: revision.value.template_key,
      values: revision.value.values,
      missing: "blank",
      logo: revision.value.logo,
      schedule: scheduleFor(revision.value.template_key, revision.value.terms),
      watermark: record.value.status === "cancelled" ? "ملغى" : null,
    };
  return {
    template: record.value.template_key,
    values: values.value,
    missing: "label",
    logo: officeLogoUrl(),
    schedule: schedule.value,
    watermark: "مسودة",
  };
});
const reviewDocument = computed(() =>
  showsRevision.value && revision.value
    ? revision.value.document
    : (state.value?.document ?? null),
);

// ─── Loading ────────────────────────────────────────────────────────────
function partsOf(value: EditState) {
  return {
    document: JSON.stringify(value.document),
    terms: JSON.stringify(value.terms),
    parties: JSON.stringify(value.parties),
    listing: JSON.stringify(value.listingId),
  };
}

async function load() {
  if (isNew.value || !agreementId.value) return;
  loading.value = true;
  try {
    const loaded = await agreementsService.getAgreement(agreementId.value);
    applyRecord(loaded);
    const stored = readLocalDraft<EditState>(localKey());
    localDraft.value =
      stored &&
      stored.base === loaded.draft_rev &&
      loaded.status === "draft" &&
      JSON.stringify(stored.data) !== JSON.stringify(state.value)
        ? stored
        : null;
    if (stored && !localDraft.value) clearLocalDraft(localKey());
    await pickReturnedListing();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

function applyRecord(loaded: AgreementRecord) {
  record.value = loaded;
  const parties: EditState["parties"] = {};
  for (const role of rolesOf(loaded.template_key)) parties[role] = null;
  for (const party of loaded.parties) parties[party.role] = party.person_id;
  state.value = {
    terms: deepClone(loaded.terms),
    document: deepClone(loaded.document),
    parties,
    listingId: loaded.property_id ?? loaded.rental_id ?? null,
  };
  context.value = deepClone(loaded.context);
  draftRev.value = loaded.draft_rev;
  savedParts = partsOf(state.value);
  saveState.value = "saved";
  revision.value = null;
  if (
    (loaded.status === "issued" || loaded.status === "cancelled") &&
    loaded.current_revision
  )
    void agreementsService
      .getAgreementRevision(loaded.id, loaded.current_revision)
      .then((stored) => {
        if (record.value?.id === loaded.id) revision.value = stored;
      })
      .catch((error) => notifyError(getErrorMessage(error)));
}

/** Back from adding a listing (?listing=<id>): it becomes the contract's. */
async function pickReturnedListing() {
  const listingId = Number(route.query.listing);
  if (
    !Number.isSafeInteger(listingId) ||
    listingId <= 0 ||
    !editable.value ||
    !state.value
  )
    return;
  try {
    const sale = record.value!.kind === "sale";
    const item = sale
      ? await propertiesService.getProperty(listingId)
      : await rentalsService.getRental(listingId);
    state.value.listingId = listingId;
    onListing(
      pickListing(
        sale ? "property" : "rental",
        item as unknown as Record<string, unknown>,
      ),
    );
    notifySuccess("اختير العرض الجديد عقاراً لهذا العقد.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
  const { listing: _listing, ...query } = route.query;
  void router.replace({ query });
}

async function loadReference() {
  if (!template.value || reference.value?.key === template.value) return;
  try {
    reference.value = await agreementsService.getTemplate(template.value);
  } catch {
    // Restoring clauses needs it; the editor works without it.
  }
}

// ─── Autosave ───────────────────────────────────────────────────────────
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | null = null;

function changedPayload(): AgreementSavePayload | null {
  if (!state.value || !record.value) return null;
  const parts = partsOf(state.value);
  const payload: AgreementSavePayload = { base_rev: draftRev.value };
  let changed = false;
  if (parts.document !== savedParts.document) {
    payload.document = state.value.document;
    changed = true;
  }
  if (parts.terms !== savedParts.terms) {
    payload.terms = state.value.terms;
    changed = true;
  }
  if (parts.parties !== savedParts.parties) {
    payload.parties = Object.entries(state.value.parties)
      .filter((entry): entry is [PartyRole, number] => Boolean(entry[1]))
      .map(([role, person_id]) => ({ role, person_id }));
    changed = true;
  }
  if (parts.listing !== savedParts.listing) {
    if (record.value.kind === "sale")
      payload.property_id = state.value.listingId;
    else payload.rental_id = state.value.listingId;
    changed = true;
  }
  return changed ? payload : null;
}

async function saveNow(): Promise<boolean> {
  clearTimeout(saveTimer);
  if (saving) await saving;
  if (!editable.value || saveState.value === "conflict")
    return saveState.value !== "conflict";
  const payload = changedPayload();
  if (!payload) {
    saveState.value = "saved";
    return true;
  }
  const sentParts = partsOf(state.value!);
  saveState.value = "saving";
  let ok = false;
  saving = (async () => {
    try {
      const result = await agreementsService.saveAgreement(
        agreementId.value,
        payload,
      );
      draftRev.value = result.draft_rev;
      savedParts = sentParts;
      ok = true;
      if (changedPayload()) {
        saveState.value = "pending";
        scheduleSave();
      } else {
        saveState.value = "saved";
        clearLocalDraft(localKey());
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === "DRAFT_CONFLICT" || error.code === "INVALID_STATUS")
      ) {
        saveState.value = "conflict";
        notifyError(getErrorMessage(error));
      } else {
        saveState.value = "error";
        // Kept on disk already; try again shortly.
        saveTimer = setTimeout(() => void saveNow(), 5000);
      }
    }
  })();
  await saving;
  saving = null;
  return ok;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), 1200);
}

watch(
  state,
  (value) => {
    if (!value || !editable.value || saveState.value === "conflict") return;
    if (!changedPayload()) return;
    saveState.value = saveState.value === "saving" ? "saving" : "pending";
    writeLocalDraft(localKey(), draftRev.value, value);
    scheduleSave();
  },
  { deep: true },
);

useSaveShortcut(() => {
  void saveNow().then((ok) => ok && notifySuccess("حُفظت المسودة."));
});

function restoreLocal() {
  if (!localDraft.value || !state.value) return;
  state.value = deepClone(localDraft.value.data);
  localDraft.value = null;
  void refreshContext();
}
function discardLocal() {
  clearLocalDraft(localKey());
  localDraft.value = null;
}

/** After restoring local edits: the linked records' data for them. */
async function refreshContext() {
  if (!state.value || !record.value) return;
  for (const role of roles.value) {
    const id = state.value.parties[role];
    if (!id) context.value.parties[role] = null;
    else if (context.value.parties[role]?.id !== id)
      context.value.parties[role] = pickParty(
        await peopleService.getPerson(id),
      );
  }
}

// Leaving or closing with an unsaved change: save first, ask if that fails.
let removeGuard: (() => void) | null = null;
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (saveState.value === "saved" || saveState.value === "conflict") return;
  event.preventDefault();
  event.returnValue = "";
}

// ─── Step events ────────────────────────────────────────────────────────
function onParty(role: PartyRole, party: PartyRecord | null) {
  context.value = {
    ...context.value,
    parties: { ...context.value.parties, [role]: party },
  };
}
function onListing(listing: ListingRecord | null) {
  context.value = { ...context.value, listing };
}
async function useOwner(personId: number) {
  if (!state.value) return;
  try {
    const person = await peopleService.getPerson(personId);
    const first = roles.value[0]!;
    state.value.parties = { ...state.value.parties, [first]: person.id };
    onParty(first, pickParty(person));
    notifyInfo(`اعتُمد ${person.full_name} طرفاً أول.`);
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function go(next: AgreementStepKey) {
  step.value = next;
  if (next === "content") void loadReference();
}
const stepIndex = computed(() =>
  AGREEMENT_STEPS.findIndex((item) => item.key === step.value),
);
function move(direction: 1 | -1) {
  const next = AGREEMENT_STEPS[stepIndex.value + direction];
  if (next) go(next.key);
}

// ─── New contract ───────────────────────────────────────────────────────
async function create(key: TemplateKey) {
  if (creating.value) return;
  creating.value = true;
  try {
    const created = await agreementsService.createAgreement(key);
    await router.replace(`/contracts/${created.id}?step=parties`);
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    creating.value = false;
  }
}

// ─── Status changes ─────────────────────────────────────────────────────
async function run(action: () => Promise<AgreementRecord>, message: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    applyRecord(await action());
    notifySuccess(message);
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      notifyError(error.message);
      go("review");
    } else notifyError(getErrorMessage(error));
  } finally {
    busy.value = false;
  }
}

async function submitReview() {
  if (!(await saveNow())) return;
  await run(
    () =>
      agreementsService.changeAgreementStatus(
        agreementId.value,
        "submit_review",
        draftRev.value,
      ),
    "أُرسل العقد للمراجعة. لا يُعدّل حتى يُعاد إلى مسودة.",
  );
}
async function returnDraft() {
  await run(
    () =>
      agreementsService.changeAgreementStatus(
        agreementId.value,
        "return_draft",
        draftRev.value,
      ),
    "أُعيد العقد إلى مسودة.",
  );
}
async function issue() {
  if (!(await saveNow())) return;
  if (issues.value.length) {
    notifyError(`أكمل ${issues.value.length} من البيانات الناقصة قبل الإصدار.`);
    go("review");
    return;
  }
  openConfirm({
    title: `إصدار العقد ${record.value?.code}`,
    body: "يُحفظ العقد كما هو الآن، مع بيانات الأطراف والعقار والمكتب، ولا يتغير بعد ذلك ولو عُدّلت تلك السجلات أو القالب. أي تصحيح لاحق يكون مراجعة جديدة.",
    confirmText: "إصدار",
    onConfirm: () =>
      run(
        () =>
          agreementsService.issueAgreement(agreementId.value, draftRev.value),
        "صدر العقد.",
      ).then(() => go("review")),
  });
}
async function confirmReason(reason: string) {
  const mode = reasonMode.value;
  reasonMode.value = null;
  if (mode === "amend")
    await run(
      () => agreementsService.amendAgreement(agreementId.value, reason),
      "فُتحت مراجعة جديدة كمسودة. المراجعة الصادرة السابقة محفوظة كما هي.",
    );
  else if (mode === "cancel")
    await run(
      () => agreementsService.cancelAgreement(agreementId.value, reason),
      "أُلغي العقد.",
    );
}
async function duplicate() {
  try {
    const copy = await agreementsService.duplicateAgreement(agreementId.value);
    notifySuccess(`أُنشئت مسودة جديدة ${copy.code}.`);
    await router.push(`/contracts/${copy.id}?step=parties`);
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
function removeDraft() {
  openConfirm({
    title: `حذف المسودة ${record.value?.code}`,
    body: "تُحذف هذه المسودة نهائياً. المستندات المرفقة بها تبقى في ملفات الزبائن.",
    confirmText: "حذف المسودة",
    color: "error",
    onConfirm: async () => {
      clearTimeout(saveTimer);
      await agreementsService.deleteAgreement(agreementId.value);
      clearLocalDraft(localKey());
      saveState.value = "saved";
      notifySuccess("حُذفت المسودة.");
      await router.replace("/contracts");
    },
  });
}

// ─── Export ─────────────────────────────────────────────────────────────
async function exportAs(format: "pdf" | "docx" | "print") {
  if (!record.value || busy.value) return;
  if (editable.value && !(await saveNow())) return;
  busy.value = true;
  try {
    if (format === "docx") {
      const result = await exportContractDocx(
        record.value.id,
        showsRevision.value ? record.value.current_revision : null,
      );
      if (result.ok && !result.canceled)
        notifySuccess(result.fallback ? "نُزّل ملف Word." : "حُفظ ملف Word.");
      else if (!result.ok && !result.canceled && result.message)
        notifyError(result.message);
    } else {
      const current: AgreementRecord = {
        ...record.value,
        document: state.value?.document ?? record.value.document,
        terms: state.value?.terms ?? record.value.terms,
        context: context.value,
      };
      const source = await exportSourceFor(
        current,
        showsRevision.value ? revision.value : null,
      );
      const result =
        format === "pdf"
          ? await exportContractPdf(source)
          : await printContract(source);
      if (!result.ok && !result.canceled && result.message)
        notifyError(result.message);
      else if (result.ok && format === "pdf")
        notifySuccess(
          result.fallback ? "نُزّل مستند قابل للطباعة." : "حُفظ ملف PDF.",
        );
    }
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    busy.value = false;
  }
}

function onPageKeydown(event: KeyboardEvent) {
  // Ctrl+P prints; the studio's own Ctrl+P opens its print preview instead.
  if (
    (event.ctrlKey || event.metaKey) &&
    event.code === "KeyP" &&
    step.value !== "content" &&
    record.value
  ) {
    event.preventDefault();
    if (can("agreements.export")) void exportAs("print");
  }
}

const saveLabel = computed(
  () =>
    ({
      saved: "كل التعديلات محفوظة",
      pending: "تعديلات لم تُحفظ بعد…",
      saving: "جارٍ الحفظ…",
      error: "تعذر الحفظ؛ ستُعاد المحاولة (التعديلات محفوظة على هذا الجهاز)",
      conflict: "حُفظ العقد من مكان آخر؛ أعد تحميله",
    })[saveState.value],
);

const shortSaveLabel = computed(
  () =>
    ({
      saved: "محفوظ",
      pending: "غير محفوظ…",
      saving: "يُحفظ…",
      error: "تعذر الحفظ",
      conflict: "تعارض",
    })[saveState.value],
);

const firstPartyId = computed(() =>
  roles.value[0] && state.value
    ? (state.value.parties[roles.value[0]] ?? null)
    : null,
);
const pageTitle = computed(() =>
  isNew.value
    ? "عقد جديد"
    : record.value
      ? `${record.value.title} ${record.value.code}`
      : "عقد",
);

onMounted(() => {
  void load();
  window.addEventListener("keydown", onPageKeydown);
  if (platform.guardsUnsavedClose)
    window.addEventListener("beforeunload", onBeforeUnload);
  removeGuard = router.beforeEach(async (to, from) => {
    if (
      to.path === from.path ||
      saveState.value === "saved" ||
      saveState.value === "conflict" ||
      !editable.value
    )
      return true;
    if (await saveNow()) return true;
    return confirmAsync({
      title: "تعذر حفظ آخر التعديلات",
      body: "بقيت تعديلات لم تصل إلى الخادم. هي محفوظة على هذا الجهاز وستُعرض عليك عند فتح العقد مجدداً.",
      confirmText: "مغادرة",
      color: "warning",
    });
  });
});
onBeforeUnmount(() => {
  clearTimeout(saveTimer);
  window.removeEventListener("keydown", onPageKeydown);
  window.removeEventListener("beforeunload", onBeforeUnload);
  removeGuard?.();
});
watch(agreementId, (id, previous) => {
  if (id && id !== previous) void load();
});
watch(
  step,
  (value) => {
    if (value === "content") void loadReference();
  },
  { immediate: true },
);
watch(template, () => step.value === "content" && void loadReference());
</script>

<template>
  <AppPage :title="pageTitle" :parent="{ label: 'العقود', to: '/contracts' }">
    <template v-if="!isNew && record" #header-actions>
      <v-menu v-if="can('agreements.export')" location="bottom end">
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            variant="text"
            prepend-icon="mdi-export-variant"
            append-icon="mdi-menu-down"
            :loading="busy"
            >تصدير</v-btn
          >
        </template>
        <v-list density="compact">
          <v-list-item
            prepend-icon="mdi-file-pdf-box"
            title="PDF"
            :subtitle="showsRevision ? undefined : 'مسودة'"
            @click="exportAs('pdf')"
          />
          <v-list-item
            prepend-icon="mdi-file-word-box"
            title="Word (قابل للتعديل)"
            @click="exportAs('docx')"
          />
          <v-list-item
            prepend-icon="mdi-printer-outline"
            title="طباعة (Ctrl+P)"
            @click="exportAs('print')"
          />
        </v-list>
      </v-menu>
      <v-btn
        v-if="
          (record.status === 'draft' || record.status === 'review') &&
          can('agreements.issue')
        "
        color="primary"
        prepend-icon="mdi-stamper"
        :disabled="busy"
        @click="issue"
        >إصدار العقد</v-btn
      >
      <!-- بعد الإصدار أكثر ما يُطلب ملف PDF: زر ظاهر بدل «تصدير» ثم «PDF». -->
      <v-btn
        v-if="record.status === 'issued' && can('agreements.export')"
        color="primary"
        prepend-icon="mdi-file-pdf-box"
        :disabled="busy"
        @click="exportAs('pdf')"
        >حفظ PDF</v-btn
      >
      <v-btn
        v-if="record.status === 'issued' && can('agreements.issue')"
        variant="tonal"
        prepend-icon="mdi-file-edit-outline"
        :disabled="busy"
        @click="reasonMode = 'amend'"
        >مراجعة جديدة</v-btn
      >
      <v-btn
        v-if="
          record.status === 'issued' &&
          record.kind === 'rent' &&
          can('leases.manage')
        "
        variant="tonal"
        color="primary"
        prepend-icon="mdi-home-clock-outline"
        :disabled="busy"
        @click="leaseOpen = true"
        >تفعيل الإيجار</v-btn
      >
      <v-menu location="bottom end">
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            icon="mdi-dots-vertical"
            variant="text"
            aria-label="أوامر أخرى"
          />
        </template>
        <v-list density="compact">
          <v-list-item
            v-if="record.status === 'draft' && can('agreements.manage')"
            prepend-icon="mdi-account-check-outline"
            title="إرسال للمراجعة"
            @click="submitReview"
          />
          <v-list-item
            v-if="record.status === 'review' && can('agreements.manage')"
            prepend-icon="mdi-pencil-outline"
            title="إعادة إلى مسودة"
            @click="returnDraft"
          />
          <v-list-item
            v-if="record.current_revision"
            prepend-icon="mdi-history"
            title="سجل المراجعات"
            @click="revisionsOpen = true"
          />
          <v-list-item
            v-if="can('agreements.manage')"
            prepend-icon="mdi-content-copy"
            title="نسخ كمسودة جديدة"
            @click="duplicate"
          />
          <v-divider
            v-if="can('agreements.cancel') || can('agreements.manage')"
          />
          <v-list-item
            v-if="can('agreements.cancel') && record.status !== 'cancelled'"
            prepend-icon="mdi-cancel"
            base-color="error"
            title="إلغاء العقد"
            @click="reasonMode = 'cancel'"
          />
          <v-list-item
            v-if="
              can('agreements.manage') &&
              record.status === 'draft' &&
              !record.current_revision
            "
            prepend-icon="mdi-delete-outline"
            base-color="error"
            title="حذف المسودة"
            @click="removeDraft"
          />
        </v-list>
      </v-menu>
    </template>

    <template v-if="!isNew && record" #status>
      <v-chip
        size="small"
        label
        variant="tonal"
        :color="agreementStatusColor(record.status)"
      >
        {{ AGREEMENT_STATUS_LABELS[record.status]
        }}<template v-if="record.current_revision">
          · {{ record.current_revision }}</template
        >
      </v-chip>
      <span
        v-if="editable"
        class="save-state"
        :class="`save-state--${saveState}`"
        :title="saveLabel"
        aria-live="polite"
      >
        <v-icon
          size="16"
          :icon="
            saveState === 'saved'
              ? 'mdi-cloud-check-outline'
              : saveState === 'error' || saveState === 'conflict'
                ? 'mdi-cloud-alert-outline'
                : 'mdi-cloud-upload-outline'
          "
        />
        <span class="save-state__text">{{ shortSaveLabel }}</span>
      </span>
    </template>

    <!-- ─── Step 1: choose the type ─── -->
    <template v-if="isNew">
      <p class="dal-page-note">
        اختر نوع العقد. يُنشأ مسودةً من القالب الحالي، وتُحفظ كل خطوة تلقائياً.
      </p>
      <div class="chooser" role="list">
        <button
          v-for="key in TEMPLATE_KEYS"
          :key="key"
          class="chooser__item dal-panel"
          role="listitem"
          type="button"
          :disabled="creating || !can('agreements.manage')"
          @click="create(key)"
        >
          <v-icon
            size="28"
            :icon="
              TEMPLATES[key].kind === 'sale'
                ? 'mdi-home-export-outline'
                : 'mdi-key-chain-variant'
            "
            color="primary"
          />
          <span class="chooser__text">
            <strong>{{ TEMPLATES[key].title }}</strong>
            <small>{{ TEMPLATES[key].description }}</small>
          </span>
          <v-chip size="small" label variant="tonal">{{
            TEMPLATES[key].category
          }}</v-chip>
        </button>
      </div>
      <v-progress-linear v-if="creating" indeterminate class="mt-2" />
    </template>

    <template v-else>
      <v-skeleton-loader v-if="loading && !record" type="heading, article" />
      <template v-else-if="record && state">
        <v-alert
          v-if="saveState === 'conflict'"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-2"
        >
          {{ saveLabel }}. تعديلاتك الأخيرة محفوظة على هذا الجهاز.
          <template #append
            ><v-btn size="small" variant="text" @click="load"
              >إعادة التحميل</v-btn
            ></template
          >
        </v-alert>
        <v-alert
          v-if="record.status === 'draft' && record.amend_reason"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-2"
        >
          مسودة المراجعة {{ record.current_revision + 1 }}:
          {{ record.amend_reason }}. المراجعة
          {{ record.current_revision }} الصادرة محفوظة كما هي.
        </v-alert>
        <v-alert
          v-if="record.status === 'cancelled'"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-2"
        >
          أُلغي هذا العقد
          {{ record.cancelled_at ? formatDateTime(record.cancelled_at) : "" }}:
          {{ record.cancel_reason }}
        </v-alert>
        <v-alert
          v-if="record.status === 'review'"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-2"
        >
          العقد قيد المراجعة ولا يُعدّل. يمكن إصداره، أو إعادته إلى مسودة
          لتعديله.
        </v-alert>
        <DraftNotice
          v-if="localDraft"
          :saved-at="localDraft.savedAt"
          @restore="restoreLocal"
          @discard="discardLocal"
        />

        <nav class="steps" aria-label="خطوات العقد">
          <button
            v-for="(item, index) in AGREEMENT_STEPS"
            :key="item.key"
            type="button"
            class="steps__item"
            :class="{ 'steps__item--current': step === item.key }"
            :aria-current="step === item.key ? 'step' : undefined"
            @click="go(item.key)"
          >
            <span class="steps__no">{{ index + 1 }}</span>
            <span>{{ item.title }}</span>
            <span
              v-if="issueCount(item.key)"
              class="steps__badge"
              :aria-label="`${issueCount(item.key)} ناقص`"
              >{{ issueCount(item.key) }}</span
            >
          </button>
        </nav>

        <AgreementPartiesStep
          v-if="step === 'parties'"
          v-model:parties="state.parties"
          v-model:terms="state.terms"
          :template="record.template_key"
          :context="context"
          :readonly="!editable"
          :issues="issues"
          @party="onParty"
        />
        <AgreementListingStep
          v-else-if="step === 'property'"
          v-model:listing-id="state.listingId"
          v-model:terms="state.terms"
          :template="record.template_key"
          :agreement-id="record.id"
          :context="context"
          :first-party-id="firstPartyId"
          :readonly="!editable"
          :issues="issues"
          @listing="onListing"
          @use-owner="useOwner"
        />
        <section
          v-else-if="step === 'details'"
          class="dal-panel details"
          aria-label="تفاصيل العقد"
        >
          <AgreementTermsStep
            v-model="state.terms"
            :template="record.template_key"
            :readonly="!editable"
            :issues="issues"
          />
        </section>
        <ContractStudio
          v-else-if="step === 'content'"
          v-model="state.document"
          :template="record.template_key"
          mode="contract"
          :values="showsRevision && revision ? revision.values : values"
          :logo="officeLogoUrl()"
          :schedule="schedule"
          :reference="reference?.definition ?? null"
          reference-label="القالب الحالي"
          :readonly="!editable"
          class="content-studio"
          @print="exportAs('print')"
        />
        <AgreementReviewStep
          v-else-if="step === 'review' && reviewCtx && reviewDocument"
          :record="record"
          :document="reviewDocument"
          :ctx="reviewCtx"
          :issues="issues"
          :editable="editable"
          :first-party-id="firstPartyId"
          @go="go"
        />

        <div v-if="step !== 'review'" class="step-nav">
          <v-btn
            v-if="stepIndex > 0"
            variant="text"
            prepend-icon="mdi-arrow-right"
            @click="move(-1)"
            >السابق</v-btn
          >
          <v-spacer />
          <v-btn variant="tonal" append-icon="mdi-arrow-left" @click="move(1)"
            >التالي: {{ AGREEMENT_STEPS[stepIndex + 1]?.title }}</v-btn
          >
        </div>
      </template>
    </template>

    <ReasonDialog
      :model-value="reasonMode !== null"
      :title="
        reasonMode === 'amend'
          ? 'فتح مراجعة جديدة'
          : `إلغاء العقد ${record?.code ?? ''}`
      "
      :body="
        reasonMode === 'amend'
          ? 'يعود العقد مسودةً للمراجعة التالية. المراجعة الصادرة الحالية تبقى محفوظة كما هي، ويُسجَّل السبب معها عند الإصدار.'
          : 'يبقى العقد وكل مراجعاته محفوظاً، ويُطبع بعد الإلغاء مختوماً «ملغى». لا يمكن التراجع عن الإلغاء.'
      "
      :confirm-text="reasonMode === 'amend' ? 'فتح مراجعة' : 'إلغاء العقد'"
      :color="reasonMode === 'cancel' ? 'error' : 'primary'"
      :busy="busy"
      @update:model-value="!$event && (reasonMode = null)"
      @confirm="confirmReason"
    />
    <AgreementRevisionsDialog
      v-if="record && revisionsOpen"
      v-model="revisionsOpen"
      :agreement-id="record.id"
    />
    <LeaseActivateDialog
      v-if="record"
      v-model="leaseOpen"
      :agreement-id="record.id"
      :parties="record.parties"
      @activated="onLeaseActivated"
    />
  </AppPage>
</template>

<style scoped>
/* القوالب أربعة دائماً، بيعان ثم إيجاران: عمودان يجعلان كل صفّ نوعاً، بدل
   ثلاثة وقالب وحيد في الصف الثاني. */
.chooser {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dal-gutter);
  max-width: 1100px;
}
@media (max-width: 760px) {
  .chooser {
    grid-template-columns: minmax(0, 1fr);
  }
}
.chooser__item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  text-align: start;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.chooser__item:hover:not(:disabled) {
  border-color: rgba(var(--v-theme-primary), 0.5);
  background: var(--dal-hover);
}
.chooser__item:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.chooser__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
}
.chooser__text small {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: var(--dal-gutter);
  padding: 4px;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
  background: rgb(var(--v-theme-surface));
}
.steps__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 4px 12px;
  border: 0;
  border-radius: var(--dal-radius-control);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13.5px;
  cursor: pointer;
}
.steps__item:hover {
  background: var(--dal-hover);
}
.steps__item:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
.steps__item--current {
  background: var(--dal-selection);
  font-weight: 700;
}
.steps__no {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--dal-stroke);
  font-size: 12px;
}
.steps__item--current .steps__no {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  border-color: transparent;
}
.steps__badge {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(var(--v-theme-warning), 0.18);
  color: rgb(var(--v-theme-warning));
  font-size: 11.5px;
  font-weight: 700;
  text-align: center;
}
.details {
  padding: 4px 16px 8px;
}
.content-studio {
  height: calc(100dvh - var(--dal-bar-height) - 2 * var(--dal-gutter) - 64px);
}
.step-nav {
  display: flex;
  align-items: center;
  margin-top: var(--dal-gutter);
}
.save-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  color: var(--dal-muted);
}
.save-state--error,
.save-state--conflict {
  color: rgb(var(--v-theme-error));
}
</style>
