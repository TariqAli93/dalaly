<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as permissionsService from "../../services/permissions.service";
import { useApiFormErrors } from "../../composables/useApiFormErrors";
import { useSnackbar } from "../../composables/useSnackbar";
import { PERMISSION_MODULES } from "../../constants/permissions";
import { useDialogForm } from "./dialogForm";
import type { PermissionRecord } from "../../types";

/**
 * إضافة صلاحية وتعديلها. المفتاح نص لاتيني يقرؤه البرنامج (properties.read
 * مثلاً) فيُكتب من اليسار؛ الوحدة تُختار باسمها العربي ويُخزَّن مفتاحها.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ permission: PermissionRecord | null }>();
const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();
const { notifySuccess, notifyError } = useSnackbar();
const apiErrors = useApiFormErrors();
const saving = ref(false);
const form = ref({ key: "", name: "", description: "", module: "" });
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

watch(open, (isOpen) => {
  if (!isOpen) return;
  apiErrors.clear();
  const permission = props.permission;
  form.value = {
    key: permission?.key ?? "",
    name: permission?.name ?? "",
    description: permission?.description ?? "",
    module: permission?.module ?? "",
  };
  openedWith.value = JSON.stringify(form.value);
});

const required = (value: string | null) =>
  Boolean(value?.trim()) || "هذا الحقل مطلوب.";

async function save() {
  if (saving.value) return;
  apiErrors.clear();
  const result = await formRef.value?.validate();
  if (result && !result.valid) {
    const first = result.errors[0]?.id;
    if (first !== undefined)
      document
        .querySelector<HTMLElement>(`.permission-dialog [name="${first}"]`)
        ?.focus();
    return;
  }
  saving.value = true;
  try {
    if (props.permission)
      await permissionsService.updatePermission(
        props.permission.id,
        form.value,
      );
    else await permissionsService.createPermission(form.value);
    openedWith.value = JSON.stringify(form.value);
    open.value = false;
    notifySuccess("تم حفظ الصلاحية.");
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
    :persistent="dirty || saving"
    aria-labelledby="permission-dialog-title"
  >
    <v-card class="permission-dialog" @keydown="onKeydown">
      <v-card-title id="permission-dialog-title">{{
        permission ? t("roles.editPermission") : t("roles.addPermission")
      }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-form ref="formRef" @submit.prevent="save">
          <div class="dialog-grid">
            <v-text-field
              v-model="form.name"
              name="name"
              label="الاسم *"
              :rules="[required]"
              :error-messages="apiErrors.messages('name')"
              hide-details="auto"
              autofocus
            />
            <v-text-field
              v-model="form.key"
              name="key"
              :label="`${t('roles.permissionKey')} *`"
              placeholder="properties.read"
              dir="ltr"
              :rules="[required]"
              :error-messages="apiErrors.messages('key')"
              hide-details="auto"
            />
            <v-combobox
              v-model="form.module"
              name="module"
              :items="PERMISSION_MODULES"
              item-title="title"
              item-value="key"
              :return-object="false"
              :label="`${t('roles.module')} *`"
              :rules="[required]"
              :error-messages="apiErrors.messages('module')"
              hide-details="auto"
            />
            <v-text-field
              v-model="form.description"
              name="description"
              label="الوصف"
              :error-messages="apiErrors.messages('description')"
              hide-details="auto"
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
