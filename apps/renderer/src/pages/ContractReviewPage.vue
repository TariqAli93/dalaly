<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import ContractDocumentPreview from "../components/contracts/ContractDocumentPreview.vue";
import AgreementFollowup from "../components/contracts/AgreementFollowup.vue";
import NumberField from "../components/app/NumberField.vue";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import * as service from "../services/contracts.service";
import { API_BASE, getToken, getErrorMessage } from "../services/api.service";
import { platform } from "../platform";
import { formatMoney } from "../utils/format";
import type { ContractBundle } from "../types";
const route = useRoute();
const { can } = usePermissions(),
  { setRefreshHandler } = useRefresh();
const { notifySuccess } = useSnackbar();
const bundle = ref<ContractBundle | null>(null),
  loading = ref(false),
  busy = ref("");
const error = ref(""),
  tab = ref("preview"),
  cancelOpen = ref(false),
  cancellationError = ref("");
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const cancellation = ref({ reason: "", cancellation_date: today(), notes: "" });
const cancellationTargetId = ref<number | null>(null);
const settlementTargetId = ref<number | null>(null);
let routeVersion = 0;
let loadVersion = 0;
let operationVersion = 0;
let disposed = false;
function currentRoute(id: number, version: number) {
  return (
    !disposed && routeVersion === version && Number(route.params.id) === id
  );
}
function currentOperation(id: number, version: number, operation: number) {
  return currentRoute(id, version) && operationVersion === operation;
}
const submitted = ref(false);
const settlementOpen = ref(false),
  settlementError = ref(""),
  settlementSubmitted = ref(false);
const settlement = ref({
  kind: "refund" as service.SettlementInput["kind"],
  amount: 0 as number | string | null,
  reference: "",
  reason: "",
  settlement_date: today(),
  request_id: "",
});
const settlementKinds = [
  { title: "استرداد مبلغ مدفوع", value: "refund" },
  { title: "مبلغ مدفوع محتفظ به باتفاق موثق", value: "retained_payment" },
  { title: "التزام مالي متبقٍ موثق", value: "remaining_obligation" },
];
const settlements = computed(() =>
  (bundle.value?.audit_history ?? [])
    .filter((entry) => entry.action === "financial_settlement")
    .map((entry) => ({
      ...entry,
      details: entry.new_value as Record<string, unknown>,
    })),
);
const settlementKind = (kind: unknown) =>
  settlementKinds.find((item) => item.value === kind)?.title ?? "تسوية مالية";
const contract = computed(() => bundle.value?.contract);
const draft = computed(() => contract.value?.status === "draft");
const cancelled = computed(() => contract.value?.status === "cancelled");
const canCancel = computed(
  () =>
    can("contracts.cancel") &&
    ["active", "completed", "expired"].includes(contract.value?.status ?? "") &&
    Boolean(
      contract.value?.generated_content || contract.value?.generated_html,
    ),
);
const model = computed(() => bundle.value?.legal_snapshot?.document_model);
const docxPreview = ref("");
let documentVersion = 0;
watch(() => [contract.value?.id, contract.value?.status, bundle.value?.legal_snapshot?.docx_hash], async () => {
  const request = ++documentVersion;
  docxPreview.value = "";
  if (!contract.value?.id || !bundle.value?.legal_snapshot?.docx_data) return;
  try {
    const output = await service.previewDocument(contract.value.id);
    if (request === documentVersion) docxPreview.value = output.data;
  } catch (cause) { if (request === documentVersion) error.value = getErrorMessage(cause); }
});
const date = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("ar-IQ", { timeZone: "Asia/Baghdad" })
    : "—";
const roleLabel = (role: string) =>
  ({
    seller: "البائع",
    buyer: "المشتري",
    lessor: "المؤجر",
    lessee: "المستأجر",
  })[role as "seller"] ?? role;
