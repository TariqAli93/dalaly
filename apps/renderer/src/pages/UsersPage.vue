<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import { getErrorMessage } from "../services/api.service";
import * as usersService from "../services/users.service";
import * as rolesService from "../services/roles.service";
import { usePermissions } from "../composables/usePermissions";
import { useConfirm } from "../composables/useConfirm";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import type { ManagedUserRecord, RoleRecord } from "../types";

const { can } = usePermissions();
const { openConfirm } = useConfirm();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();

const users = ref<ManagedUserRecord[]>([]);
const roles = ref<RoleRecord[]>([]);
const dialog = ref(false);
const editingId = ref<number | null>(null);
const form = ref({
  username: "",
  display_name: "",
  pin: "",
  is_active: true,
  role_ids: [] as number[],
});

async function loadUsers() {
  try {
    users.value = await usersService.listUsers();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function loadRoles() {
  try {
    roles.value = await rolesService.listRoles();
  } catch {
    // الأدوار اختيارية في هذه الشاشة
  }
}

function openDialog(user?: ManagedUserRecord) {
  editingId.value = user?.id ?? null;
  form.value = {
    username: user?.username ?? "",
    display_name: user?.display_name ?? "",
    pin: "",
    is_active: user?.is_active ?? true,
    role_ids: user?.role_ids ? [...user.role_ids] : [],
  };
  dialog.value = true;
}

async function save() {
  try {
    if (editingId.value !== null) {
      await usersService.updateUser(editingId.value, {
        ...form.value,
        pin: form.value.pin || undefined,
      });
      notifySuccess("تم تحديث المستخدم.");
    } else {
      await usersService.createUser(form.value);
      notifySuccess("تم إنشاء المستخدم.");
    }
    dialog.value = false;
    await loadUsers();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function toggleActive(user: ManagedUserRecord) {
  try {
    if (user.is_active) {
      await usersService.deactivateUser(user.id);
    } else {
      await usersService.activateUser(user.id);
    }
    await loadUsers();
    notifySuccess(user.is_active ? "تم تعطيل المستخدم." : "تم تفعيل المستخدم.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDelete(user: ManagedUserRecord) {
  openConfirm({
    title: `حذف ${user.username}`,
    body: "هل تريد حذف هذا المستخدم؟",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await usersService.deleteUser(user.id);
      await loadUsers();
      notifySuccess("تم حذف المستخدم.");
    },
  });
}

onMounted(() => {
  setRefreshHandler(loadUsers);
  void loadUsers();
  void loadRoles();
});
</script>

<template>
  <AppLayout title="المستخدمون">
    <v-card variant="flat" border>
      <v-card-title class="d-flex align-center">
        <span>إدارة المستخدمين</span>
        <v-spacer />
        <v-btn
          v-if="can('users.create')"
          color="primary"
          prepend-icon="mdi-account-plus"
          @click="openDialog()"
        >
          إضافة مستخدم
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-empty-state
          v-if="!users.length"
          icon="mdi-account-group-outline"
          title="لا توجد مستخدمون"
        />
        <v-table v-else density="comfortable">
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>الاسم</th>
              <th>الأدوار</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.username }}</td>
              <td>{{ user.display_name }}</td>
              <td>
                <v-chip
                  v-for="role in user.roles"
                  :key="role.id"
                  class="ma-1"
                  variant="tonal"
                >
                  {{ role.name }}
                </v-chip>
              </td>
              <td>
                <v-chip
                  :color="user.is_active ? 'success' : undefined"
                  variant="tonal"
                >
                  {{ user.is_active ? "فعال" : "معطل" }}
                </v-chip>
              </td>
              <td class="text-end">
                <v-btn
                  v-if="can('users.update')"
                  icon="mdi-pencil"
                  variant="text"
                  @click="openDialog(user)"
                />
                <v-btn
                  v-if="can('users.update')"
                  :icon="
                    user.is_active
                      ? 'mdi-account-off-outline'
                      : 'mdi-account-check-outline'
                  "
                  variant="text"
                  @click="toggleActive(user)"
                />
                <v-btn
                  v-if="can('users.delete')"
                  icon="mdi-delete-outline"
                  color="error"
                  variant="text"
                  @click="askDelete(user)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="dialog" width="620">
      <v-card>
        <v-card-title>
          {{ editingId ? "تعديل مستخدم" : "إضافة مستخدم" }}
        </v-card-title>
        <v-card-text>
          <div class="dialog-grid">
            <v-text-field v-model="form.username" label="Username" />
            <v-text-field v-model="form.display_name" label="الاسم الظاهر" />
            <v-text-field
              v-model="form.pin"
              :label="editingId ? 'PIN جديد اختياري' : 'PIN'"
              type="password"
            />
            <v-switch
              v-model="form.is_active"
              label="فعال"
              color="primary"
              hide-details
            />
            <v-select
              v-model="form.role_ids"
              :items="roles"
              item-title="name"
              item-value="id"
              label="الأدوار"
              multiple
              chips
              class="span-2"
            />
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="flat" @click="save">حفظ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppLayout>
</template>
