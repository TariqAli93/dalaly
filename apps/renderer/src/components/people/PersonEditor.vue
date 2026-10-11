<script setup lang="ts">
import { ref, watch } from "vue";
import * as peopleService from "../../services/people.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";
import type { PersonRecord } from "../../types";
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ person: PersonRecord | null }>();
const emit = defineEmits<{ saved: [PersonRecord] }>();
const { notifyError, notifySuccess } = useSnackbar();
const saving = ref(false);
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
watch(
  () => [open.value, props.person] as const,
  ([isOpen, person]) => {
    if (!isOpen) return;
    form.value = {
      full_name: person?.full_name ?? "",
      phone_primary: person?.phone_primary ?? "",
      phone_secondary: person?.phone_secondary ?? "",
      email: person?.email ?? "",
      address: person?.address ?? "",
      national_id: person?.national_id ?? "",
      person_type: person?.person_type ?? "individual",
      status: person?.status ?? "active",
      notes: person?.notes ?? "",
    };
  },
  { immediate: true },
);
async function save() {
  if (saving.value || !form.value.full_name.trim()) return;
  saving.value = true;
  try {
    const person = props.person
      ? await peopleService.updatePerson(props.person.id, form.value)
      : await peopleService.createPerson(form.value);
    open.value = false;
    notifySuccess("تم حفظ بيانات الشخص.");
    emit("saved", person);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <v-dialog v-model="open" max-width="760"
    ><v-card
      ><v-card-title>{{ person ? "تعديل شخص" : "إضافة شخص" }}</v-card-title
      ><v-card-text
        ><v-row>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="form.full_name" label="الاسم الكامل"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="form.phone_primary" label="الهاتف"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="form.phone_secondary" label="هاتف إضافي"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="form.email" label="البريد الإلكتروني"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="form.national_id" label="رقم الهوية"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-select
              v-model="form.person_type"
              label="نوع الشخص"
              :items="[
                { title: 'فرد', value: 'individual' },
                { title: 'شركة', value: 'company' },
                { title: 'أخرى', value: 'other' },
              ]"
          /></v-col>
          <v-col cols="12"
            ><v-text-field v-model="form.address" label="العنوان" /><v-textarea
              v-model="form.notes"
              label="ملاحظات"
              rows="2"
          /></v-col> </v-row></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        ><v-btn color="primary" :loading="saving" @click="save"
          >حفظ</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