function partyValue(
  party: ContractBundle["parties"][number],
  key: "full_name" | "identity_number" | "phone_primary" | "address",
) {
  if (party.snapshot) return party.snapshot[key] ?? "—";
  if (!draft.value) return "غير محفوظ في العقد التاريخي";
  return (
    (key === "identity_number"
      ? party.person.national_id
      : party.person[key]) ?? "—"
  );
}
const status = computed(
  () =>
    ({
      draft: "مسودة",
      active: "صادر",
      cancelled: "ملغى",
      completed: "مكتمل سابقاً",
      expired: "منتهي سابقاً",
    })[contract.value?.status as "draft"] ??
    contract.value?.status ??
    "",
);
const actionLabel = (action: string) =>
  (
    ({
      created: "إنشاء العقد",
      create: "إنشاء العقد",
      updated: "تعديل المسودة",
      update: "تعديل المسودة",
      issue: "إصدار العقد",
      cancel: "إلغاء العقد",
      financial_settlement: "تسجيل إجراء مالي مستقل",
      approve_contract: "تسجيل مراجعة العقد",
      print_requested: "طلب طباعة",
      pdf_requested: "طلب تصدير PDF",
      docx_requested: "طلب تصدير Word",
      print: "طلب طباعة",
      export_pdf: "طلب تصدير PDF",
      export_docx: "طلب تصدير Word",
      legal_review: "تسجيل مراجعة",
      procedure_updated: "تحديث إجراء متابعة",
      procedure_attachment_added: "إرفاق مستند متابعة",
    }) as Record<string, string>
  )[action] ?? "إجراء موثق";
