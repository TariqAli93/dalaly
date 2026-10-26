<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppPage from "../components/app/AppPage.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import FilterBar from "../components/shared/FilterBar.vue";
import RoleDialog from "../components/admin/RoleDialog.vue";
import PermissionDialog from "../components/admin/PermissionDialog.vue";
import type {
  FilterChip,
  GridHeader,
  RowAction,
} from "../components/shared/grid";
import { getErrorMessage } from "../services/api.service";
import * as rolesService from "../services/roles.service";
import * as permissionsService from "../services/permissions.service";
import { usePermissions } from "../composables/usePermissions";
import { useConfirm } from "../composables/useConfirm";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import {
  permissionModuleLabel,
  permissionModuleOrder,
  roleLabel,
} from "../constants/permissions";
import type { PermissionRecord, RoleRecord } from "../types";

/**
 * الأدوار وصلاحياتها في لوحين متجاورين: الأدوار (Enter يفتح التعديل)
 * والصلاحيات مصفّاة بالبحث والوحدة، بأسماء الوحدات العربية. دور النظام
 * لا يُحذف ولا يُعاد تسميته.
 */
const { can } = usePermissions();
const { openConfirm } = useConfirm();
const { notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { t } = useI18n();

const roles = ref<RoleRecord[]>([]);
const permissions = ref<PermissionRecord[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const roleDialog = ref(false);
const editingRole = ref<RoleRecord | null>(null);
const permissionDialog = ref(false);
const editingPermission = ref<PermissionRecord | null>(null);

async function loadAll() {
  loading.value = true;
  error.value = null;
  try {
    const [roleRows, permissionRows] = await Promise.all([
      rolesService.listRoles(),
      permissionsService.listPermissions(),
    ]);
    roles.value = roleRows;
    permissions.value = permissionRows;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

// ─── الأدوار ─────────────────────────────────────────────────────────────
const roleHeaders: GridHeader[] = [
  { key: "name", title: t("roles.role"), sortable: true },
  { key: "permissions", title: "الصلاحيات", align: "end" },
  { key: "actions", title: "", align: "end", width: 96 },
];
function openRole(role?: RoleRecord) {
  editingRole.value = role ?? null;
  roleDialog.value = true;
}
function askDeleteRole(role: RoleRecord) {
  openConfirm({
    title: `حذف ${roleLabel(role.name)}`,
    body: `${t("roles.deleteRoleQuestion")} لا يُحذف دور مرتبط بمستخدمين؛ انقلهم إلى دور آخر أولاً.`,
    confirmText: t("common.delete"),
    color: "error",
    onConfirm: async () => {
      await rolesService.deleteRole(role.id);
      await loadAll();
      notifySuccess("تم حذف الدور.");
    },
  });
}
function roleActions(role: RoleRecord): RowAction[] {
  const actions: RowAction[] = [];
  if (can("roles.update"))
    actions.push({
      key: "edit",
      label: "تعديل الدور وصلاحياته",
      icon: "mdi-pencil-outline",
      inline: true,
      run: () => openRole(role),
    });
  if (can("roles.delete") && !role.is_system)
    actions.push({
      key: "delete",
      label: "حذف",
      icon: "mdi-delete-outline",
      danger: true,
      run: () => askDeleteRole(role),
    });
  return actions;
}

// ─── الصلاحيات ───────────────────────────────────────────────────────────
const search = ref("");
const moduleFilter = ref<string | null>(null);
// الوحدات الموجودة فعلاً، بأسمائها العربية وترتيب العمل.
const moduleItems = computed(() => {
  const labels = new Map<string, number>();
  for (const permission of permissions.value)
    labels.set(
      permissionModuleLabel(permission.module),
      permissionModuleOrder(permission.module),
    );
  return [...labels.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([title]) => title);
});
const visiblePermissions = computed(() => {
  const q = search.value.trim();
  return permissions.value
    .filter(
      (permission) =>
        (!moduleFilter.value ||
          permissionModuleLabel(permission.module) === moduleFilter.value) &&
        (!q || permission.name.includes(q) || permission.key.includes(q)),
    )
    .sort(
      (a, b) =>
        permissionModuleOrder(a.module) - permissionModuleOrder(b.module),
    );
});
const permissionChips = computed<FilterChip[]>(() => [
  ...(search.value ? [{ key: "q", label: `بحث: ${search.value}` }] : []),
  ...(moduleFilter.value ? [{ key: "module", label: moduleFilter.value }] : []),
]);
function removePermissionChip(key: string) {
  if (key === "q") search.value = "";
  else moduleFilter.value = null;
}
function clearPermissionFilters() {
  search.value = "";
  moduleFilter.value = null;
}
const permissionHeaders: GridHeader[] = [
  { key: "name", title: "الصلاحية", sortable: true },
  { key: "module", title: t("roles.module") },
  { key: "actions", title: "", align: "end", width: 96 },
];
function openPermission(permission?: PermissionRecord) {
  editingPermission.value = permission ?? null;
  permissionDialog.value = true;
}
function askDeletePermission(permission: PermissionRecord) {
  openConfirm({
    title: `حذف صلاحية «${permission.name}»`,
    body: `${t("roles.deletePermissionQuestion")} تُنزع من كل الأدوار التي تحملها.`,
    confirmText: t("common.delete"),
    color: "error",
    onConfirm: async () => {
      await permissionsService.deletePermission(permission.id);
      await loadAll();
      notifySuccess("تم حذف الصلاحية.");
    },
  });
}
function permissionActions(permission: PermissionRecord): RowAction[] {
  const actions: RowAction[] = [];
  if (can("roles.update"))
    actions.push({
      key: "edit",
      label: "تعديل",
      icon: "mdi-pencil-outline",
      inline: true,
      run: () => openPermission(permission),
    });
  if (can("roles.delete"))
    actions.push({
      key: "delete",
      label: "حذف",
      icon: "mdi-delete-outline",
      danger: true,
      run: () => askDeletePermission(permission),
    });
  return actions;
}

onMounted(() => {
  setRefreshHandler(loadAll);
  void loadAll();
});
</script>

<template>
  <AppPage
    :title="t('roles.title')"
    :count="loading && !roles.length ? null : roles.length"
  >
    <template #header-actions>
      <v-btn
        v-if="can('roles.create')"
        color="primary"
        prepend-icon="mdi-shield-plus-outline"
        @click="openRole()"
        >{{ t("roles.addRole") }}</v-btn
      >
    </template>

    <div class="roles-layout dal-fill">
      <section
        class="dal-panel dal-listpanel"
        aria-labelledby="roles-panel-title"
      >
        <div class="dal-panel__header">
          <h2 id="roles-panel-title" class="dal-section-title">الأدوار</h2>
        </div>
        <DataGrid
          grid-key="roles"
          table-label="جدول الأدوار"
          :items="roles"
          :headers="roleHeaders"
          :loading="loading"
          :error="error"
          :actions="roleActions"
          :row-label="(role) => roleLabel(role.name)"
          :empty="{
            icon: 'mdi-shield-account-outline',
            title: 'لا توجد أدوار',
          }"
          compact
          @open="can('roles.update') && openRole($event)"
          @retry="loadAll"
        >
          <template #item.name="{ item }">
            <div class="dal-cell-name">
              <strong
                >{{ roleLabel(item.name) }}
                <v-chip
                  v-if="item.is_system"
                  size="x-small"
                  variant="tonal"
                  label
                  class="ms-1"
                  >{{ t("roles.system") }}</v-chip
                ></strong
              >
              <small>{{
                item.description || t("common.withoutDescription")
              }}</small>
            </div>
          </template>
          <template #item.permissions="{ item }">
            <span class="money">{{ item.permission_ids.length }}</span>
          </template>
        </DataGrid>
      </section>

      <section
        class="dal-panel dal-listpanel"
        aria-labelledby="permissions-panel-title"
      >
        <div class="dal-panel__header">
          <h2 id="permissions-panel-title" class="dal-section-title">
            الصلاحيات
          </h2>
          <span class="dal-count">{{ permissions.length }}</span>
          <v-spacer />
          <v-btn
            v-if="can('roles.create')"
            size="small"
            variant="tonal"
            prepend-icon="mdi-key-plus"
            @click="openPermission()"
            >{{ t("roles.addPermission") }}</v-btn
          >
        </div>
        <FilterBar
          v-model:search="search"
          :filters="moduleFilter"
          search-label="بحث في الصلاحيات"
          placeholder="بحث باسم الصلاحية أو مفتاحها"
          :chips="permissionChips"
          @remove="removePermissionChip"
          @clear="clearPermissionFilters"
        >
          <template #filters>
            <v-select
              v-model="moduleFilter"
              :items="moduleItems"
              :label="t('roles.module')"
              hide-details
              clearable
              class="dal-toolbar__filter roles-layout__module"
            />
          </template>
        </FilterBar>
        <DataGrid
          grid-key="permissions"
          table-label="جدول الصلاحيات"
          :items="visiblePermissions"
          :headers="permissionHeaders"
          :loading="loading"
          :error="error"
          :has-filters="permissionChips.length > 0"
          :actions="permissionActions"
          :row-label="(permission) => permission.name"
          :empty="{ icon: 'mdi-key-outline', title: 'لا توجد صلاحيات' }"
          :no-match="{ title: 'لا توجد صلاحية مطابقة' }"
          compact
          @open="can('roles.update') && openPermission($event)"
          @retry="loadAll"
          @clear-filters="clearPermissionFilters"
        >
          <template #item.name="{ item }">
            <div class="dal-cell-name">
              <strong>{{ item.name }}</strong>
              <bdi>{{ item.key }}</bdi>
            </div>
          </template>
          <template #item.module="{ item }">{{
            permissionModuleLabel(item.module)
          }}</template>
        </DataGrid>
      </section>
    </div>

    <RoleDialog
      v-model="roleDialog"
      :role="editingRole"
      :permissions="permissions"
      @saved="loadAll"
    />
    <PermissionDialog
      v-model="permissionDialog"
      :permission="editingPermission"
      @saved="loadAll"
    />
  </AppPage>
</template>

<style scoped>
.roles-layout {
  display: grid;
  grid-template-columns: minmax(280px, 2fr) minmax(0, 3fr);
  gap: var(--dal-gutter);
}
.roles-layout > .dal-panel {
  min-height: 0;
}
.roles-layout__module {
  max-width: 220px;
}
@media (max-width: 1100px) {
  .roles-layout {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }
  .roles-layout > .dal-panel {
    max-height: 70dvh;
  }
}
</style>
