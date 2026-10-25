<script setup lang="ts">
import { computed, ref, watch } from "vue";
import * as peopleService from "../../services/people.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";
import type { PersonRecord } from "../../types";
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ person: PersonRecord | null }>();
const emit = defineEmits<{ saved: [PersonRecord] }>();
const { notifySuccess } = useSnackbar();
const saving = ref(false);
const submitted = ref(false);
const error = ref("");
const fieldErrors = ref<Record<string, string[]>>({});
const form = ref({
  full_name: "",
  phone_primary: "",
  phone_secondary: "",
  email: "",
  address: "",
  national_id: "",
  governorate: "",
  district: "",
  neighborhood: "",
  alley: "",
  house_number: "",
  residence_card_number: "",
  person_type: "individual" as PersonRecord["person_type"],
  status: "active" as PersonRecord["status"],
  notes: "",
});
// بعد أي تعديل لا يُغلق الحوار بـ Esc أو بالنقر خارجه؛ «إلغاء» يبقى متاحاً.
const openedWith = ref("");
const dirty = computed(
  () => open.value && JSON.stringify(form.value) !== openedWith.value,
);
watch(
  () => [open.value, props.person] as const,
  ([isOpen, person]) => {
    if (!isOpen) return;
    submitted.value = false;
    error.value = "";
    fieldErrors.value = {};
    form.value = {
      full_name: person?.full_name ?? "",
      phone_primary: person?.phone_primary ?? "",
      phone_secondary: person?.phone_secondary ?? "",
      email: person?.email ?? "",
      address: person?.address ?? "",
      national_id: person?.national_id ?? "",
      governorate: person?.governorate ?? "",
      district: person?.district ?? "",
      neighborhood: person?.neighborhood ?? "",
      alley: person?.alley ?? "",
      house_number: person?.house_number ?? "",
      residence_card_number: person?.residence_card_number ?? "",
      person_type: person?.person_type ?? "individual",
      status: person?.status ?? "active",
      notes: person?.notes ?? "",
    };
    openedWith.value = JSON.stringify(form.value);
  },
  { immediate: true },
);
async function save() {
  if (saving.value) return;
  submitted.value = true;
  if (!form.value.full_name.trim()) return;
  saving.value = true;
  error.value = "";
  fieldErrors.value = {};
  try {
    const person = props.person
      ? await peopleService.updatePerson(props.person.id, form.value)
      : await peopleService.createPerson(form.value);
    open.value = false;
    notifySuccess("تم حفظ بيانات الشخص.");
    emit("saved", person);
  } catch (cause) {
    // الخادم يرسل { field, message } (ApiErrorBody)؛ path احتياط لشكل قديم.
    const issues = (
      cause as {
        issues?: Array<{
          message: string;
          field?: string;
          path?: string | (string | number)[];
        }>;
      }
    )?.issues;
    if (issues?.length) {
      for (const issue of issues) {
        const key =
          issue.field ??
          (Array.isArray(issue.path) ? issue.path.join(".") : issue.path);
        if (key) (fieldErrors.value[key] ??= []).push(issue.message);
        else error.value = issue.message;
      }
    } else error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <v-dialog
    v-model="open"
    max-width="760"
    class="person-editor"
    scrollable
    :persistent="dirty || saving"
    ><v-card
      ><v-card-title>{{ person ? "تعديل شخص" : "إضافة شخص" }}</v-card-title
      ><v-card-text
        ><v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert
        ><v-row>
          <v-col cols="12" sm="6"
            ><v-text-field
              v-model="form.full_name"
              label="الاسم الرباعي مع اللقب"
              :error-messages="
                submitted && !form.full_name.trim()
                  ? ['اسم الشخص مطلوب.']
                  : fieldErrors.full_name
              "
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field
              v-model="form.phone_primary"
              label="الهاتف"
              :error-messages="fieldErrors.phone_primary"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="form.phone_secondary" label="هاتف إضافي"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field
              v-model="form.email"
              label="البريد الإلكتروني"
              :error-messages="fieldErrors.email"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field
              v-model="form.national_id"
              label="رقم البطاقة الوطنية أو هوية الأحوال المدنية"
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
          <v-col cols="12" sm="6"
            ><v-text-field
              v-model="form.residence_card_number"
              label="رقم بطاقة السكن"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="form.governorate" label="محافظة السكن"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="form.district" label="القضاء أو الناحية"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field
              v-model="form.neighborhood"
              label="المنطقة أو المحلة"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="form.alley" label="الزقاق، إن توفر"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field v-model="form.house_number" label="الدار، إن توفر"
          /></v-col>
          <v-col cols="12"
            ><v-text-field
              v-model="form.address"
              label="محل الإقامة الحالي وتفاصيل العنوان" /><v-textarea
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
