<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import * as peopleService from "../services/people.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import type { PersonRecord } from "../types";

const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const rows = ref<PersonRecord[]>([]);
const search = ref("");
const dialog = ref(false);
const saving = ref(false);
const editing = ref<PersonRecord | null>(null);
const form = ref({
  full_name: "",
  phone_primary: "",
  phone_secondary: "",
  email: "",
  address: "",
  national_id: "",
  person_type: "individual" as PersonRecord["person_type"],
  status: "active" as PersonRecord["status"],
  notes: "",
});
const headers = [
  { title: "الاسم", key: "full_name" },
  { title: "الرمز", key: "code" },
  { title: "الهاتف", key: "phone_primary" },
  { title: "النوع", key: "person_type" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false },
];
async function load() {
  try {
    rows.value = await peopleService.listPeople({ q: search.value });
  } catch (cause) {
    notifyError(getErrorMessage(cause));
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
    person_type: "individual",
    status: "active",
    notes: "",
  };
  dialog.value = true;
}
function openEdit(person: PersonRecord) {
  editing.value = person;
  form.value = {
    full_name: person.full_name,
    phone_primary: person.phone_primary ?? "",
    phone_secondary: person.phone_secondary ?? "",
    email: person.email ?? "",
    address: person.address ?? "",
    national_id: person.national_id ?? "",
    person_type: person.person_type,
    status: person.status,
    notes: person.notes ?? "",
  };
  dialog.value = true;
}
async function save() {
  if (!form.value.full_name.trim()) return;
  saving.value = true;
  try {
    if (editing.value)
      await peopleService.updatePerson(editing.value.id, form.value);
    else await peopleService.createPerson(form.value);
    dialog.value = false;
    notifySuccess("تم حفظ بيانات الشخص.");
    await load();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    saving.value = false;
  }
}
async function archive(person: PersonRecord) {
  try {
    await peopleService.archivePerson(person.id);
    await load();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
async function restore(person: PersonRecord) {
  try {
    await peopleService.restorePerson(person.id);
    await load();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
onMounted(load);
</script>
<template>
  <AppLayout
    title="الأشخاص"
    subtitle="بيانات عامة قابلة لإعادة الاستخدام، بينما صفة البائع أو المشتري تُحفظ داخل العقد فقط."
  >
    <template #header-actions
      ><v-btn
        v-if="can('people.create')"
        color="primary"
        prepend-icon="mdi-account-plus-outline"
        @click="openCreate"
        >إضافة شخص</v-btn
      ></template
    >
    <div class="d-flex ga-2 mb-3">
      <v-text-field
        v-model="search"
        label="بحث بالاسم أو الهاتف أو الرمز"
        hide-details
        clearable
        @keyup.enter="load"
      /><v-btn variant="tonal" @click="load">بحث</v-btn>
    </div>
    <v-card variant="flat" border
      ><v-data-table
        :headers="headers"
        :items="rows"
        item-value="id"
        density="compact"
        ><template #item.person_type="{ item }">{{
          item.person_type === "company"
            ? "شركة"
            : item.person_type === "individual"
              ? "فرد"
              : "أخرى"
        }}</template
        ><template #item.status="{ item }"
          ><v-chip size="small" variant="tonal">{{
            item.status === "archived"
              ? "مؤرشف"
              : item.status === "active"
                ? "نشط"
                : "غير نشط"
          }}</v-chip></template
        ><template #item.actions="{ item }"
          ><v-btn
            v-if="can('people.update')"
            icon="mdi-pencil"
            variant="text"
            @click="openEdit(item)" /><v-btn
            v-if="item.status !== 'archived' && can('people.update')"
            icon="mdi-archive-arrow-down-outline"
            variant="text"
            color="warning"
            @click="archive(item)" /><v-btn
            v-if="item.status === 'archived' && can('people.update')"
            icon="mdi-archive-arrow-up-outline"
            variant="text"
            color="success"
            @click="restore(item)" /></template></v-data-table
    ></v-card>
    <v-dialog v-model="dialog" max-width="760"
      ><v-card
        ><v-card-title>{{ editing ? "تعديل شخص" : "إضافة شخص" }}</v-card-title
        ><v-card-text class="form-grid"
          ><v-text-field
            v-model="form.full_name"
            label="الاسم الكامل" /><v-text-field
            v-model="form.phone_primary"
            label="الهاتف" /><v-text-field
            v-model="form.phone_secondary"
            label="هاتف إضافي" /><v-text-field
            v-model="form.email"
            label="البريد الإلكتروني" /><v-text-field
            v-model="form.national_id"
            label="رقم الهوية" /><v-select
            v-model="form.person_type"
            label="نوع الشخص"
            :items="[
              { title: 'فرد', value: 'individual' },
              { title: 'شركة', value: 'company' },
              { title: 'أخرى', value: 'other' },
            ]" /><v-text-field
            v-model="form.address"
            label="العنوان" /><v-textarea
            v-model="form.notes"
            label="ملاحظات"
            rows="2"
            class="grid-span" /></v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn @click="dialog = false">إلغاء</v-btn
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
.grid-span {
  grid-column: 1 / -1;
}
</style>
