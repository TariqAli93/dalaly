<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppPage from "../components/app/AppPage.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import FilterBar from "../components/shared/FilterBar.vue";
import UserDialog from "../components/admin/UserDialog.vue";
import type {
  FilterChip,
  GridHeader,
  RowAction,
} from "../components/shared/grid";
import { getErrorMessage } from "../services/api.service";
import * as usersService from "../services/users.service";
import * as rolesService from "../services/roles.service";
import { usePermissions } from "../composables/usePermissions";
import { useConfirm } from "../composables/useConfirm";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useAuth } from "../composables/useAuth";
import { roleLabel } from "../constants/permissions";
import type { ManagedUserRecord, RoleRecord } from "../types";

/**
 * مستخدمو البرنامج في قائمة بنمط القوائم الأخرى: بحث بالاسم، وEnter يفتح
 * التعديل، والتفعيل والحذف من أوامر الصف (الحذف آخرها بعد تأكيد).
 */
const { can } = usePermissions();
const { openConfirm } = useConfirm();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { currentUser } = useAuth();
const { t } = useI18n();

const users = ref<ManagedUserRecord[]>([]);
const roles = ref<RoleRecord[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const search = ref("");
const dialog = ref(false);
const editing = ref<ManagedUserRecord | null>(null);

async function loadUsers() {
  loading.value = true;
  error.value = null;
  try {
    users.value = await usersService.listUsers();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function loadRoles() {
  try {
    roles.value = await rolesService.listRoles();
  } catch {
    // الأدوار اختيارية في هذه الشاشة: تبقى قائمة الاختيار فارغة.
  }
}

// القائمة قصيرة وكلها في الذاكرة: البحث هنا لا في الخادم.
const visible = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter((user) =>
    [user.username, user.display_name]
      .filter(Boolean)
      .some((text) => text.toLowerCase().includes(q)),
  );
});
const chips = computed<FilterChip[]>(() =>
  search.value ? [{ key: "q", label: `بحث: ${search.value}` }] : [],
);

const headers: GridHeader[] = [
  { key: "display_name", title: "المستخدم", sortable: true },
  { key: "roles", title: t("users.roles") },
  { key: "is_active", title: t("users.status"), sortable: true },
  { key: "actions", title: "", align: "end", width: 96 },
];
const nameOf = (user: ManagedUserRecord) => user.display_name || user.username;
const isSelf = (user: ManagedUserRecord) => user.id === currentUser.value?.id;

function openDialog(user?: ManagedUserRecord) {
  editing.value = user ?? null;
  dialog.value = true;
}

async function toggleActive(user: ManagedUserRecord) {
  try {
    if (user.is_active) await usersService.deactivateUser(user.id);
    else await usersService.activateUser(user.id);
    await loadUsers();
    notifySuccess(
      user.is_active ? t("users.deactivated") : t("users.activated"),
    );
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}

function askDelete(user: ManagedUserRecord) {
  openConfirm({
    title: `حذف ${nameOf(user)}`,
    body: `${t("users.deleteQuestion")} لن يستطيع الدخول بعدها، ويبقى ما سجّله في السجلات. لتمنعه مؤقتاً عطّل حسابه بدل حذفه.`,
    confirmText: t("common.delete"),
    color: "error",
    onConfirm: async () => {
      await usersService.deleteUser(user.id);
      await loadUsers();
      notifySuccess(t("users.deleted"));
    },
  });
}

function actionsOf(user: ManagedUserRecord): RowAction[] {
  const actions: RowAction[] = [];
  if (can("users.update"))
    actions.push(
      {
        key: "edit",
        label: "تعديل",
        icon: "mdi-pencil-outline",
        inline: true,
        run: () => openDialog(user),
      },
      user.is_active
        ? {
            key: "deactivate",
            label: "تعطيل الحساب",
            icon: "mdi-account-off-outline",
            run: () => void toggleActive(user),
          }
        : {
            key: "activate",
            label: "تفعيل الحساب",
            icon: "mdi-account-check-outline",
            run: () => void toggleActive(user),
          },
    );
  if (can("users.delete") && !isSelf(user))
    actions.push({
      key: "delete",
      label: "حذف",
      icon: "mdi-delete-outline",
      danger: true,
      run: () => askDelete(user),
    });
  return actions;
}

function onShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyN") return;
  if (event.altKey || event.shiftKey || !can("users.create")) return;
  if (document.querySelector(".v-overlay--active .v-dialog")) return;
  event.preventDefault();
  openDialog();
}

onMounted(() => {
  setRefreshHandler(loadUsers);
  void loadUsers();
  void loadRoles();
  window.addEventListener("keydown", onShortcut);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onShortcut));
</script>

<template>
  <AppPage
    :title="t('users.title')"
    :count="loading && !users.length ? null : users.length"
  >
    <template #header-actions>
      <v-btn
        v-if="can('users.create')"
        color="primary"
        prepend-icon="mdi-account-plus-outline"
        :title="`${t('users.add')} (Ctrl+N)`"
        aria-keyshortcuts="Control+N"
        @click="openDialog()"
        >{{ t("users.add") }}</v-btn
      >
    </template>

    <section
      class="dal-panel dal-listpanel dal-fill"
      :aria-label="t('users.title')"
    >
      <FilterBar
        v-model:search="search"
        search-label="بحث في المستخدمين"
        placeholder="بحث باسم الدخول أو الاسم الظاهر"
        :chips="chips"
        @remove="search = ''"
        @clear="search = ''"
      />
      <DataGrid
        grid-key="users"
        :table-label="`جدول ${t('users.title')}`"
        :items="visible"
        :headers="headers"
        :loading="loading"
        :error="error"
        :has-filters="Boolean(search)"
        :actions="actionsOf"
        :row-label="nameOf"
        :empty="{
          icon: 'mdi-account-group-outline',
          title: t('users.empty'),
          text: 'أضف حساباً لكل موظف، وامنحه الأدوار التي يحتاجها عمله.',
        }"
        :no-match="{ title: 'لا يوجد مستخدم بهذا الاسم' }"
        compact
        @open="can('users.update') && openDialog($event)"
        @retry="loadUsers"
        @clear-filters="search = ''"
      >
        <template #item.display_name="{ item }">
          <div class="dal-cell-name">
            <strong
              >{{ nameOf(item) }}
              <span v-if="isSelf(item)" class="users__self">(أنت)</span></strong
            >
            <bdi v-if="item.display_name">{{ item.username }}</bdi>
          </div>
        </template>
        <template #item.roles="{ item }">
          <div class="users__roles">
            <v-chip
              v-for="role in item.roles"
              :key="role.id"
              size="small"
              variant="tonal"
              label
              >{{ roleLabel(role.name) }}</v-chip
            >
            <span v-if="!item.roles.length" class="text-medium-emphasis"
              >بلا دور</span
            >
          </div>
        </template>
        <template #item.is_active="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="item.is_active ? 'success' : undefined"
            >{{
              item.is_active ? t("common.active") : t("common.inactive")
            }}</v-chip
          >
        </template>
        <template #empty-actions>
          <v-btn
            v-if="can('users.create')"
            color="primary"
            prepend-icon="mdi-account-plus-outline"
            @click="openDialog()"
            >{{ t("users.add") }}</v-btn
          >
        </template>
      </DataGrid>
    </section>

    <UserDialog
      v-model="dialog"
      :user="editing"
      :roles="roles"
      @saved="loadUsers"
    />
  </AppPage>
</template>

<style scoped>
.users__roles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.users__self {
  font-weight: 400;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
</style>
