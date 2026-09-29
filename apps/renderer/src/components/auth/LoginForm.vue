<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { getErrorMessage } from "../../services/api.service";
import { useAuth } from "../../composables/useAuth";
import { useSnackbar } from "../../composables/useSnackbar";

const route = useRoute();
const router = useRouter();
const { loginWithCredentials } = useAuth();
const { notifySuccess, notifyError } = useSnackbar();
const { t } = useI18n();

const form = ref({ username: "admin", pin: "" });
const loading = ref(false);

const required = (value: unknown) => Boolean(value) || t("common.required");

async function submit() {
  loading.value = true;
  try {
    await loginWithCredentials({ ...form.value });
    notifySuccess("تم تسجيل الدخول.");
    const redirect = (route.query.redirect as string) || "/";
    await router.replace(redirect);
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-form @submit.prevent="submit">
    <div class="text-h6 mb-2">تسجيل الدخول</div>
    <div class="text-body-2 text-medium-emphasis mb-5">
      {{ t("auth.loginDescription") }}
    </div>
    <v-text-field
      v-model="form.username"
      :label="t('common.username')"
      :rules="[required]"
      autofocus
    />
    <v-text-field
      v-model="form.pin"
      :label="t('common.pin')"
      type="password"
      :rules="[required]"
    />
    <v-btn
      block
      color="primary"
      type="submit"
      :loading="loading"
      prepend-icon="mdi-login"
    >
      دخول
    </v-btn>
  </v-form>
</template>
