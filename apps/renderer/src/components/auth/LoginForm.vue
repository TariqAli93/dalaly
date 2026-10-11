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
const showPin = ref(false);
const loginError = ref("");

const required = (value: unknown) => Boolean(value) || t("common.required");

async function submit() {
  loading.value = true;
  loginError.value = "";
  try {
    await loginWithCredentials({ ...form.value });
    notifySuccess("تم تسجيل الدخول.");
    const redirect = (route.query.redirect as string) || "/";
    await router.replace(redirect);
  } catch (error) {
    loginError.value = getErrorMessage(error);
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-form @submit.prevent="submit">
    <h1 class="login-title">تسجيل الدخول</h1>
    <div class="text-body-2 text-medium-emphasis mb-5">
      {{ t("auth.loginDescription") }}
    </div>
    <v-text-field
      v-model="form.username"
      :label="t('common.username')"
      :rules="[required]"
      autofocus
      prepend-inner-icon="mdi-account-outline"
      autocomplete="username"
    />
    <v-text-field
      v-model="form.pin"
      :label="t('common.pin')"
      :type="showPin ? 'text' : 'password'"
      :rules="[required]"
      prepend-inner-icon="mdi-lock-outline"
      :append-inner-icon="showPin ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
      :aria-label="t('common.pin')"
      autocomplete="current-password"
      @click:append-inner="showPin = !showPin"
    />
    <v-alert
      v-if="loginError"
      type="error"
      variant="tonal"
      class="mb-4"
      density="compact"
      role="alert"
      >{{ loginError }}</v-alert
    >
    <v-btn
      block
      color="primary"
      type="submit"
      :loading="loading"
      prepend-icon="mdi-login"
      height="42"
    >
      تسجيل الدخول
    </v-btn>
  </v-form>
</template>

<style scoped>
.login-title {
  font-size: calc(26px * var(--dal-font-scale));
  font-weight: 700;
  margin-bottom: 8px;
}
</style>