async function load() {
  if (disposed || busy.value) return;
  const id = Number(route.params.id);
  const version = routeVersion;
  const request = ++loadVersion;
  loading.value = true;
  error.value = "";
  if (!Number.isSafeInteger(id) || id <= 0) {
    bundle.value = null;
    error.value = "رقم العقد غير صالح.";
    loading.value = false;
    return;
  }
  try {
    const loaded = await service.getContract(id);
    if (currentRoute(id, version) && request === loadVersion)
      bundle.value = loaded;
  } catch (cause) {
    if (currentRoute(id, version) && request === loadVersion) {
      bundle.value = null;
      error.value = getErrorMessage(cause);
    }
  } finally {
    if (currentRoute(id, version) && request === loadVersion)
      loading.value = false;
  }
}
async function issue() {
  if (
    !contract.value ||
    busy.value ||
    loading.value ||
    !draft.value ||
    !can("contracts.issue")
  )
    return;
  const id = contract.value.id,
    version = routeVersion,
    operation = ++operationVersion;
  if (!currentRoute(id, version)) return;
  busy.value = "issue";
  error.value = "";
  try {
    const issued = await service.issueContract(id);
    if (!currentOperation(id, version, operation)) return;
    bundle.value = issued;
    tab.value = "preview";
    notifySuccess("تم إصدار العقد وحفظ نسخته التاريخية.");
  } catch (cause) {
    if (currentOperation(id, version, operation))
      error.value = getErrorMessage(cause);
  } finally {
    if (currentOperation(id, version, operation)) busy.value = "";
  }
}
function startCancel() {
  if (
    !contract.value ||
    loading.value ||
    busy.value ||
    !canCancel.value ||
    !currentRoute(contract.value.id, routeVersion)
  )
    return;
  cancellationTargetId.value = contract.value.id;
  cancellation.value = { reason: "", cancellation_date: today(), notes: "" };
  submitted.value = false;
  cancellationError.value = "";
  cancelOpen.value = true;
}
async function cancel() {
  submitted.value = true;
  if (
    !contract.value ||
    loading.value ||
    !canCancel.value ||
    !cancelOpen.value ||
    cancellationTargetId.value !== contract.value.id ||
    !currentRoute(contract.value.id, routeVersion) ||
    cancellation.value.reason.trim().length < 3 ||
    !cancellation.value.cancellation_date ||
    cancellation.value.cancellation_date > today() ||
    busy.value
  )
    return;
  const id = cancellationTargetId.value!,
    version = routeVersion,
    operation = ++operationVersion;
  busy.value = "cancel";
  cancellationError.value = "";
  try {
    const cancelledBundle = await service.cancelContract(id, {
      ...cancellation.value,
      reason: cancellation.value.reason.trim(),
    });
    if (!currentOperation(id, version, operation)) return;
    bundle.value = cancelledBundle;
    cancelOpen.value = false;
    tab.value = "preview";
    notifySuccess("تم توثيق إلغاء العقد مع الاحتفاظ بالمدفوعات والسجل.");
  } catch (cause) {
    if (currentOperation(id, version, operation))
      cancellationError.value = getErrorMessage(cause);
  } finally {
    if (currentOperation(id, version, operation)) busy.value = "";
  }
}
function startSettlement() {
  if (
    !contract.value ||
    loading.value ||
    busy.value ||
    !cancelled.value ||
    !can("contracts.cancel") ||
    !currentRoute(contract.value.id, routeVersion)
  )
    return;
  settlementTargetId.value = contract.value.id;
  settlement.value = {
    kind: "refund",
    amount: 0,
    reference: "",
    reason: "",
    settlement_date: today(),
    request_id: crypto.randomUUID(),
  };
  settlementSubmitted.value = false;
  settlementError.value = "";
  settlementOpen.value = true;
}
async function saveSettlement() {
  settlementSubmitted.value = true;
  const input = { ...settlement.value };
  if (
    !contract.value ||
    loading.value ||
    !cancelled.value ||
    !can("contracts.cancel") ||
    !settlementOpen.value ||
    settlementTargetId.value !== contract.value.id ||
    !currentRoute(contract.value.id, routeVersion) ||
    busy.value ||
    !Number.isFinite(Number(input.amount)) ||
    Number(input.amount) <= 0 ||
    !input.reference.trim() ||
    !input.reason.trim() ||
    !input.settlement_date ||
    input.settlement_date > today()
  )
    return;
  const id = settlementTargetId.value!,
    version = routeVersion,
    operation = ++operationVersion;
  busy.value = "settlement";
  settlementError.value = "";
  try {
    const settled = await service.recordSettlement(id, {
      ...input,
      amount: Number(input.amount),
    });
    if (!currentOperation(id, version, operation)) return;
    bundle.value = settled;
    settlementOpen.value = false;
    notifySuccess(
      "تم تسجيل الإجراء المالي المستقل دون تغيير المدفوعات الأصلية.",
    );
  } catch (cause) {
    if (currentOperation(id, version, operation))
      settlementError.value = getErrorMessage(cause);
  } finally {
    if (currentOperation(id, version, operation)) busy.value = "";
  }
}
function html(document: ContractBundle["contract"]) {
  if (document.generated_html) return document.generated_html;
  const text = document.generated_content ?? "";
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><style>@page{size:A4;margin:20mm}body{font-family:Tahoma,Arial;line-height:2;white-space:pre-wrap}</style><body>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body></html>`;
}
async function output(format: "print" | "pdf" | "docx") {
  if (!contract.value || busy.value || loading.value || !can("contracts.print"))
    return;
  const id = contract.value.id,
    version = routeVersion,
    operation = ++operationVersion;
  if (!currentRoute(id, version)) return;
  busy.value = format;
  error.value = "";
  try {
    if (format === "docx") {
      const payload = await service.exportContractDocx(id);
      if (!currentOperation(id, version, operation)) return;
      const result = await platform.saveFile({
        data: Uint8Array.from(atob(payload.data), (char) => char.charCodeAt(0)),
        suggestedName: payload.filename,
        title: "تصدير العقد",
        filters: [{ name: "مستند Word", extensions: ["docx"] }],
      });
      if (!currentOperation(id, version, operation)) return;
      if (!result.ok && !result.canceled)
        throw new Error(result.message || "تعذر حفظ المستند.");
      const refreshed = await service.getContract(id);
      if (currentOperation(id, version, operation)) bundle.value = refreshed;
      return;
    }
    if (bundle.value?.legal_snapshot?.docx_data) {
      const document = await service.exportContractPdf(id);
      if (!currentOperation(id, version, operation)) return;
      const data = Uint8Array.from(atob(document.data), char => char.charCodeAt(0));
      const result = format === "pdf"
        ? await platform.saveFile({ data, suggestedName: document.filename, title: "تصدير العقد PDF", filters: [{ name: "مستند PDF", extensions: ["pdf"] }] })
        : await platform.printPdf({ data: document.data, title: contract.value.code });
      if (!currentOperation(id, version, operation)) return;
      if (!result.ok && !result.canceled) throw new Error(result.message || "تعذر إخراج المستند.");
      if (format === "print") await service.recordPrint(id, "print");
      const refreshed = await service.getContract(id);
      if (currentOperation(id, version, operation)) bundle.value = refreshed;
      return;
    }
    // Fetch the current archived/issued document while recording the request.
    const printed = await service.recordPrint(id, format);
    if (!currentOperation(id, version, operation)) return;
    bundle.value = printed;
    const document = printed.contract;
    const result =
      format === "print"
        ? await platform.printDocument({
            html: html(document),
            title: document.code,
          })
        : await platform.exportPdf({
            html: html(document),
            suggestedName: `${document.code}${document.status === "cancelled" ? "_ملغى" : document.status === "draft" ? "_مسودة" : ""}.pdf`,
            title: "تصدير العقد",
            text: document.generated_content ?? "",
          });
    if (!currentOperation(id, version, operation)) return;
    if (!result.ok && !result.canceled)
      throw new Error(result.message || "تعذر إخراج المستند.");
    if (result.ok && format === "pdf")
      notifySuccess(
        result.fallback
          ? "تم تنزيل مستند الطباعة. افتحه واختر طباعة ثم حفظ بصيغة PDF."
          : "تم تصدير العقد بصيغة PDF.",
      );
  } catch (cause) {
    if (currentOperation(id, version, operation))
      error.value = getErrorMessage(cause);
  } finally {
    if (currentOperation(id, version, operation)) busy.value = "";
  }
}
async function downloadAttachment(
  attachment: ContractBundle["attachments"][number],
) {
  if (!contract.value || busy.value || loading.value || !can("contracts.read"))
    return;
  const id = contract.value.id,
    version = routeVersion,
    operation = ++operationVersion;
  if (!currentRoute(id, version)) return;
  busy.value = "attachment";
  error.value = "";
  try {
    const response = await fetch(
      `${API_BASE}/contracts/${id}/attachments/${attachment.id}/file`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (!currentOperation(id, version, operation)) return;
    if (!response.ok) throw new Error("تعذر تحميل المستمسك المحفوظ.");
    const extension = attachment.file_path.split(".").pop() || "pdf";
    const data = new Uint8Array(await response.arrayBuffer());
    if (!currentOperation(id, version, operation)) return;
    const result = await platform.saveFile({
      data,
      suggestedName: `${attachment.document_name}.${extension}`,
      title: "حفظ المستمسك",
      filters: [{ name: "مستمسك", extensions: [extension] }],
    });
    if (!currentOperation(id, version, operation)) return;
    if (!result.ok && !result.canceled)
      throw new Error(result.message || "تعذر حفظ المستمسك.");
  } catch (cause) {
    if (currentOperation(id, version, operation))
      error.value = getErrorMessage(cause);
  } finally {
    if (currentOperation(id, version, operation)) busy.value = "";
  }
}
watch(
  () => route.params.id,
  () => {
    routeVersion += 1;
    loadVersion += 1;
    operationVersion += 1;
    bundle.value = null;
    busy.value = "";
    error.value = "";
    tab.value = "preview";
    cancelOpen.value = false;
    settlementOpen.value = false;
    cancellationTargetId.value = null;
    settlementTargetId.value = null;
    submitted.value = false;
    settlementSubmitted.value = false;
    cancellationError.value = "";
    settlementError.value = "";
    cancellation.value = { reason: "", cancellation_date: today(), notes: "" };
    settlement.value = {
      kind: "refund",
      amount: 0,
      reference: "",
      reason: "",
      settlement_date: today(),
      request_id: "",
    };
    void load();
  },
  { immediate: true, flush: "sync" },
);
onMounted(() => setRefreshHandler(load));
onBeforeUnmount(() => {
  disposed = true;
  routeVersion += 1;
  loadVersion += 1;
  operationVersion += 1;
});
</script>
<template>
  <AppLayout
    title="مراجعة العقد"
    :subtitle="
      contract
        ? `${contract.code} · ${contract.contract_type === 'rental' ? 'إيجار' : 'بيع'}`
        : 'مراجعة النسخة والمعلومات والسجل'
    "
  >
    <template #header-actions
      ><v-btn
        to="/contracts/review"
        variant="text"
        prepend-icon="mdi-arrow-right"
        >قائمة العقود</v-btn
      ></template
    >
    <v-progress-linear
      v-if="loading"
      indeterminate
      color="primary"
      class="mb-4"
    />
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="mb-4"
      role="alert"
      >{{ error }}</v-alert
    >
    <template v-if="bundle && contract">
      <v-sheet
        border
        rounded
        class="review-toolbar pa-3 mb-4 d-flex flex-wrap align-center ga-2"
        role="toolbar"
        aria-label="إجراءات العقد"
      >
        <v-chip
          :color="cancelled ? 'error' : draft ? 'warning' : 'success'"
          variant="tonal"
          >{{ status }}</v-chip
        >
        <v-spacer />
        <v-btn
          v-if="draft && can('contracts.manage')"
          :to="`/contracts/${contract.id}/edit`"
          variant="tonal"
          prepend-icon="mdi-pencil"
          :disabled="loading || Boolean(busy)"
          >تعديل المسودة</v-btn
        >
        <v-btn
          v-if="draft && can('contracts.issue')"
          color="primary"
          prepend-icon="mdi-file-check-outline"
          :loading="busy === 'issue'"
          :disabled="loading || Boolean(busy) || model?.ready === false"
          @click="issue"
          >حفظ وإصدار العقد</v-btn
        >
        <v-btn
          v-if="can('contracts.print')"
          variant="tonal"
          prepend-icon="mdi-printer-outline"
          :loading="busy === 'print'"
          :disabled="loading || Boolean(busy) || !contract.generated_content"
          @click="output('print')"
          >{{ cancelled ? "طباعة أرشيفية" : "طباعة" }}</v-btn
        >
        <v-menu v-if="can('contracts.print')"
          ><template #activator="{ props }"
            ><v-btn
              v-bind="props"
              icon="mdi-dots-horizontal"
              variant="text"
              aria-label="المزيد من إجراءات العقد"
              :disabled="loading || Boolean(busy)" /></template
          ><v-list>
            <v-list-item
              v-if="can('contracts.print')"
              title="تصدير PDF"
              prepend-icon="mdi-file-pdf-box"
              @click="output('pdf')"
            />
            <v-list-item
              v-if="can('contracts.print')"
              title="تصدير Word"
              prepend-icon="mdi-file-word-outline"
              @click="output('docx')"
            /> </v-list
        ></v-menu>
        <v-btn
          v-if="canCancel"
          color="error"
          variant="text"
          prepend-icon="mdi-cancel"
          :disabled="loading || Boolean(busy)"
          @click="startCancel"
          >إلغاء العقد</v-btn
        >
      </v-sheet>
      <v-alert
        :type="cancelled || draft ? 'warning' : 'info'"
        variant="tonal"
        class="mb-4"
      >
        {{
          cancelled
            ? `نسخة أرشيفية ملغاة بتاريخ ${date(contract.cancelled_at)}. السبب: ${contract.cancellation_reason || "غير مسجل في العقد التاريخي"}. الإلغاء إجراء إداري داخل التطبيق؛ لا ينفذ فسخاً قانونياً أو تسوية مالية تلقائية.`
            : draft
              ? "هذه مسودة قابلة للمراجعة والتعديل قبل الإصدار."
              : "نسخة صادرة محفوظة. أي تغيير لاحق يحتاج إجراء متابعة موثق؛ محتوى العقد ثابت."
        }}
        اتفاق المكتب العقاري لا يغني عن إجراءات التصديق أو التسجيل الرسمية
        المطلوبة.
      </v-alert>
      <v-alert
        v-for="warning in draft ? (model?.warnings ?? []) : []"
        :key="warning"
        type="warning"
        variant="tonal"
        class="mb-2"
        >{{ warning }}</v-alert
      >
      <v-card variant="flat" border>
        <v-tabs v-model="tab" color="primary" show-arrows
          ><v-tab value="preview">المعاينة</v-tab
          ><v-tab value="information">المعلومات</v-tab
          ><v-tab value="legal">الشروط القانونية</v-tab
          ><v-tab value="history">سجل الإجراءات</v-tab></v-tabs
        >
        <v-divider />
        <v-tabs-window v-model="tab">
          <v-tabs-window-item value="preview"
            ><v-card-text
              ><ContractDocumentPreview
                :docx-data="docxPreview"
                :load-pdf="() => service.previewPdf(contract!.id)"
                :html="contract.generated_html"
                :text="contract.generated_content" /></v-card-text
          ></v-tabs-window-item>
          <v-tabs-window-item value="information"
            ><v-card-text>
              <v-row
                ><v-col
                  v-for="party in bundle.parties"
                  :key="party.id"
                  cols="12"
                  md="6"
                  ><v-card variant="tonal"
                    ><v-card-title>{{ roleLabel(party.role) }}</v-card-title
                    ><v-card-text
                      ><p class="font-weight-bold">
                        {{ partyValue(party, "full_name") }}
                      </p>
                      <p>
                        رقم الهوية:
                        {{ partyValue(party, "identity_number") }}
                      </p>
                      <p>
                        الهاتف:
                        {{ partyValue(party, "phone_primary") }}
                      </p>
                      <p>
                        العنوان:
                        {{ partyValue(party, "address") }}
                      </p></v-card-text
                    ></v-card
                  ></v-col
                ></v-row
              >
              <v-sheet class="mt-4"
                ><h3 class="text-subtitle-1 font-weight-bold">
                  معلومات العقار
                </h3>
                <v-card
                  v-for="asset in model?.data?.assets ?? []"
                  :key="asset.id"
                  variant="flat"
                  border
                  class="mt-2"
                  ><v-card-text
                    ><v-row
                      ><v-col
                        v-for="detail in asset.details"
                        :key="detail.label"
                        cols="12"
                        sm="6"
                        ><span class="text-medium-emphasis"
                          >{{ detail.label }}: </span
                        >{{ detail.value }}</v-col
                      ></v-row
                    ></v-card-text
                  ></v-card
                >
                <p v-if="!model?.data?.assets?.length">
                  {{
                    contract.property_name ??
                    bundle.asset?.data.title ??
                    bundle.asset?.data.code ??
                    "المعلومات محفوظة في النسخة التاريخية المعروضة."
                  }}
                </p></v-sheet
              >
              <v-sheet border rounded class="pa-4 mt-4"
                ><h3 class="text-subtitle-1 font-weight-bold mb-2">
                  التفاصيل المالية والتواريخ
                </h3>
                <v-row
                  ><v-col cols="12" sm="4"
                    >الإجمالي: {{ formatMoney(contract.amount) }}</v-col
                  ><v-col cols="12" sm="4"
                    >المدفوع: {{ formatMoney(contract.paid_amount) }}</v-col
                  ><v-col cols="12" sm="4"
                    >المتبقي:
                    {{
                      formatMoney(
                        Number(contract.amount ?? 0) -
                          Number(contract.paid_amount ?? 0),
                      )
                    }}</v-col
                  ><v-col cols="12" sm="4"
                    >تاريخ العقد: {{ date(contract.contract_date) }}</v-col
                  ><v-col
                    v-if="contract.contract_type === 'rental'"
                    cols="12"
                    sm="4"
                    >بداية الإيجار: {{ date(contract.start_date) }}</v-col
                  ><v-col
                    v-if="contract.contract_type === 'rental'"
                    cols="12"
                    sm="4"
                    >نهاية الإيجار: {{ date(contract.end_date) }}</v-col
                  ></v-row
                ><v-alert
                  v-if="cancelled && Number(contract.paid_amount) > 0"
                  type="warning"
                  variant="tonal"
                  class="mt-3"
                  >المدفوعات محفوظة. يلزم توثيق التسوية أو الاسترداد أو الالتزام
                  المتبقي بإجراء مالي مستقل.</v-alert
                ></v-sheet
              >
              <h3 class="text-subtitle-1 font-weight-bold mt-4">
                المستمسكات المحفوظة
              </h3>
              <v-list
                ><v-list-item
                  v-for="attachment in bundle.attachments"
                  :key="attachment.id"
                  :title="attachment.document_name"
                  :subtitle="
                    attachment.document_number ?? attachment.document_type ?? ''
                  "
                  prepend-icon="mdi-file-document-outline"
                  ><template #append
                    ><v-btn
                      variant="text"
                      :disabled="loading || Boolean(busy)"
                      @click="downloadAttachment(attachment)"
                      >تحميل</v-btn
                    ></template
                  ></v-list-item
                ></v-list
              >
              <v-sheet v-if="cancelled" border rounded class="pa-4 mt-4">
                <v-sheet class="d-flex flex-wrap align-center ga-2 mb-3"
                  ><h3 class="text-subtitle-1 font-weight-bold">
                    إجراءات مالية مستقلة بعد الإلغاء
                  </h3>
                  <v-spacer /><v-btn
                    v-if="can('contracts.cancel')"
                    variant="tonal"
                    prepend-icon="mdi-cash-check"
                    :disabled="loading || Boolean(busy)"
                    @click="startSettlement"
                    >تسجيل تسوية مستقلة</v-btn
                  ></v-sheet
                >
                <p class="text-body-2 mb-3">
                  سجل ما تم فعلياً مع مرجع موثق؛ التسجيل لا ينفذ دفعاً أو
                  استرداداً ولا يغير المبالغ الأصلية في العقد.
                </p>
                <v-row v-if="bundle.financial_followup" class="mb-3"
                  ><v-col cols="12" sm="6"
                    >مدفوع يحتاج معالجة:
                    {{
                      formatMoney(
                        bundle.financial_followup.unallocated_paid_amount,
                      )
                    }}</v-col
                  ><v-col cols="12" sm="6"
                    >متبقٍ يحتاج معالجة:
                    {{
                      formatMoney(
                        bundle.financial_followup.unallocated_remaining_amount,
                      )
                    }}</v-col
                  ></v-row
                >
                <v-list
                  ><v-list-item
                    v-for="entry in settlements"
                    :key="entry.id"
                    :title="`${settlementKind(entry.details.kind)} · ${formatMoney(entry.details.amount)}`"
                    :subtitle="`${entry.details.reference} · ${date(String(entry.details.settlement_date))} · ${entry.user_name ?? 'مستخدم سابق'}`"
                    ><p class="text-body-2">
                      {{ entry.details.reason }}
                    </p></v-list-item
                  ></v-list
                >
                <p v-if="!settlements.length">
                  لم تسجل تسوية مالية مستقلة بعد.
                </p>
              </v-sheet>
              <AgreementFollowup
                v-if="bundle.followup"
                :contract-id="contract.id"
                :followup="bundle.followup"
                :is-draft="draft"
                :readonly="cancelled || loading || Boolean(busy)"
                @updated="load"
              /> </v-card-text
          ></v-tabs-window-item>
          <v-tabs-window-item value="legal"
            ><v-card-text>
              <v-alert type="info" variant="tonal" class="mb-4">{{
                draft
                  ? "يمكن تعديل شروط المسودة قبل الإصدار."
                  : "الصيغة والبنود هنا نسخة ثابتة وقت الإصدار؛ تعديل الصيغ الحالية أو حذفها لا يغير هذا العقد."
              }}</v-alert>
              <v-chip
                v-for="version in bundle.legal_snapshot
                  ?.legal_template_version ?? []"
                :key="version.id"
                variant="tonal"
                class="ma-1"
                >{{
                  version.name ||
                  model?.sections?.find(
                    (section) => section.template_id === version.id,
                  )?.title ||
                  "الصيغة القانونية"
                }}
                · النسخة {{ version.version }}</v-chip
              >
              <v-sheet
                v-for="(section, index) in model?.sections ?? []"
                :key="index"
                class="mt-4"
                :disabled="loading || Boolean(busy)"
                ><h3 class="text-subtitle-1 font-weight-bold">
                  {{ section.title }}
                </h3>
                <v-sheet
                  v-for="(clause, clauseIndex) in section.clauses"
                  :key="clause.code"
                  border
                  rounded
                  class="pa-4 mt-2"
                  ><p class="font-weight-bold mb-2">
                    {{ clauseIndex + 1 }}. {{ clause.title }}
                  </p>
                  <p class="legal-text">{{ clause.text }}</p></v-sheet
                ></v-sheet
              >
              <v-sheet
                v-if="model?.data?.additional_conditions || contract.notes"
                border
                rounded
                class="pa-4 mt-4"
                ><h3 class="text-subtitle-1 font-weight-bold mb-2">
                  الشروط الإضافية
                </h3>
                <p class="legal-text">
                  {{ model?.data?.additional_conditions ?? contract.notes }}
                </p></v-sheet
              >
              <p v-if="!model?.sections?.length" class="legal-text mt-4">
                {{ contract.generated_content }}
              </p>
              <v-btn
                v-if="draft && can('contracts.manage')"
                :to="`/contracts/${contract.id}/edit`"
                variant="tonal"
                prepend-icon="mdi-pencil"
                class="mt-4"
                >تعديل الشروط قبل الإصدار</v-btn
              >
            </v-card-text></v-tabs-window-item
          >
          <v-tabs-window-item value="history"
            ><v-card-text>
              <p class="text-caption mb-4">
                يسجل طلب الطباعة أو التصدير؛ لا يؤكد السجل نجاح الطباعة المادية
                أو توقيع الأطراف.
              </p>
              <v-list lines="three"
                ><v-list-item
                  v-for="entry in bundle.audit_history ?? []"
                  :key="entry.id"
                  :title="actionLabel(entry.action)"
                  :subtitle="`${date(entry.created_at)} · ${entry.user_name || 'مستخدم سابق أو النظام'}`"
                  prepend-icon="mdi-history"
                  ><v-sheet v-if="entry.action === 'cancel'" class="text-body-2"
                    >سبب الإلغاء: {{ contract.cancellation_reason }}</v-sheet
                  ></v-list-item
                ></v-list
              >
              <p v-if="!bundle.audit_history?.length">
                لا توجد إجراءات مسجلة للعقد التاريخي. تاريخ العقد:
                {{ date(contract.created_at ?? contract.contract_date) }}.
              </p>
            </v-card-text></v-tabs-window-item
          >
        </v-tabs-window>
      </v-card>
    </template>
    <v-dialog v-model="cancelOpen" max-width="680" :persistent="Boolean(busy)"
      ><v-card
        ><v-card-title>إلغاء العقد</v-card-title
        ><v-card-text :inert="loading || Boolean(busy) || undefined">
          <p class="font-weight-bold mb-2">
            {{ contract?.code }} ·
            {{ contract?.contract_type === "rental" ? "إيجار" : "بيع" }}
          </p>
          <p class="mb-4">
            {{
              bundle?.parties
                .map((party) => partyValue(party, "full_name"))
                .join(" — ")
            }}
          </p>
          <v-alert type="warning" variant="tonal" class="mb-4"
            >الإلغاء إجراء إداري داخل النظام. سيبقى العقد والمستمسكات والسجل،
            وتصبح طباعته أرشيفية بعلامة «ملغى». لا تحذف المدفوعات ولا يعاد
            العقار إلى متاح تلقائياً، ولا يلغى أي أثر رسمي خارج التطبيق.
            {{
              Number(contract?.paid_amount) > 0
                ? `المبلغ المدفوع ${formatMoney(contract?.paid_amount)} يحتاج إجراء تسوية أو استرداد مستقلاً.`
                : ""
            }}</v-alert
          >
          <v-textarea
            v-model="cancellation.reason"
            label="سبب الإلغاء"
            rows="3"
            counter="2000"
            :error-messages="
              submitted && cancellation.reason.trim().length < 3
                ? ['سبب الإلغاء مطلوب (ثلاثة أحرف على الأقل).']
                : []
            "
          />
          <v-text-field
            v-model="cancellation.cancellation_date"
            label="تاريخ الإلغاء"
            type="date"
            :max="today()"
            :error-messages="
              submitted &&
              (!cancellation.cancellation_date ||
                cancellation.cancellation_date > today())
                ? ['اختر تاريخ إلغاء صالحاً لا يتجاوز اليوم.']
                : []
            "
          />
          <v-textarea
            v-model="cancellation.notes"
            label="ملاحظات إضافية (اختياري)"
            rows="2"
          />
          <v-alert
            v-if="cancellationError"
            type="error"
            variant="tonal"
            role="alert"
            >{{ cancellationError }}</v-alert
          > </v-card-text
        ><v-card-actions
          ><v-btn
            :disabled="loading || Boolean(busy)"
            @click="cancelOpen = false"
            >رجوع</v-btn
          ><v-spacer /><v-btn
            color="error"
            variant="flat"
            :loading="busy === 'cancel'"
            :disabled="loading || Boolean(busy)"
            @click="cancel"
            >تأكيد الإلغاء</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-dialog
      v-model="settlementOpen"
      max-width="640"
      :persistent="Boolean(busy)"
      ><v-card
        ><v-card-title>تسجيل تسوية مالية مستقلة</v-card-title
        ><v-card-text :inert="loading || Boolean(busy) || undefined">
          <v-alert type="info" variant="tonal" class="mb-4"
            >{{ contract?.code }}: هذا توثيق لإجراء مالي تم باتفاق الأطراف
            وبمستنده. يبقى المبلغ المدفوع في العقد الأصلي محفوظاً، ولا ينفذ
            التطبيق تحويلاً مالياً.</v-alert
          >
          <v-radio-group
            v-model="settlement.kind"
            label="نوع الإجراء المالي"
            :disabled="Boolean(busy) || loading"
          >
            <v-radio
              v-for="kind in settlementKinds"
              :key="kind.value"
              :label="kind.title"
              :value="kind.value"
            />
          </v-radio-group>
          <NumberField
            v-model="settlement.amount"
            label="مبلغ الإجراء"
            :error-messages="
              settlementSubmitted &&
              (!Number.isFinite(Number(settlement.amount)) ||
                Number(settlement.amount) <= 0)
                ? ['أدخل مبلغاً أكبر من صفر.']
                : []
            "
          />
          <v-text-field
            v-model="settlement.reference"
            label="مرجع المستند أو التسوية"
            :error-messages="
              settlementSubmitted && !settlement.reference.trim()
                ? ['مرجع التوثيق مطلوب.']
                : []
            "
          />
          <v-text-field
            v-model="settlement.settlement_date"
            label="تاريخ الإجراء المالي"
            type="date"
            :max="today()"
            :error-messages="
              settlementSubmitted &&
              (!settlement.settlement_date ||
                settlement.settlement_date > today())
                ? ['اختر تاريخاً صالحاً لا يتجاوز اليوم.']
                : []
            "
          />
          <v-textarea
            v-model="settlement.reason"
            label="وصف الإجراء واتفاق الأطراف"
            rows="3"
            :error-messages="
              settlementSubmitted && !settlement.reason.trim()
                ? ['وصف الإجراء مطلوب.']
                : []
            "
          />
          <v-alert
            v-if="settlementError"
            type="error"
            variant="tonal"
            role="alert"
            >{{ settlementError }}</v-alert
          > </v-card-text
        ><v-card-actions
          ><v-btn
            :disabled="loading || Boolean(busy)"
            @click="settlementOpen = false"
            >رجوع</v-btn
          ><v-spacer /><v-btn
            color="primary"
            variant="flat"
            :loading="busy === 'settlement'"
            :disabled="loading || Boolean(busy)"
            @click="saveSettlement"
            >تسجيل الإجراء المالي</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
  </AppLayout>
</template>
<style scoped>
.review-toolbar {
  position: sticky;
  top: 8px;
  z-index: 4;
  background: rgb(var(--v-theme-surface));
}
.legal-text {
  white-space: pre-wrap;
  line-height: 2;
}
</style>
