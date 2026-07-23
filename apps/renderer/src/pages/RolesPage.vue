<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import { getErrorMessage } from "../services/api.service";
import * as rolesService from "../services/roles.service";
import * as permissionsService from "../services/permissions.service";
import { usePermissions } from "../composables/usePermissions";
import { useConfirm } from "../composables/useConfirm";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import type { PermissionRecord, RoleRecord } from "../types";

const { can } = usePermissions();
const { openConfirm } = useConfirm();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();

const roles = ref<RoleRecord[]>([]);
const permissions = ref<PermissionRecord[]>([]);

const roleDialog = ref(false);
const editingRoleId = ref<number | null>(null);
const roleForm = ref({
  name: "",
  description: "",
  permission_ids: [] as number[],
});

const permissionDialog = ref(false);
const editingPermissionId = ref<number | null>(null);
const permissionForm = ref({ key: "", name: "", description: "", module: "" });

const permissionsByModule = computed(() => {
  const groups = new Map<string, PermissionRecord[]>();
  for (const permission of permissions.value) {
    const group = groups.get(permission.module) ?? [];
    group.push(permission);
    groups.set(permission.module, group);
  }
  return [...groups.entries()].map(([module, items]) => ({ module, items }));
});

async function loadAll() {
  try {
    const [roleRows, permissionRows] = await Promise.all([
      rolesService.listRoles(),
      permissionsService.listPermissions(),
    ]);
    roles.value = roleRows;
    permissions.value = permissionRows;
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function openRoleDialog(role?: RoleRecord) {
  editingRoleId.value = role?.id ?? null;
  roleForm.value = {
    name: role?.name ?? "",
    description: role?.description ?? "",
    permission_ids: role?.permission_ids ? [...role.permission_ids] : [],
  };
  roleDialog.value = true;
}

async function saveRole() {
  try {
    const payload = {
      name: roleForm.value.name,
      description: roleForm.value.description,
    };
    const role =
      editingRoleId.value !== null
        ? await rolesService.updateRole(editingRoleId.value, payload)
        : await rolesService.createRole(payload);
    await rolesService.updateRolePermissions(
      role.id,
      roleForm.value.permission_ids,
    );
    roleDialog.value = false;
    await loadAll();
    notifySuccess("تم حفظ الدور والصلاحيات.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDeleteRole(role: RoleRecord) {
  openConfirm({
    title: `حذف ${role.name}`,
    body: "هل تريد حذف هذا الدور؟",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await rolesService.deleteRole(role.id);
      await loadAll();
      notifySuccess("تم حذف الدور.");
    },
  });
}

function openPermissionDialog(permission?: PermissionRecord) {
  editingPermissionId.value = permission?.id ?? null;
  permissionForm.value = {
    key: permission?.key ?? "",
    name: permission?.name ?? "",
    description: permission?.description ?? "",
    module: permission?.module ?? "",
  };
  permissionDialog.value = true;
}

async function savePermission() {
  try {
    if (editingPermissionId.value !== null) {
      await permissionsService.updatePermission(
        editingPermissionId.value,
        permissionForm.value,
      );
    } else {
      await permissionsService.createPermission(permissionForm.value);
    }
    permissionDialog.value = false;
    await loadAll();
    notifySuccess("تم حفظ الصلاحية.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDeletePermission(permission: PermissionRecord) {
  openConfirm({
    title: `حذف ${permission.key}`,
    body: "هل تريد حذف هذه الصلاحية؟",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await permissionsService.deletePermission(permission.id);
      await loadAll();
      notifySuccess("تم حذف الصلاحية.");
    },
  });
}

onMounted(() => {
  setRefreshHandler(loadAll);
  void loadAll();
});
</script>

<template>
  <AppLayout title="الأدوار والصلاحيات">
    <div class="flex flex-col gap-4">
      <v-card variant="flat" border>
        <v-card-title class="d-flex align-center">
          <span>الأدوار</span>
          <v-spacer />
          <v-btn
            v-if="can('roles.create')"
            color="primary"
            prepend-icon="mdi-shield-plus-outline"
            @click="openRoleDialog()"
          >
            إضافة Role
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-list lines="two">
            <v-list-item
              v-for="role in roles"
              :key="role.id"
              :title="role.name"
              :subtitle="role.description || 'بدون وصف'"
            >
              <template #append>
                <v-chip v-if="role.is_system" class="me-2" variant="tonal">
                  System
                </v-chip>
                <v-btn
                  v-if="can('roles.update')"
                  icon="mdi-pencil"
                  variant="text"
                  @click="openRoleDialog(role)"
                />
                <v-btn
                  v-if="can('roles.delete') && !role.is_system"
                  icon="mdi-delete-outline"
                  color="error"
                  variant="text"
                  @click="askDeleteRole(role)"
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>

      <v-card variant="flat" border>
        <v-card-title class="d-flex align-center">
          <span>الصلاحيات</span>
          <v-spacer />
          <v-btn
            v-if="can('roles.create')"
            variant="tonal"
            prepend-icon="mdi-key-plus"
            @click="openPermissionDialog()"
          >
            إضافة صلاحية
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-expansion-panels variant="accordion">
            <v-expansion-panel
              v-for="group in permissionsByModule"
              :key="group.module"
            >
              <v-expansion-panel-title>{{
                group.module
              }}</v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-list density="compact">
                  <v-list-item
                    v-for="permission in group.items"
                    :key="permission.id"
                    :title="permission.name"
                    :subtitle="permission.key"
                  >
                    <template #append>
                      <v-btn
                        v-if="can('roles.update')"
                        icon="mdi-pencil"
                        variant="text"
                        @click="openPermissionDialog(permission)"
                      />
                      <v-btn
                        v-if="can('roles.delete')"
                        icon="mdi-delete-outline"
                        color="error"
                        variant="text"
                        @click="askDeletePermission(permission)"
                      />
                    </template>
                  </v-list-item>
                </v-list>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
      </v-card>
    </div>

    <v-dialog v-model="roleDialog" width="760">
      <v-card>
        <v-card-title>{{
          editingRoleId ? "تعديل Role" : "إضافة Role"
        }}</v-card-title>
        <v-card-text>
          <div class="dialog-grid">
            <v-text-field v-model="roleForm.name" label="اسم الدور" />
            <v-text-field v-model="roleForm.description" label="الوصف" />
          </div>
          <v-divider class="my-4" />
          <div class="text-subtitle-2 mb-2">الصلاحيات</div>
          <v-expansion-panels variant="accordion">
            <v-expansion-panel
              v-for="group in permissionsByModule"
              :key="group.module"
            >
              <v-expansion-panel-title>{{
                group.module
              }}</v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-checkbox
                  v-for="permission in group.items"
                  :key="permission.id"
                  v-model="roleForm.permission_ids"
                  :value="permission.id"
                  :label="`${permission.name} (${permission.key})`"
                  density="compact"
                  hide-details
                />
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="roleDialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="flat" @click="saveRole">حفظ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="permissionDialog" width="620">
      <v-card>
        <v-card-title>
          {{ editingPermissionId ? "تعديل صلاحية" : "إضافة صلاحية" }}
        </v-card-title>
        <v-card-text>
          <div class="dialog-grid">
            <v-text-field v-model="permissionForm.key" label="Permission Key" />
            <v-text-field v-model="permissionForm.name" label="الاسم" />
            <v-text-field v-model="permissionForm.module" label="Module" />
            <v-text-field v-model="permissionForm.description" label="الوصف" />
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="permissionDialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="flat" @click="savePermission"
            >حفظ</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppLayout>
</template>
