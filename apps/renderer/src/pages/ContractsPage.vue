<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ContractDocumentPreview from "../components/contracts/ContractDocumentPreview.vue";
import AppLayout from "../layouts/AppLayout.vue";
import * as contractsService from "../services/contracts.service";
import { getErrorMessage, getToken } from "../services/api.service";
import { platform } from "../platform";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { formatMoney, toNumber } from "../utils/format";
import type { ContractBundle, ContractRecord } from "../types";
import {
  contractTypeLabel as typeLabel,
  contractStatusLabel as statusLabel,
} from "../constants/crm";

const { can } = usePermissions();
const router = useRouter();
const route = useRoute();
const { notifyError, notifySuccess } = useSnackbar();
const rows = ref<ContractRecord[]>([]);
const loading = ref(false);
const previewOpen = ref(false);
const selected = ref<ContractBundle | null>(null);
const legalReviewOpen = ref(false),
  reviewComment = ref(""),
  reviewHash = ref(""),
  processing = ref(false);
const exporting = ref<"pdf" | "docx" | null>(null);
const isDraft = computed(() => selected.value?.contract.status === "draft");
const legalReady = computed(() =>
  Boolean(selected.value?.legal_snapshot?.document_model.ready),
);
const hasReview = computed(() =>
  Boolean(selected.value?.legal_snapshot?.review),
);
const needsReview = computed(() =>
  Boolean(selected.value?.contract.notes?.trim()),
);
const hasDocument = computed(() =>
  Boolean(selected.value?.contract.generated_content),
);
const approvalMessage = computed(() => {
  if (!legalReady.value)
    return "اعتماد العقد غير متاح بعد: يجب اعتماد الصيغ المنطبقة ثم إعادة تجهيز المسودة. يمكنك تصدير المسودة الآن.";
  if (!needsReview.value)
    return "الصيغة معتمدة وفعالة. راجع البيانات ثم أصدر العقد مباشرة.";
  if (!hasReview.value && !can("legal_content.approve"))
    return "الصيغ جاهزة. الشروط الإضافية الحرة تحتاج مراجعة مختصة قبل الإصدار.";
  if (!hasReview.value)
    return "الصيغ جاهزة. اختر اعتماد العقد لتسجيل مراجعة المحامي لبياناته وشروطه، ثم أصدر النسخة المعتمدة.";
  if (!can("contracts.manage"))
    return "اعتمد المحامي هذه النسخة. يحتاج إصدارها إلى حساب لديه صلاحية إدارة العقود.";
  return "اعتمد المحامي هذه النسخة. اختر إصدار العقد المعتمد لحفظ النسخة النهائية.";
});
const legalContentLink = computed(() => ({
  path: "/settings/legal-content",
  query: {
    contract_type:
      selected.value?.contract.contract_type === "rental" ? "rental" : "sale",
    property_type:
      selected.value?.legal_snapshot?.legal_template_version[0]?.property_type,
    contract_id: selected.value?.contract.id,
  },
}));
function startLegalReview() {
  reviewComment.value = "";
  reviewHash.value = selected.value?.legal_snapshot?.content_hash ?? "";
  legalReviewOpen.value = true;
}
async function recordLegalReview() {
  if (!selected.value) return;
  processing.value = true;
  try {
    selected.value = await contractsService.reviewContract(
      selected.value.contract.id,
      reviewComment.value,
      reviewHash.value,
    );
    legalReviewOpen.value = false;
    notifySuccess("تم تسجيل مراجعة المحامي لهذه النسخة من العقد.");
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    processing.value = false;
  }
}
async function issue() {
  if (!selected.value) return;
  processing.value = true;
  try {
    selected.value = await contractsService.issueContract(
      selected.value.contract.id,
    );
    await load();
    notifySuccess("تم إصدار العقد وحفظ نسخته التاريخية.");
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    processing.value = false;
  }
}

