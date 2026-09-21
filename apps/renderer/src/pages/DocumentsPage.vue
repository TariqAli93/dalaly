<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import * as customersService from "../services/customers.service";
import * as documents from "../services/documents.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import type { CustomerRecord, DocumentRecord, DocumentTypeRecord } from "../types";

const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const customers = ref<CustomerRecord[]>([]);
const types = ref<DocumentTypeRecord[]>([]);
const rows = ref<DocumentRecord[]>([]);
const customerId = ref<number | null>(null);
const missing = ref<Array<{ name: string }>>([]);
const expired = ref<DocumentRecord[]>([]);
const dialog = ref(false);
const file = ref<File | null>(null);
const saving = ref(false);
const form = ref({ document_type_id: null as number | null, document_name: "", expires_at: "", notes: "" });
const headers = [{ title: "الوثيقة", key: "document_name" }, { title: "العميل", key: "customer_name" }, { title: "النوع", key: "document_type_name" }, { title: "الانتهاء", key: "expires_at" }, { title: "الحالة", key: "computed_status" }, { title: "", key: "actions" }];
async function load() { try { customers.value = await customersService.listCustomers(); types.value = await documents.listDocumentTypes(); await loadCustomer(); } catch (error) { notifyError(getErrorMessage(error)); } }
async function loadCustomer() { if (!customerId.value) { rows.value = []; missing.value = []; expired.value = []; return; } try { rows.value = await documents.listDocuments({ customer_id: customerId.value }); const requirements = await documents.requirements(customerId.value) as { missing: Array<{ name: string }>; expired: DocumentRecord[] }; missing.value = requirements.missing; expired.value = requirements.expired; } catch (error) { notifyError(getErrorMessage(error)); } }
function openUpload() { form.value = { document_type_id: null, document_name: "", expires_at: "", notes: "" }; file.value = null; dialog.value = true; }
function onFile(event: Event) { file.value = (event.target as HTMLInputElement).files?.[0] ?? null; if (file.value && !form.value.document_name) form.value.document_name = file.value.name; }
function openDocument(id: number) { window.open(documents.fileUrl(id), "_blank"); }
function readFile(source: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(source); }); }
async function upload() { if (!customerId.value || !file.value || !form.value.document_name) { notifyError("اختر العميل والملف واكتب اسم الوثيقة."); return; } saving.value = true; try { await documents.uploadDocument({ customer_id: customerId.value, document_type_id: form.value.document_type_id, document_name: form.value.document_name, data: await readFile(file.value), original_name: file.value.name, file_type: file.value.type || "application/octet-stream", expires_at: form.value.expires_at || null, notes: form.value.notes || null }); dialog.value = false; notifySuccess("تم رفع الوثيقة دون استبدال الملفات السابقة."); await loadCustomer(); } catch (error) { notifyError(getErrorMessage(error)); } finally { saving.value = false; } }
watch(customerId, loadCustomer);
onMounted(load);
</script>
<template>
  <AppLayout title="المستندات" subtitle="مستندات العملاء المطلوبة مع تنبيه للنواقص والمنتهية.">
    <template #header-actions><v-btn v-if="can('documents.manage') && customerId" color="primary" prepend-icon="mdi-upload" @click="openUpload">رفع مستند</v-btn></template>
    <v-card variant="flat" border class="mb-3"><v-card-text><v-select v-model="customerId" :items="customers" item-title="full_name" item-value="id" label="اختر العميل" clearable /></v-card-text></v-card>
    <v-alert v-if="missing.length" type="warning" variant="tonal" class="mb-3">المستندات المطلوبة الناقصة: {{ missing.map((item) => item.name).join("، ") }}</v-alert><v-alert v-if="expired.length" type="error" variant="tonal" class="mb-3">يوجد {{ expired.length }} مستند منتهي الصلاحية.</v-alert>
    <v-card variant="flat" border><v-data-table :headers="headers" :items="rows" item-value="id" density="compact"><template #item.expires_at="{ item }">{{ item.expires_at ? new Date(item.expires_at).toLocaleDateString('ar-IQ') : '-' }}</template><template #item.computed_status="{ item }"><v-chip size="small" :color="item.computed_status === 'expired' ? 'error' : 'success'" variant="tonal">{{ item.computed_status === 'expired' ? 'منتهي' : item.computed_status === 'active' ? 'نشط' : 'مؤرشف' }}</v-chip></template><template #item.actions="{ item }"><v-btn icon="mdi-open-in-new" variant="text" title="فتح" @click="openDocument(item.id)" /></template></v-data-table></v-card>
    <v-dialog v-model="dialog" max-width="650"><v-card><v-card-title>رفع مستند</v-card-title><v-card-text><v-file-input label="الملف" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" @change="onFile" /><v-select v-model="form.document_type_id" :items="types" item-title="name" item-value="id" label="نوع المستند" clearable /><v-text-field v-model="form.document_name" label="اسم المستند" /><v-text-field v-model="form.expires_at" type="date" label="تاريخ الانتهاء" /><v-textarea v-model="form.notes" label="ملاحظات" rows="2" /></v-card-text><v-card-actions><v-spacer /><v-btn @click="dialog = false">إلغاء</v-btn><v-btn color="primary" :loading="saving" @click="upload">رفع</v-btn></v-card-actions></v-card></v-dialog>
  </AppLayout>
</template>
