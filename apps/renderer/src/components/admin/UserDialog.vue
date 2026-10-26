<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as usersService from "../../services/users.service";
import { useApiFormErrors } from "../../composables/useApiFormErrors";
import { useSnackbar } from "../../composables/useSnackbar";
import { roleLabel } from "../../constants/permissions";
import { useDialogForm } from "./dialogForm";
import type { ManagedUserRecord, RoleRecord } from "../../types";

/**
 * إضافة مستخدم وتعديله: اسم الدخول والاسم الظاهر والرمز السري والأدوار. حفظ
 * واحد في كل مرة، ولا يُغلق الحوار بـ Esc أو بالنقر خارجه بعد أي تعديل أو
 * أثناء الحفظ. أخطاء الخادم تحت حقولها.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  user: ManagedUserRecord | null;
  roles: RoleRecord[];
}>();
const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();
const { notifySuccess, notifyError } = useSnackbar();
const apiErrors = useApiFormErrors();
const saving = ref(false);
const form = ref({
  username: "",
  display_name: "",
  pin: "",
  is_active: true,
  role_ids: [] as number[],
});
const openedWith = ref("");
const dirty = computed(
  () => open.value && JSON.stringify(form.value) !== openedWith.value,
);
const formRef = ref<{
  validate: () => Promise<{
    valid: boolean;
    errors: { id: string | number }[];
  }>;
} | null>(null);

const roleItems = computed(() =>
  props.roles.map((role) => ({ title: roleLabel(role.name), value: role.id })),
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  apiErrors.clear();
  const user = props.user;
  form.value = {
    username: user?.username ?? "",
    display_name: user?.display_name ?? "",
    pin: "",
    is_active: user?.is_active ?? true,
    role_ids: user?.role_ids ? [...user.role_ids] : [],
  };
  openedWith.value = JSON.stringify(form.value);
});

const usernameRule = (value: string) =>
  value.trim().length >= 3 || "اسم المستخدم 3 أحرف على الأقل.";
const pinRule = (value: string) => {
  const pin = value.trim();
  if (!pin) return props.user ? true : "الرمز السري مطلوب للمستخدم الجديد.";
  return (
    (pin.length >= 4 && pin.length <= 12) || "الرمز السري من 4 إلى 12 خانة."
  );
};

async function save() {
  if (saving.value) return;
  apiErrors.clear();
  const result = await formRef.value?.validate();
  if (result && !result.valid) {
    const first = result.errors[0]?.id;
    if (first !== undefined)
      document
        .querySelector<HTMLElement>(`.user-dialog [name="${first}"]`)
        ?.focus();
    return;
  }
  saving.value = true;
  try {
    if (props.user) {
      await usersService.updateUser(props.user.id, {
        ...form.value,
        pin: form.value.pin || undefined,
      });
      notifySuccess(t("users.updated"));
    } else {
      await usersService.createUser(form.value);
      notifySuccess(t("users.created"));
    }
    openedWith.value = JSON.stringify(form.value);
    open.value = false;
    emit("saved");
  } catch (error) {
    const general = apiErrors.apply(error);
    if (general) notifyError(general);
  } finally {
    saving.value = false;
  }
}

const { onKeydown } = useDialogForm(open, save);
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="620"
    scrollable
    :persistent="dirty || saving"
    aria-labelledby="user-dialog-title"
  >
    <v-card class="user-dialog" @keydown="onKeydown">
      <v-card-title id="user-dialog-title">{{
        user ? `تعديل ${user.display_name || user.username}` : t("users.add")
      }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-form ref="formRef" @submit.prevent="save">
          <div class="dialog-grid">
            <v-text-field
              v-model="form.username"
              name="username"
              :label="`${t('common.username')} *`"
              :rules="[usernameRule]"
              :error-messages="apiErrors.messages('username')"
              autocomplete="off"
              hide-details="auto"
              autofocus
            />
            <v-text-field
              v-model="form.display_name"
              name="display_name"
              :label="t('users.displayName')"
              :error-messages="apiErrors.messages('display_name')"
              hide-details="auto"
            />
            <v-text-field
              v-model="form.pin"
              name="pin"
              :label="user ? t('users.optionalNewPin') : `${t('common.pin')} *`"
              :hint="
                user ? 'اتركه فارغاً للإبقاء على الرمز الحالي.' : undefined
              "
              :persistent-hint="Boolean(user)"
              :rules="[pinRule]"
              :error-messages="apiErrors.messages('pin')"
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              hide-details="auto"
            />
            <v-switch
              v-model="form.is_active"
              :label="form.is_active ? 'الحساب مفعّل' : 'الحساب معطّل'"
              color="primary"
              hide-details
            />
            <v-select
              v-model="form.role_ids"
              :items="roleItems"
              :label="t('users.roles')"
              :error-messages="apiErrors.messages('role_ids')"
              multiple
              chips
              closable-chips
              hide-details="auto"
              class="span-2"
            />
          </div>
          <button type="submit" hidden tabindex="-1" />
        </v-form>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          prepend-icon="mdi-content-save-outline"
          title="حفظ (Ctrl+S)"
          aria-keyshortcuts="Control+S"
          @click="save"
          >حفظ</v-btn
        >
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
