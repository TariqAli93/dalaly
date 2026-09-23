<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import { getErrorMessage } from "../services/api.service";
import * as customers from "../services/customers.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import type { CustomerRecord } from "../types";

const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const items = ref<CustomerRecord[]>([]);
const loading = ref(false);
const search = ref("");
const dialog = ref(false);
const saving = ref(false);
const editing = ref<CustomerRecord | null>(null);
const form = ref<{
  full_name: string;
  phone_primary: string;
  phone_secondary: string;
  email: string;
  address: string;
  national_id: string;
  customer_type: CustomerRecord["customer_type"];
  status: CustomerRecord["status"];
  notes: string;
}>({
  full_name: "",
  phone_primary: "",
  phone_secondary: "",
  email: "",
  address: "",
  national_id: "",
  customer_type: "individual",
  status: "active",
  notes: "",
});
const headers = [
  { title: "الاسم", key: "full_name" },
  { title: "الرمز", key: "code" },
  { title: "الهاتف", key: "phone_primary" },
  { title: "النوع", key: "customer_type" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false },
];
async function load() {
  loading.value = true;
  try {
    items.value = await customers.listCustomers({ q: search.value });
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}
function openCreate() {
  editing.value = null;
  form.value = {
    full_name: "",
    phone_primary: "",
    phone_secondary: "",
    email: "",
    address: "",
    national_id: "",
    customer_type: "individual",
    status: "active",
    notes: "",
  };
  dialog.value = true;
}
function openEdit(item: CustomerRecord) {
  editing.value = item;
  form.value = {
    full_name: item.full_name,
    phone_primary: item.phone_primary,
    phone_secondary: item.phone_secondary ?? "",
    email: item.email ?? "",
    address: item.address ?? "",
    national_id: item.national_id ?? "",
    customer_type: item.customer_type,
    status: item.status,
    notes: item.notes ?? "",
  };
  dialog.value = true;
}
async function save() {
  if (!form.value.full_name.trim() || !form.value.phone_primary.trim()) {
    notifyError("الاسم والهاتف مطلوبان.");
    return;
  }
  saving.value = true;
  try {
    if (editing.value)
      await customers.updateCustomer(editing.value.id, form.value);
    else await customers.createCustomer(form.value);
    dialog.value = false;
    notifySuccess("تم حفظ بيانات العميل.");
    await load();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    saving.value = false;
  }
}
async function archive(item: CustomerRecord) {
  try {
    await customers.archiveCustomer(item.id);
    notifySuccess("تمت أرشفة العميل.");
    await load();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
async function restore(item: CustomerRecord) {
  try {
    await customers.restoreCustomer(item.id);
    notifySuccess("تم إرجاع العميل.");
    await load();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
onMounted(load);
</script>
<template>
  <AppLayout
    title="العملاء"
    subtitle="بيانات العملاء المرتبطين بالطلبات والمستندات والعقود."
  >
    <template #header-actions
      ><v-btn
        v-if="can('customers.create')"
        color="primary"
        prepend-icon="mdi-account-plus-outline"
        @click="openCreate"
        >إضافة عميل</v-btn
      ></template
    >
    <div class="d-flex ga-2 mb-3">
      <v-text-field
        v-model="search"
        label="بحث بالاسم أو الهاتف أو الرمز"
        prepend-inner-icon="mdi-magnify"
        clearable
        hide-details
        @keyup.enter="load"
      /><v-btn variant="tonal" @click="load">بحث</v-btn>
    </div>
    <v-card variant="flat" border
      ><v-data-table
        :headers="headers"
        :items="items"
        :loading="loading"
        item-value="id"
        density="compact"
      >
        <template #item.customer_type="{ item }"
          ><span>{{
            item.customer_type === "company"
              ? "شركة"
              : item.customer_type === "individual"
                ? "فرد"
                : "أخرى"
          }}</span></template
        >
        <template #item.status="{ item }"
          ><v-chip
            size="small"
            :color="item.status === 'active' ? 'success' : undefined"
            variant="tonal"
            >{{
              item.status === "active"
                ? "نشط"
                : item.status === "archived"
                  ? "مؤرشف"
                  : "غير نشط"
            }}</v-chip
          ></template
        >
        <template #item.actions="{ item }"
          ><div class="d-flex ga-1 justify-end">
            <v-btn
              v-if="can('customers.update')"
              icon="mdi-pencil"
              variant="text"
              title="تعديل"
              @click="openEdit(item)"
            /><v-btn
              v-if="item.status !== 'archived' && can('customers.update')"
              icon="mdi-archive-arrow-down-outline"
              variant="text"
              color="warning"
              title="أرشفة"
              @click="archive(item)"
            /><v-btn
              v-if="item.status === 'archived' && can('customers.update')"
              icon="mdi-archive-arrow-up-outline"
              variant="text"
              color="success"
              title="إرجاع"
              @click="restore(item)"
            /></div
        ></template> </v-data-table
    ></v-card>
    <v-dialog v-model="dialog" max-width="760"
      ><v-card
        ><v-card-title>{{ editing ? "تعديل عميل" : "إضافة عميل" }}</v-card-title
        ><v-card-text
          ><div class="form-grid">
            <v-text-field
              v-model="form.full_name"
              label="الاسم الكامل"
            /><v-text-field
              v-model="form.phone_primary"
              label="الهاتف الأساسي"
            /><v-text-field
              v-model="form.phone_secondary"
              label="هاتف إضافي"
            /><v-text-field
              v-model="form.email"
              label="البريد الإلكتروني"
            /><v-text-field
              v-model="form.national_id"
              label="رقم الهوية"
            /><v-select
              v-model="form.customer_type"
              label="نوع العميل"
              :items="[
                { title: 'فرد', value: 'individual' },
                { title: 'شركة', value: 'company' },
                { title: 'أخرى', value: 'other' },
              ]"
            /><v-text-field v-model="form.address" label="العنوان" /><v-textarea
              v-model="form.notes"
              label="ملاحظات"
              rows="2"
            /></div></v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn variant="text" @click="dialog = false"
            >إلغاء</v-btn
          ><v-btn color="primary" :loading="saving" @click="save"
            >حفظ</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
  </AppLayout>
</template>
<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 700px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
