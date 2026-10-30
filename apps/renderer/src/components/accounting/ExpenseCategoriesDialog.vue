<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import * as cashService from "../../services/cash.service";
import * as accountingService from "../../services/accounting.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import type {
  AccountRecord,
  Currency,
  ExpenseCategoryPayload,
  ExpenseCategoryRecord,
} from "../../types";

/**
 * تصنيفات المصروفات: لكل تصنيف حساب المصروف الذي يُقيَّد عليه بكل عملة.
 * سند الصرف بغرض «مصروف» يختار تصنيفه فيُرحَّل إلى حسابه. التصنيف لا يُحذف؛
 * يُوقف فيختفي من الاختيار.
 */
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ changed: [] }>();
const { can } = usePermissions();
const { notifySuccess } = useSnackbar();

const categories = ref<ExpenseCategoryRecord[]>([]);
const chart = ref<AccountRecord[]>([]);
const error = ref("");
const saving = ref(false);
let opener: HTMLElement | null = null;

const editing = ref<ExpenseCategoryRecord | null>(null);
const form = ref({
  name: "",
  iqd_account_id: null as number | null,
  usd_account_id: null as number | null,
  is_active: true,
});
const showForm = ref(false);
const canEdit = computed(() => can("expenses.manage"));

const expenseAccounts = (currency: Currency) =>
  chart.value
    .filter(
      (account) =>
        account.account_type === "expense" &&
        account.is_postable &&
        account.is_active &&
        account.currency === currency,
    )
    .map((account) => ({
      value: account.id,
      title: `${account.code} — ${account.name}`,
    }));
const iqdOptions = computed(() => expenseAccounts("IQD"));
const usdOptions = computed(() => expenseAccounts("USD"));

async function load() {
  error.value = "";
  try {
    const [rows, accounts] = await Promise.all([
      cashService.listExpenseCategories(),
      canEdit.value && can("accounting.read")
        ? accountingService.listAccounts()
        : Promise.resolve([]),
    ]);
    categories.value = rows;
    chart.value = accounts;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  }
}

watch(open, (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  showForm.value = false;
  void load();
});

function startNew() {
  editing.value = null;
  form.value = {
    name: "",
    iqd_account_id:
      chart.value.find(
        (account) => account.system_key === "operating_expenses.IQD",
      )?.id ?? null,
    usd_account_id:
      chart.value.find(
        (account) => account.system_key === "operating_expenses.USD",
      )?.id ?? null,
    is_active: true,
  };
  showForm.value = true;
}
function startEdit(category: ExpenseCategoryRecord) {
  editing.value = category;
  form.value = {
    name: category.name,
    iqd_account_id: category.iqd_account_id,
    usd_account_id: category.usd_account_id,
    is_active: category.is_active,
  };
  showForm.value = true;
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  error.value = "";
  const payload: ExpenseCategoryPayload = {
    name: form.value.name.trim(),
    iqd_account_id: form.value.iqd_account_id,
    usd_account_id: form.value.usd_account_id,
    is_active: form.value.is_active,
  };
  try {
    if (editing.value)
      await cashService.updateExpenseCategory(editing.value.id, payload);
    else await cashService.createExpenseCategory(payload);
    notifySuccess(`حُفظ التصنيف ${payload.name}.`);
    showForm.value = false;
    await load();
    emit("changed");
  } catch (cause) {
    const issues = (cause as { issues?: Array<{ message: string }> })?.issues;
    error.value = issues?.length
      ? issues.map((issue) => issue.message).join(" ")
      : getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}

const accountLabel = (code: string | null, name: string | null) =>
  code ? `${code} — ${name}` : "—";
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="720"
    scrollable
    aria-labelledby="categories-dialog-title"
  >
    <v-card>
      <v-card-title id="categories-dialog-title"
        >تصنيفات المصروفات</v-card-title
      >
      <v-divider />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <form v-if="showForm" class="category-form" @submit.prevent="save">
          <v-text-field
            v-model="form.name"
            label="اسم التصنيف *"
            hide-details="auto"
          />
          <v-switch
            v-if="editing"
            v-model="form.is_active"
            label="فعّال"
            color="primary"
            hide-details
          />
          <v-autocomplete
            v-model="form.iqd_account_id"
            :items="iqdOptions"
            label="حساب المصروف بالدينار"
            clearable
            hide-details="auto"
          />
          <v-autocomplete
            v-model="form.usd_account_id"
            :items="usdOptions"
            label="حساب المصروف بالدولار"
            clearable
            hide-details="auto"
          />
          <div class="category-form__actions">
            <v-btn variant="text" :disabled="saving" @click="showForm = false"
              >إلغاء</v-btn
            >
            <v-btn
              color="primary"
              variant="flat"
              type="submit"
              :loading="saving"
              >حفظ</v-btn
            >
          </div>
        </form>
        <v-table v-else density="compact">
          <thead>
            <tr>
              <th scope="col">التصنيف</th>
              <th scope="col">بالدينار</th>
              <th scope="col">بالدولار</th>
              <th scope="col"><span class="d-sr-only">تعديل</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="category in categories"
              :key="category.id"
              :class="{ 'text-medium-emphasis': !category.is_active }"
            >
              <td>
                {{ category.name }}
                <v-chip
                  v-if="!category.is_active"
                  size="x-small"
                  label
                  variant="tonal"
                  >موقوف</v-chip
                >
              </td>
              <td>
                <bdi>{{
                  accountLabel(
                    category.iqd_account_code,
                    category.iqd_account_name,
                  )
                }}</bdi>
              </td>
              <td>
                <bdi>{{
                  accountLabel(
                    category.usd_account_code,
                    category.usd_account_name,
                  )
                }}</bdi>
              </td>
              <td class="text-end">
                <v-btn
                  v-if="canEdit && can('accounting.read')"
                  icon="mdi-pencil-outline"
                  size="small"
                  variant="text"
                  :aria-label="`تعديل ${category.name}`"
                  @click="startEdit(category)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-btn
          v-if="canEdit && can('accounting.read') && !showForm"
          variant="tonal"
          prepend-icon="mdi-plus"
          @click="startNew"
          >تصنيف جديد</v-btn
        >
        <v-spacer />
        <v-btn variant="text" @click="open = false">إغلاق</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.category-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.category-form__actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
