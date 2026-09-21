<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import NumberField from "../components/app/NumberField.vue";
import * as contracts from "../services/contracts.service";
import * as customersService from "../services/customers.service";
import * as propertiesService from "../services/properties.service";
import * as rentalsService from "../services/rentals.service";
import * as companySettingsService from "../services/company-settings.service";
import { platform } from "../platform";
import { getErrorMessage, getToken } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { formatMoney } from "../utils/format";
import type {
  ContractBundle,
  ContractRecord,
  CustomerRecord,
  PropertyRecord,
  RentalRecord,
} from "../types";

const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const rows = ref<ContractRecord[]>([]);
const customers = ref<CustomerRecord[]>([]);
const properties = ref<PropertyRecord[]>([]);
const rentals = ref<RentalRecord[]>([]);
const companyLogo = ref("");
const loading = ref(false);
const dialog = ref(false);
const preview = ref(false);
const saving = ref(false);
const selected = ref<ContractBundle | null>(null);
const editing = ref<number | null>(null);
const missingDocuments = ref<Array<{ name: string }>>([]);
const form = ref({
  contract_type: "sale",
  customer_id: null as number | null,
  property_id: null as number | null,
  rental_id: null as number | null,
  status: "draft",
  contract_date: new Date().toISOString().slice(0, 10),
  start_date: "",
  end_date: "",
  amount: null as string | number | null,
  notes: "",
});
const parties = ref<Array<{ customer_id: number; role: string }>>([]);
const partyCustomer = ref<number | null>(null);
const partyRole = ref("buyer");
const headers = [
  { title: "الرمز", key: "code" },
  { title: "النوع", key: "contract_type" },
  { title: "العميل", key: "customer_name" },
  { title: "المبلغ", key: "amount" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions" },
];
function typeLabel(value: string) {
  return (
    (
      {
        sale: "بيع",
        purchase: "شراء",
        rental: "إيجار",
        lease: "تأجير",
      } as Record<string, string>
    )[value] ?? value
  );
}
function rolesForType() {
  return form.value.contract_type === "sale" ||
    form.value.contract_type === "purchase"
    ? [
        { title: "البائع", value: "seller" },
        { title: "المشتري", value: "buyer" },
      ]
    : [
        { title: "المؤجر", value: "landlord" },
        { title: "المستأجر", value: "tenant" },
      ];
}
async function loadCompanyLogo() {
  try {
    companyLogo.value = (await companySettingsService.getCompanySettings())
      .logo_file_path
      ? companySettingsService.logoUrl()
      : "";
  } catch {
    companyLogo.value = "";
  }
}
async function load() {
  loading.value = true;
  try {
    [rows.value, customers.value, properties.value, rentals.value] =
      await Promise.all([
        contracts.listContracts(),
        customersService.listCustomers(),
        propertiesService.listProperties(),
        rentalsService.listRentals(),
      ]);
    await loadCompanyLogo();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}
function openCreate() {
  editing.value = null;
  missingDocuments.value = [];
  form.value = {
    contract_type: "sale",
    customer_id: null,
    property_id: null,
    rental_id: null,
    status: "draft",
    contract_date: new Date().toISOString().slice(0, 10),
    start_date: "",
    end_date: "",
    amount: null,
    notes: "",
  };
  parties.value = [];
  partyCustomer.value = null;
  partyRole.value = "buyer";
  dialog.value = true;
}
async function openEdit(item: ContractRecord) {
  try {
    const bundle = await contracts.getContract(item.id);
    editing.value = item.id;
    selected.value = bundle;
    form.value = {
      contract_type: bundle.contract.contract_type,
      customer_id: bundle.contract.primary_customer_id,
      property_id: bundle.contract.property_id,
      rental_id: bundle.contract.rental_id,
      status: bundle.contract.status,
      contract_date: bundle.contract.contract_date.slice(0, 10),
      start_date: bundle.contract.start_date?.slice(0, 10) ?? "",
      end_date: bundle.contract.end_date?.slice(0, 10) ?? "",
      amount:
        bundle.contract.amount === null ? null : Number(bundle.contract.amount),
      notes: bundle.contract.notes ?? "",
    };
    parties.value = bundle.parties.map((party) => ({
      customer_id: party.customer_id,
      role: party.role,
    }));
    dialog.value = true;
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
function addParty() {
  if (!partyCustomer.value || !partyRole.value) return;
  parties.value.push({
    customer_id: partyCustomer.value,
    role: partyRole.value,
  });
  partyCustomer.value = null;
}
function removeParty(index: number) {
  parties.value.splice(index, 1);
}
async function save() {
  if (
    !parties.value.length ||
    (!form.value.property_id && !form.value.rental_id)
  ) {
    notifyError("اختر العقار أو الإيجار وأضف أطراف العقد.");
    return;
  }
  saving.value = true;
  try {
    const payload = {
      ...form.value,
      contract_date: new Date(form.value.contract_date),
      start_date: form.value.start_date
        ? new Date(form.value.start_date)
        : null,
      end_date: form.value.end_date ? new Date(form.value.end_date) : null,
      amount:
        form.value.amount === null || form.value.amount === ""
          ? null
          : Number(String(form.value.amount).replace(/,/g, "")),
      property_id:
        form.value.contract_type === "rental" ||
        form.value.contract_type === "lease"
          ? null
          : form.value.property_id,
      rental_id:
        form.value.contract_type === "rental" ||
        form.value.contract_type === "lease"
          ? form.value.rental_id
          : null,
      parties: parties.value,
    };
    const result = editing.value
      ? await contracts.updateContract(editing.value, payload)
      : await contracts.createContract(payload);
    missingDocuments.value =
      (result as { missing_documents?: Array<{ name: string }> })
        .missing_documents ?? [];
    dialog.value = false;
    const id =
      editing.value ??
      Number((result as { contract?: { id: number } }).contract?.id);
    if (id) await openPreview(id);
    notifySuccess("تم حفظ العقد.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    saving.value = false;
  }
}
async function openPreview(id: number) {
  try {
    selected.value = await contracts.getContract(id);
    preview.value = true;
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
function previewHtml() {
  const text = selected.value?.contract.generated_content ?? "";
  const logo = companyLogo.value
    ? `<img src="${companyLogo.value}" style="max-width:180px;max-height:90px;display:block;margin:0 auto 24px" />`
    : "";
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><style>body{font-family:Tahoma,Arial;padding:40px;line-height:2;white-space:pre-wrap}h1{color:#116466}</style>${logo}<h1>${typeLabel(selected.value?.contract.contract_type ?? "contract")}</h1><div>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div></html>`;
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
    notifyError(result.message ?? "تعذر تصدير PDF.");
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
    const result = await fetch(
      `${import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:34567/api"}/contracts/${selected.value.contract.id}/docx`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (!result.ok) throw new Error("تعذر تحميل ملف Word.");
    const payload = (await result.json()) as { filename: string; data: string };
    const save = await platform.saveFile({
      data: base64Bytes(payload.data),
      suggestedName: payload.filename,
      title: "تصدير Word",
      filters: [{ name: "Word Document", extensions: ["docx"] }],
    });
    if (save.ok) notifySuccess("تم تصدير العقد إلى Word.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
onMounted(load);
</script>
<template>
  <AppLayout
    title="العقود"
    subtitle="عقود بيع وشراء وإيجار وتأجير مرتبطة بالعقار والعملاء والأطراف."
  >
    <template #header-actions
      ><v-btn
        v-if="can('contracts.manage')"
        color="primary"
        prepend-icon="mdi-file-document-plus-outline"
        @click="openCreate"
        >إضافة عقد</v-btn
      ></template
    >
    <v-card variant="flat" border
      ><v-data-table
        :headers="headers"
        :items="rows"
        :loading="loading"
        item-value="id"
        density="compact"
        ><template #item.contract_type="{ item }">{{
          typeLabel(item.contract_type)
        }}</template
        ><template #item.amount="{ item }">{{
          item.amount === null || item.amount === undefined
            ? "-"
            : formatMoney(item.amount)
        }}</template
        ><template #item.actions="{ item }"
          ><v-btn
            icon="mdi-eye"
            variant="text"
            title="معاينة"
            @click="openPreview(item.id)" /><v-btn
            v-if="can('contracts.manage')"
            icon="mdi-pencil"
            variant="text"
            title="تعديل"
            @click="openEdit(item)" /></template></v-data-table
    ></v-card>
    <v-dialog v-model="dialog" max-width="900"
      ><v-card
        ><v-card-title>{{ editing ? "تعديل عقد" : "إضافة عقد" }}</v-card-title
        ><v-card-text>
          <div class="form-grid">
            <v-select
              v-model="form.contract_type"
              :items="[
                { title: 'بيع', value: 'sale' },
                { title: 'شراء', value: 'purchase' },
                { title: 'إيجار', value: 'rental' },
                { title: 'تأجير', value: 'lease' },
              ]"
              label="نوع العقد"
            /><v-select
              v-model="form.customer_id"
              :items="customers"
              item-title="full_name"
              item-value="id"
              label="العميل الأساسي"
            /><v-autocomplete
              v-if="
                form.contract_type === 'sale' ||
                form.contract_type === 'purchase'
              "
              v-model="form.property_id"
              :items="properties"
              item-title="name"
              item-value="id"
              label="العقار"
              clearable
            /><v-autocomplete
              v-else
              v-model="form.rental_id"
              :items="rentals"
              item-title="name"
              item-value="id"
              label="العرض الإيجاري"
              clearable
            /><v-text-field
              v-model="form.contract_date"
              type="date"
              label="تاريخ العقد"
            /><v-text-field
              v-model="form.start_date"
              type="date"
              label="تاريخ البدء"
            /><v-text-field
              v-model="form.end_date"
              type="date"
              label="تاريخ الانتهاء"
            /><NumberField
              v-model="form.amount"
              :decimals="false"
              label="المبلغ"
            /><v-select
              v-model="form.status"
              :items="['draft', 'active', 'completed', 'cancelled', 'expired']"
              label="الحالة"
            />
          </div>
          <v-divider class="my-4" />
          <div class="d-flex ga-2">
            <v-select
              v-model="partyCustomer"
              :items="customers"
              item-title="full_name"
              item-value="id"
              label="طرف العقد"
            /><v-select
              v-model="partyRole"
              :items="rolesForType()"
              label="الدور"
            /><v-btn class="mt-2" variant="tonal" @click="addParty"
              >إضافة طرف</v-btn
            >
          </div>
          <v-chip
            v-for="(party, index) in parties"
            :key="`${party.customer_id}-${party.role}-${index}`"
            closable
            class="ma-1"
            @click:close="removeParty(index)"
            >{{
              customers.find((customer) => customer.id === party.customer_id)
                ?.full_name
            }}
            · {{ party.role }}</v-chip
          ><v-textarea
            v-model="form.notes"
            label="ملاحظات"
            rows="2"
          /> </v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn @click="dialog = false">إلغاء</v-btn
          ><v-btn color="primary" :loading="saving" @click="save"
            >حفظ وتوليد</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-dialog v-model="preview" max-width="900"
      ><v-card
        ><v-card-title>معاينة {{ selected?.contract.code }}</v-card-title
        ><v-card-text
          ><v-img
            v-if="companyLogo"
            :src="companyLogo"
            max-height="90"
            contain
            class="mb-3"
          /><v-alert
            v-if="missingDocuments.length"
            type="warning"
            variant="tonal"
            class="mb-3"
            >المستندات المطلوبة الناقصة:
            {{ missingDocuments.map((item) => item.name).join("، ") }}</v-alert
          ><v-alert
            v-if="selected?.contract.generated_content"
            variant="tonal"
            class="contract-preview"
            >{{ selected.contract.generated_content }}</v-alert
          ><v-alert v-else type="warning"
            >لم يتم توليد محتوى العقد.</v-alert
          ></v-card-text
        ><v-card-actions
          ><v-btn
            prepend-icon="mdi-file-pdf-box"
            variant="tonal"
            @click="exportPdf"
            >PDF</v-btn
          ><v-btn
            prepend-icon="mdi-file-word-outline"
            variant="tonal"
            @click="exportDocx"
            >Word</v-btn
          ><v-spacer /><v-btn @click="preview = false"
            >إغلاق</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
  </AppLayout>
</template>
<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.contract-preview {
  white-space: pre-wrap;
  line-height: 2;
  min-height: 280px;
}

@media (max-width: 800px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
