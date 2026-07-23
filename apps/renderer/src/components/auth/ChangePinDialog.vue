<script setup lang="ts">
import { ref } from "vue";
import { changePin } from "../../services/auth.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";

const open = defineModel<boolean>({ required: true });

const { notifySuccess, notifyError } = useSnackbar();

const form = ref({ current: "", next: "", confirm: "" });
const loading = ref(false);

const required = (v: unknown) => Boolean(v) || "هذا الحقل مطلوب";
const pinRule = (v: string) =>
  (v.length >= 4 && v.length <= 12) || "بين 4 و12 خانة.";

async function submit() {
  if (form.value.next !== form.value.confirm) {
    notifyError("رمز PIN الجديد وتأكيده غير متطابقين.");
    return;
  }
  loading.value = true;
  try {
    await changePin(form.value.current, form.value.next);
    notifySuccess("تم تغيير رمز PIN بنجاح.");
    form.value = { current: "", next: "", confirm: "" };
    open.value = false;
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="open" width="460">
    <v-card>
      <v-card-title>تغيير رمز PIN</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="submit">
          <v-text-field
            v-model="form.current"
            label="الرمز الحالي"
            type="password"
            :rules="[required]"
          />
          <v-text-field
            v-model="form.next"
            label="الرمز الجديد"
            type="password"
            :rules="[required, pinRule]"
          />
          <v-text-field
            v-model="form.confirm"
            label="تأكيد الرمز الجديد"
            type="password"
            :rules="[required]"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">إلغاء</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          @click="submit"
        >
          حفظ
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
