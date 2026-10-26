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
const { notifySuccess } = useSnackbar();
const { t } = useI18n();

// لا مستخدم افتراضي («admin» لا وجود له): آخر اسم دخل من هذا الجهاز، وإلا فارغ.
const LAST_USER_KEY = "dalaly.login.lastUser";
function lastUser() {
  try {
    return localStorage.getItem(LAST_USER_KEY) ?? "";
  } catch {
    return "";
  }
}
const form = ref({ username: lastUser(), pin: "" });
const loading = ref(false);
const showPin = ref(false);
const loginError = ref("");

const required = (value: unknown) => Boolean(value) || t("common.required");

async function submit() {
  // Enter يرسل النموذج حتى أثناء الطلب؛ loading يمنع النقر وحده.
  if (loading.value) return;
  loading.value = true;
  loginError.value = "";
  try {
    await loginWithCredentials({ ...form.value });
    try {
      localStorage.setItem(LAST_USER_KEY, form.value.username);
    } catch {
      // التذكّر راحة لا أكثر.
    }
    notifySuccess("تم تسجيل الدخول.");
    const redirect = (route.query.redirect as string) || "/";
    await router.replace(redirect);
  } catch (error) {
    // الخطأ تحت الحقول وحده، لا مرتين (تنبيه وإشعار).
    loginError.value = getErrorMessage(error);
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
      :autofocus="!form.username"
      prepend-inner-icon="mdi-account-outline"
      autocomplete="username"
    />
    <v-text-field
      v-model="form.pin"
      :label="t('common.pin')"
      :type="showPin ? 'text' : 'password'"
      :rules="[required]"
      prepend-inner-icon="mdi-lock-outline"
      :aria-label="t('common.pin')"
      :autofocus="Boolean(form.username)"
      autocomplete="current-password"
    >
      <template #append-inner>
        <v-btn
          :icon="showPin ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
          variant="text"
          size="small"
          :aria-label="showPin ? 'إخفاء الرمز السري' : 'إظهار الرمز السري'"
          :aria-pressed="showPin"
          @click="showPin = !showPin"
        />
      </template>
    </v-text-field>
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
