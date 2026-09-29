<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import ContractWizard from "../components/contracts/ContractWizard.vue";
import * as contractsService from "../services/contracts.service";
import { getErrorMessage, getToken } from "../services/api.service";
import { platform } from "../platform";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { formatMoney } from "../utils/format";
import type { ContractBundle, ContractRecord } from "../types";

const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const rows = ref<ContractRecord[]>([]);
const loading = ref(false);
const wizardOpen = ref(false);
const previewOpen = ref(false);
const selected = ref<ContractBundle | null>(null);
const headers = [
  { title: "الرمز", key: "code" },
  { title: "النوع", key: "contract_type" },
  { title: "الطرف الأساسي", key: "primary_person_name" },
  { title: "المبلغ", key: "amount" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false },
];
function typeLabel(value: string) {
  return value === "sale" ? "بيع" : "إيجار";
}
function statusLabel(value: string) {
  return (
    (
      {
        active: "صادر",
        draft: "مسودة",
        completed: "مكتمل",
        cancelled: "ملغى",
        expired: "منتهي",
      } as Record<string, string>
    )[value] ?? value
  );
}
async function load() {
  loading.value = true;
  try {
    rows.value = await contractsService.listContracts();
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
function previewHtml() {
  const text = selected.value?.contract.generated_content ?? "";
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><style>body{font-family:Tahoma,Arial;padding:40px;line-height:2;white-space:pre-wrap}</style><h1>${typeLabel(selected.value?.contract.contract_type ?? "sale")}</h1><div>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div></html>`;
}
async function exportPdf() {
  if (!selected.value) return;
  const result = await platform.exportPdf({
    html: previewHtml(),
    suggestedName: `${selected.value.contract.code}.pdf`,
    title: "تصدير العقد",
    text: selected.value.contract.generated_content ?? "",
  });
  if (!result.ok && !result.canceled)
    notifyError(result.message ?? "تعذر تصدير ملف بي دي إف.");
}
function base64Bytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
async function exportDocx() {
  if (!selected.value) return;
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
      suggestedName: payload.filename,
      title: "تصدير المستند",
      filters: [{ name: "ملف مستند", extensions: ["docx"] }],
    });
    if (save.ok) notifySuccess("تم تصدير العقد إلى ملف مستند.");
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
function onSaved() {
  notifySuccess("تم إنشاء العقد وحفظ الحزمة التاريخية.");
  void load();
}
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
        @click="wizardOpen = true"
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
        <template #item.status="{ item }"
          ><v-chip size="small" variant="tonal">{{
            statusLabel(item.status)
          }}</v-chip></template
        >
        <template #item.actions="{ item }"
          ><v-btn
            icon="mdi-eye"
            variant="text"
            title="فتح الحزمة"
            @click="openPreview(item.id)"
        /></template> </v-data-table
    ></v-card>
    <ContractWizard v-model="wizardOpen" @saved="onSaved" />
    <v-dialog v-model="previewOpen" max-width="980"
      ><v-card
        ><v-card-title class="d-flex align-center"
          ><span>{{ selected?.contract.code }}</span
          ><v-spacer /><v-btn
            icon="mdi-close"
            variant="text"
            @click="previewOpen = false" /></v-card-title
        ><v-card-text>
          <v-alert v-if="selected" type="success" variant="tonal" class="mb-3"
            >هذه الحزمة تحتوي على نسخة الأطراف والمكتب والعقار والمستمَسكات
            المستخدمة وقت الإصدار.</v-alert
          >
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
          <div class="contract-preview">
            {{ selected?.contract.generated_content }}
          </div> </v-card-text
        ><v-card-actions
          ><v-btn
            prepend-icon="mdi-file-pdf-box"
            variant="tonal"
            @click="exportPdf"
            >بي دي إف</v-btn
          ><v-btn
            prepend-icon="mdi-file-word-outline"
            variant="tonal"
            @click="exportDocx"
            >ملف مستند</v-btn
          ><v-spacer /><v-btn @click="previewOpen = false"
            >إغلاق</v-btn
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
