<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as rolesService from "../../services/roles.service";
import { useApiFormErrors } from "../../composables/useApiFormErrors";
import { useSnackbar } from "../../composables/useSnackbar";
import {
  permissionModuleLabel,
  permissionModuleOrder,
  roleLabel,
} from "../../constants/permissions";
import { useDialogForm } from "./dialogForm";
import type { PermissionRecord, RoleRecord } from "../../types";

/**
 * إضافة دور وتعديله مع صلاحياته في حفظ واحد: الاسم والوصف ثم الصلاحيات
 * مجموعاتٍ بأسماء عربية، ولكل مجموعة «تحديد الكل». اسم دور النظام ثابت
 * (الخادم يعرف مدير النظام باسمه المخزَّن)، فيُعرض للقراءة فقط.
 * إن حُفظ الدور وتعذّر حفظ صلاحياته، يصير الحوار حوار تعديله: إعادة المحاولة
 * تحدّثه ولا تُنشئ دوراً ثانياً.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  role: RoleRecord | null;
  permissions: PermissionRecord[];
}>();
const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();
const { notifySuccess, notifyError } = useSnackbar();
const apiErrors = useApiFormErrors();
const saving = ref(false);
const filter = ref("");
const saved = ref<RoleRecord | null>(null);
const current = computed(() => saved.value ?? props.role);
const form = ref({ name: "", description: "", permission_ids: [] as number[] });
const openedWith = ref("");
const dirty = computed(
  () => open.value && JSON.stringify(form.value) !== openedWith.value,
);
const formRef = ref<{
  validate: () => Promise<{ valid: boolean }>;
} | null>(null);

watch(open, (isOpen) => {
  if (!isOpen) return;
  saved.value = null;
  filter.value = "";
  apiErrors.clear();
  form.value = {
    name: props.role?.name ?? "",
    description: props.role?.description ?? "",
    permission_ids: props.role?.permission_ids
      ? [...props.role.permission_ids]
      : [],
  };
  openedWith.value = JSON.stringify(form.value);
});

const groups = computed(() => {
  const q = filter.value.trim();
  const byLabel = new Map<
    string,
    { order: number; items: PermissionRecord[] }
  >();
  for (const permission of props.permissions) {
    if (q && !permission.name.includes(q) && !permission.key.includes(q))
      continue;
    const label = permissionModuleLabel(permission.module);
    const group = byLabel.get(label) ?? {
      order: permissionModuleOrder(permission.module),
      items: [],
    };
    group.items.push(permission);
    byLabel.set(label, group);
  }
  return [...byLabel.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([title, group]) => ({ title, items: group.items }));
});
const selected = computed(() => new Set(form.value.permission_ids));

function groupState(items: PermissionRecord[]) {
  const count = items.filter((item) => selected.value.has(item.id)).length;
  return { all: count === items.length, some: count > 0, count };
}
function toggleGroup(items: PermissionRecord[]) {
  const ids = items.map((item) => item.id);
  const next = new Set(form.value.permission_ids);
  if (groupState(items).all) ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  form.value.permission_ids = [...next];
}

const nameRule = (value: string) =>
  value.trim().length > 0 || "اسم الدور مطلوب.";

async function save() {
  if (saving.value) return;
  apiErrors.clear();
  if (!(await formRef.value?.validate())?.valid) {
    document.querySelector<HTMLElement>('.role-dialog [name="name"]')?.focus();
    return;
  }
  saving.value = true;
  try {
    const payload = {
      name: form.value.name.trim(),
      description: form.value.description,
    };
    const role = current.value
      ? await rolesService.updateRole(current.value.id, payload)
      : await rolesService.createRole(payload);
    saved.value = role;
    await rolesService.updateRolePermissions(
      role.id,
      form.value.permission_ids,
    );
    openedWith.value = JSON.stringify(form.value);
    open.value = false;
    notifySuccess("تم حفظ الدور والصلاحيات.");
    emit("saved");
  } catch (error) {
    const general = apiErrors.apply(error);
    if (general)
      notifyError(
        saved.value && !props.role
          ? `حُفظ الدور وتعذّر حفظ صلاحياته: ${general}`
          : general,
      );
  } finally {
    saving.value = false;
  }
}

const { onKeydown } = useDialogForm(open, save);
const title = computed(() =>
  current.value
    ? `${t("roles.editRole")}: ${roleLabel(current.value.name)}`
    : t("roles.addRole"),
);
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="820"
    scrollable
    :persistent="dirty || saving"
    aria-labelledby="role-dialog-title"
  >
    <v-card class="role-dialog" @keydown="onKeydown">
      <v-card-title id="role-dialog-title">{{ title }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-form ref="formRef" @submit.prevent="save">
          <div class="dialog-grid">
            <v-text-field
              v-if="current?.is_system"
              :model-value="roleLabel(form.name)"
              label="اسم الدور"
              hint="اسم دور النظام ثابت."
              persistent-hint
              readonly
            />
            <v-text-field
              v-else
              v-model="form.name"
              name="name"
              label="اسم الدور *"
              :rules="[nameRule]"
              :error-messages="apiErrors.messages('name')"
              hide-details="auto"
              autofocus
            />
            <v-text-field
              v-model="form.description"
              name="description"
              label="الوصف"
              :error-messages="apiErrors.messages('description')"
              hide-details="auto"
            />
          </div>

          <div class="role-dialog__head">
            <h3 class="dal-section-title">الصلاحيات</h3>
            <span class="dal-count"
              >{{ form.permission_ids.length }} من
              {{ permissions.length }}</span
            >
            <v-spacer />
            <v-text-field
              v-model="filter"
              class="role-dialog__filter"
              prepend-inner-icon="mdi-magnify"
              placeholder="ابحث عن صلاحية"
              aria-label="ابحث عن صلاحية"
              hide-details
              clearable
            />
          </div>
          <p v-if="!groups.length" class="role-dialog__empty">
            لا توجد صلاحية بهذا الاسم.
          </p>
          <div class="role-dialog__groups">
            <fieldset
              v-for="group in groups"
              :key="group.title"
              class="role-dialog__group"
            >
              <legend>
                <v-checkbox
                  :model-value="groupState(group.items).all"
                  :indeterminate="
                    groupState(group.items).some && !groupState(group.items).all
                  "
                  :label="`${group.title} (${groupState(group.items).count}/${group.items.length})`"
                  :aria-label="`تحديد كل صلاحيات ${group.title}`"
                  density="compact"
                  hide-details
                  class="role-dialog__group-toggle"
                  @update:model-value="toggleGroup(group.items)"
                />
              </legend>
              <v-checkbox
                v-for="permission in group.items"
                :key="permission.id"
                v-model="form.permission_ids"
                :value="permission.id"
                :label="permission.name"
                :title="permission.key"
                density="compact"
                hide-details
              />
            </fieldset>
          </div>
          <button type="submit" hidden tabindex="-1" />
        </v-form>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <span v-if="dirty" class="role-dialog__state" role="status">
          <v-icon
            icon="mdi-circle"
            size="8"
            color="warning"
            aria-hidden="true"
          />
          تعديلات غير محفوظة
        </span>
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

<style scoped>
.role-dialog__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0 8px;
}
.role-dialog__head h3 {
  margin: 0;
}
.role-dialog__filter {
  flex: 0 1 240px;
}
.role-dialog__empty {
  margin: 0;
  padding: 12px 0;
  color: var(--dal-muted);
}
.role-dialog__groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}
.role-dialog__group {
  margin: 0;
  padding: 4px 8px 8px;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
  min-width: 0;
}
.role-dialog__group legend {
  padding: 0 4px;
}
.role-dialog__group-toggle :deep(.v-label) {
  font-weight: 700;
  opacity: 1;
}
.role-dialog__state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
@media (max-width: 760px) {
  .role-dialog__groups {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