const headers = [
  { title: "الرمز", key: "code" },
  { title: "النوع", key: "contract_type" },
  { title: "الطرف الأساسي", key: "primary_person_name" },
  { title: "المبلغ", key: "amount" },
  { title: "المدفوع", key: "paid_amount" },
  { title: "المتبقي", key: "remaining_amount", sortable: false },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false },
];
async function load() {
  loading.value = true;
  try {
    rows.value = (await contractsService.listContracts()).filter(
      (item) =>
        item.contract_type === "sale" || item.contract_type === "rental",
    );
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    loading.value = false;
  }
}
async function openPreview(id: number) {
  try {
    selected.value = await contractsService.getContract(id);
    previewOpen.value = true;
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
function openCreate() {
  void router.push("/contracts/create");
}
function openEdit(review = false) {
  if (!selected.value || selected.value.contract.status !== "draft") return;
  void router.push({
    path: `/contracts/${selected.value.contract.id}/edit`,
    query: review ? { step: "review" } : {},
  });
}
function previewHtml() {
  if (selected.value?.contract.generated_html)
    return selected.value.contract.generated_html;
  const text = selected.value?.contract.generated_content ?? "";
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><style>body{font-family:Tahoma,Arial;padding:40px;line-height:2;white-space:pre-wrap}</style><h1>${typeLabel(selected.value?.contract.contract_type ?? "sale")}</h1><div>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div></html>`;
}
async function exportPdf() {
  if (!selected.value || !hasDocument.value || exporting.value) return;
  exporting.value = "pdf";
  try {
    const result = await platform.exportPdf({
      html: previewHtml(),
      suggestedName: `${selected.value.contract.code}${isDraft.value ? "_مسودة" : ""}.pdf`,
      title: "تصدير العقد",
      text: selected.value.contract.generated_content ?? "",
    });
    if (result.ok)
      notifySuccess(
        result.fallback
          ? "تم تنزيل نسخة HTML للطباعة. افتحها واختر طباعة ثم حفظ بصيغة PDF."
          : "تم تصدير العقد بصيغة PDF.",
      );
    else if (!result.canceled)
      notifyError(result.message ?? "تعذر تصدير ملف بي دي إف.");
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    exporting.value = null;
  }
}
function base64Bytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
async function exportDocx() {
  if (!selected.value || !hasDocument.value || exporting.value) return;
  exporting.value = "docx";
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:34567/api"}/contracts/${selected.value.contract.id}/docx`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (!response.ok) throw new Error("تعذر تحميل ملف المستند.");
    const payload = (await response.json()) as {
      filename: string;
      data: string;
    };
    const save = await platform.saveFile({
      data: base64Bytes(payload.data),
      suggestedName: isDraft.value
        ? payload.filename.replace(/\.docx$/i, "_مسودة.docx")
        : payload.filename,
      title: "تصدير المستند",
      filters: [{ name: "ملف مستند", extensions: ["docx"] }],
    });
    if (save.ok) notifySuccess("تم تصدير العقد إلى ملف مستند.");
    else if (!save.canceled)
      notifyError(save.message ?? "تعذر حفظ ملف المستند.");
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    exporting.value = null;
  }
}
watch(
  () => route.query.view,
  (value) => {
    const id = Number(value);
    if (Number.isSafeInteger(id) && id > 0) void openPreview(id);
  },
  { immediate: true },
);
watch(previewOpen, (value) => {
  if (!value && route.query.view) {
    const query = { ...route.query };
    delete query.view;
    void router.replace({ query });
  }
});
onMounted(load);
</script>
<template>
  <AppLayout
    title="العقود"
    subtitle="إنشاء وعرض عقود البيع والإيجار كحزم تاريخية متكاملة."
  >
    <template #header-actions
      ><v-btn
        v-if="can('contracts.manage')"
        color="primary"
        prepend-icon="mdi-file-document-plus-outline"
        @click="openCreate"
        >إنشاء عقد</v-btn
      ></template
    >
    <v-card variant="flat" border
      ><v-data-table
        :headers="headers"
        :items="rows"
        :loading="loading"
        item-value="id"
        density="compact"
      >
        <template #item.contract_type="{ item }">{{
          typeLabel(item.contract_type)
        }}</template>
        <template #item.amount="{ item }">{{
          item.amount == null ? "-" : formatMoney(item.amount)
        }}</template>
        <template #item.paid_amount="{ item }">{{
          formatMoney(item.paid_amount ?? 0)
        }}</template>
        <template #item.remaining_amount="{ item }">{{
          formatMoney(toNumber(item.amount) - toNumber(item.paid_amount))
        }}</template>
        <template #item.status="{ item }"
          ><v-chip size="small" variant="tonal">{{
            statusLabel(item.status)
          }}</v-chip></template
        >
        <template #item.actions="{ item }"
          ><v-btn
            icon="mdi-eye"
            variant="text"
            title="معاينة العقد واعتماده وتصديره"
            aria-label="معاينة العقد واعتماده وتصديره"
            @click="openPreview(item.id)" /><v-btn
            v-if="can('contracts.manage') && item.status === 'draft'"
            icon="mdi-pencil"
            variant="text"
            title="تعديل المسودة"
            @click="openPreview(item.id)"
        /></template> </v-data-table
    ></v-card>
    <v-dialog v-model="previewOpen" max-width="1100" scrollable
      ><v-card
        ><v-card-title class="d-flex align-center"
          ><span>{{ selected?.contract.code }}</span
          ><v-spacer /><v-btn
            icon="mdi-close"
            variant="text"
            aria-label="إغلاق العقد"
            @click="previewOpen = false" /></v-card-title
        ><v-card-actions
          class="contract-actions"
          role="toolbar"
          aria-label="إجراءات العقد"
        >
          <v-btn
            prepend-icon="mdi-file-pdf-box"
            variant="tonal"
            :loading="exporting === 'pdf'"
            :disabled="
              !hasDocument || Boolean(exporting && exporting !== 'pdf')
            "
            @click="exportPdf"
            >تصدير PDF</v-btn
          >
          <v-btn
            prepend-icon="mdi-file-word-outline"
            variant="tonal"
            :loading="exporting === 'docx'"
            :disabled="
              !hasDocument || Boolean(exporting && exporting !== 'docx')
            "
            @click="exportDocx"
            >تصدير Word</v-btn
          >
          <v-btn
            v-if="isDraft && needsReview"
            prepend-icon="mdi-scale-balance"
            variant="tonal"
            :disabled="
              !can('legal_content.approve') || !legalReady || processing
            "
            @click="startLegalReview"
            >مراجعة الشروط الاستثنائية</v-btn
          >
          <v-btn
            v-if="isDraft"
            color="primary"
            prepend-icon="mdi-file-check-outline"
            :disabled="
              !can('contracts.manage') ||
              !legalReady ||
              (needsReview && !hasReview)
            "
            :loading="processing"
            @click="issue"
            >إصدار العقد المعتمد</v-btn
          >
          <v-btn
            v-if="isDraft && can('contracts.manage')"
            prepend-icon="mdi-pencil"
            variant="text"
            :disabled="processing"
            @click="openEdit()"
            >تعديل المسودة</v-btn
          > </v-card-actions
        ><v-divider /><v-card-text>
          <v-alert
            v-if="selected"
            :type="
              selected.contract.status === 'draft' ||
              selected.legal_snapshot?.document_model.legacy
                ? 'warning'
                : 'info'
            "
            variant="tonal"
            class="mb-3"
            >{{
              selected.contract.status === "draft"
                ? approvalMessage
                : selected.legal_snapshot?.document_model.legacy
                  ? "وثيقة تاريخية: حالة الاعتماد القانوني السابقة غير موثقة."
                  : "وثيقة صادرة محفوظة مع نسخها القانونية والمرئية وبياناتها التاريخية."
            }}</v-alert
          >
          <v-sheet v-if="isDraft" border rounded class="pa-3 mb-4">
            <p class="font-weight-bold mb-2">خطوات اعتماد العقد</p>
            <ol class="approval-steps">
              <li>
                اعتماد الصيغ القانونية المنطبقة على نوع العقد وجنس العقار.
              </li>
              <li>تجهيز المسودة بالصيغ المعتمدة ومراجعة بياناتها، ثم حفظها.</li>
              <li>
                {{
                  needsReview
                    ? "مراجعة الشروط الاستثنائية من حساب مختص ثم إصدار العقد."
                    : "إصدار العقد مباشرة باستخدام النص المعتمد والفعال."
                }}
              </li>
            </ol>
            <div v-if="!legalReady" class="mt-2 text-body-2">
              <p
                v-for="warning in selected?.legal_snapshot?.document_model
                  .warnings"
                :key="warning"
              >
                {{ warning }}
              </p>
            </div>
            <p
              v-if="needsReview && can('legal_content.approve') && !hasReview"
              class="mt-2 text-body-2"
            >
              يمكن توثيق أهلية المراجع من إعداد المراجعة المختصة في إدارة الصيغ
              القانونية.
            </p>
            <p
              v-if="!can('legal_content.read') && !legalReady"
              class="mt-2 text-body-2"
            >
              اطلب من مسؤول الصيغ القانونية إعداد واعتماد الصيغة لهذا العقد.
            </p>
            <div class="d-flex flex-wrap ga-2 mt-3">
              <v-btn
                v-if="can('legal_content.read')"
                :to="legalContentLink"
                variant="tonal"
                prepend-icon="mdi-text-box-check-outline"
                >إدارة واعتماد الصيغ</v-btn
              >
              <v-btn
                v-if="can('contracts.manage')"
                variant="tonal"
                prepend-icon="mdi-refresh"
                @click="openEdit(true)"
                >تجهيز المسودة بالصيغ المعتمدة</v-btn
              >
            </div>
          </v-sheet>
          <div class="package-grid">
            <v-card
              v-for="party in selected?.parties"
              :key="party.id"
              variant="tonal"
              ><v-card-title>{{
                party.role === "seller"
                  ? "البائع"
                  : party.role === "buyer"
                    ? "المشتري"
                    : party.role === "lessor"
                      ? "المؤجر"
                      : "المستأجر"
              }}</v-card-title
              ><v-card-text
                ><div class="font-weight-bold">
                  {{ party.snapshot?.full_name || party.person.full_name }}
                </div>
                <div>
                  {{
                    party.snapshot?.identity_number ||
                    party.person.national_id ||
                    "بدون رقم هوية"
                  }}
                </div>
                <div>
                  {{
                    party.snapshot?.phone_primary ||
                    party.person.phone_primary ||
                    "بدون هاتف"
                  }}
                </div>
                <div class="text-caption mt-2">
                  {{
                    selected?.attachments.filter(
                      (attachment) => attachment.contract_party_id === party.id,
                    ).length
                  }}
                  مستمسك مرفق
                </div></v-card-text
              ></v-card
            >
          </div>
          <v-divider class="my-4" />
          <v-sheet v-if="selected?.legal_snapshot" class="mb-3"
            ><p
              v-for="v in selected.legal_snapshot.legal_template_version"
              :key="v.id"
            >
              الصيغة القانونية {{ v.id }} · الإصدار {{ v.version }} ·
              {{ v.approval_status === "approved" ? "معتمدة" : "غير معتمدة" }}
            </p>
            <p v-if="selected.legal_snapshot.review">
              راجعها
              {{ selected.legal_snapshot.review.reviewer.lawyer_name }} في
              {{
                new Date(
                  selected.legal_snapshot.review.reviewed_at,
                ).toLocaleString("ar-IQ")
              }}
            </p></v-sheet
          >
          <ContractDocumentPreview
            :html="selected?.contract.generated_html"
            :text="selected?.contract.generated_content"
          /> </v-card-text></v-card
    ></v-dialog>
    <v-dialog v-model="legalReviewOpen" max-width="700"
      ><v-card
        ><v-card-title>اعتماد العقد بعد مراجعة المحامي</v-card-title
        ><v-card-text
          ><v-alert type="warning" variant="tonal"
            >سجل مراجعتك لظروف المعاملة، وانطباق الأساس القانوني، وبيانات
            الأطراف والعقارات والمستمسكات والشروط الإضافية في النسخة المعروضة.
            أي تعديل في المحتوى يتطلب مراجعة جديدة.</v-alert
          ><v-textarea
            v-model="reviewComment"
            label="نتيجة مراجعة المحامي وأسباب انطباق الصيغ"
            class="mt-3" /></v-card-text
        ><v-card-actions
          ><v-btn @click="legalReviewOpen = false">إلغاء</v-btn
          ><v-spacer /><v-btn
            color="primary"
            :disabled="reviewComment.trim().length < 10"
            :loading="processing"
            @click="recordLegalReview"
            >تسجيل اعتماد العقد</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
  </AppLayout>
</template>
<style scoped>
.package-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.contract-actions {
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
}
.approval-steps {
  padding-inline-start: 24px;
}
.contract-preview {
  white-space: pre-wrap;
  line-height: 2;
  direction: rtl;
}
@media (max-width: 760px) {
  .package-grid {
    grid-template-columns: 1fr;
  }
}
</style>
