<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppPage from "../components/app/AppPage.vue";
import AccountDialog from "../components/accounting/AccountDialog.vue";
import * as accountingService from "../services/accounting.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import {
  ACCOUNT_CURRENCIES,
  accountCurrencyLabel,
  accountTypeLabel,
} from "../constants/accounting";
import type { AccountRecord, Currency } from "../types";

/**
 * دليل الحسابات: شجرة الحسابات الرئيسية وحسابات الترحيل تحتها. لكل حساب
 * ترحيل عملة واحدة، ولا تحويل بين الدينار والدولار. حسابات الدليل الأساسي
 * يعتمد عليها النظام (الصندوق، أمانات العملاء، العمولات…) فيُعدَّل اسمها فقط.
 */
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifySuccess } = useSnackbar();

const accounts = ref<AccountRecord[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const search = ref("");
const currency = ref<Currency | null>(null);
const showInactive = ref(false);
const collapsed = ref(new Set<number>());

async function load() {
  loading.value = true;
  error.value = null;
  try {
    accounts.value = await accountingService.listAccounts();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

const childrenOf = computed(() => {
  const map = new Map<number | null, AccountRecord[]>();
  for (const account of accounts.value)
    map.set(account.parent_id, [
      ...(map.get(account.parent_id) ?? []),
      account,
    ]);
  return map;
});

/** Accounts that pass the filters, with every heading above them. */
const visibleIds = computed(() => {
  const term = search.value.trim();
  const byId = new Map(accounts.value.map((account) => [account.id, account]));
  const ids = new Set<number>();
  for (const account of accounts.value) {
    if (!showInactive.value && !account.is_active) continue;
    // A currency shows its posting accounts; headings come as their parents.
    if (
      currency.value &&
      (!account.is_postable || account.currency !== currency.value)
    )
      continue;
    if (term && !account.code.startsWith(term) && !account.name.includes(term))
      continue;
    for (
      let current: AccountRecord | undefined = account;
      current && !ids.has(current.id);
      current =
        current.parent_id === null ? undefined : byId.get(current.parent_id)
    )
      ids.add(current.id);
  }
  return ids;
});

type Row = { account: AccountRecord; depth: number; hasChildren: boolean };
const rows = computed(() => {
  const out: Row[] = [];
  const filtering = Boolean(search.value.trim());
  const walk = (parentId: number | null, depth: number) => {
    for (const account of childrenOf.value.get(parentId) ?? []) {
      if (!visibleIds.value.has(account.id)) continue;
      const hasChildren = Boolean(childrenOf.value.get(account.id)?.length);
      out.push({ account, depth, hasChildren });
      if (filtering || !collapsed.value.has(account.id))
        walk(account.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
});

function toggle(id: number) {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

// ─── الحوار ────────────────────────────────────────────────────────────
const dialog = ref(false);
const editing = ref<AccountRecord | null>(null);
const parentForNew = ref<AccountRecord | null>(null);
function openNew(parent: AccountRecord | null = null) {
  editing.value = null;
  parentForNew.value = parent;
  dialog.value = true;
}
function openEdit(account: AccountRecord) {
  editing.value = account;
  parentForNew.value = null;
  dialog.value = true;
}
async function onSaved(account: AccountRecord) {
  notifySuccess(`تم حفظ الحساب ${account.code} ${account.name}.`);
  await load();
}

onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>

<template>
  <AppPage title="دليل الحسابات" :count="accounts.length || null">
    <template #header-actions>
      <v-btn
        v-if="can('accounting.accounts.manage')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-plus"
        @click="openNew()"
        >حساب جديد</v-btn
      >
    </template>

    <div class="accounts-toolbar">
      <v-text-field
        v-model="search"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        placeholder="ابحث برمز الحساب أو اسمه"
        aria-label="بحث في الحسابات"
        class="accounts-toolbar__search"
      />
      <v-btn-toggle
        v-model="currency"
        density="compact"
        variant="outlined"
        divided
        aria-label="العملة"
      >
        <v-btn :value="null">العملتان</v-btn>
        <v-btn
          v-for="option in ACCOUNT_CURRENCIES"
          :key="option.value"
          :value="option.value"
          >{{ option.title }}</v-btn
        >
      </v-btn-toggle>
      <v-switch
        v-model="showInactive"
        density="compact"
        hide-details
        color="primary"
        label="إظهار الحسابات الموقوفة"
      />
    </div>

    <v-progress-linear v-if="loading && !accounts.length" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal" density="compact">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>
    <v-empty-state
      v-else-if="!rows.length"
      icon="mdi-file-tree-outline"
      title="لا حسابات تطابق البحث"
    />
    <v-table v-else density="compact" class="accounts-table" hover>
      <thead>
        <tr>
          <th scope="col">الرمز</th>
          <th scope="col">الحساب</th>
          <th scope="col">النوع</th>
          <th scope="col">العملة</th>
          <th scope="col"><span class="d-sr-only">الإجراءات</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.account.id"
          :class="{
            'accounts-table__heading': !row.account.is_postable,
            'accounts-table__inactive': !row.account.is_active,
          }"
        >
          <td class="accounts-table__code">
            <bdi>{{ row.account.code }}</bdi>
          </td>
          <td>
            <div
              class="accounts-table__name"
              :style="{ paddingInlineStart: `${row.depth * 20}px` }"
            >
              <v-btn
                v-if="row.hasChildren && !search"
                :icon="
                  collapsed.has(row.account.id)
                    ? 'mdi-chevron-left'
                    : 'mdi-chevron-down'
                "
                size="x-small"
                variant="text"
                :aria-label="
                  collapsed.has(row.account.id)
                    ? `إظهار حسابات ${row.account.name}`
                    : `طي حسابات ${row.account.name}`
                "
                :aria-expanded="!collapsed.has(row.account.id)"
                @click="toggle(row.account.id)"
              />
              <span v-else class="accounts-table__spacer" />
              <span>{{ row.account.name }}</span>
              <v-icon
                v-if="row.account.system_key"
                icon="mdi-lock-outline"
                size="14"
                class="accounts-table__lock"
                role="img"
                aria-label="حساب أساسي يعتمد عليه النظام"
                title="حساب من الدليل الأساسي يعتمد عليه النظام: يُعدَّل اسمه فقط"
              />
              <v-chip
                v-if="!row.account.is_active"
                size="x-small"
                variant="tonal"
                color="warning"
                label
                >موقوف</v-chip
              >
            </div>
          </td>
          <td>{{ accountTypeLabel(row.account.account_type) }}</td>
          <td>
            {{
              row.account.is_postable || row.account.currency
                ? accountCurrencyLabel(row.account.currency)
                : "—"
            }}
          </td>
          <td class="accounts-table__actions">
            <template v-if="can('accounting.accounts.manage')">
              <v-btn
                v-if="!row.account.is_postable && row.account.is_active"
                icon="mdi-plus"
                size="small"
                variant="text"
                :aria-label="`حساب فرعي تحت ${row.account.name}`"
                :title="`حساب فرعي تحت ${row.account.name}`"
                @click="openNew(row.account)"
              />
              <v-btn
                icon="mdi-pencil-outline"
                size="small"
                variant="text"
                :aria-label="`تعديل ${row.account.name}`"
                :title="`تعديل ${row.account.name}`"
                @click="openEdit(row.account)"
              />
            </template>
          </td>
        </tr>
      </tbody>
    </v-table>

    <AccountDialog
      v-model="dialog"
      :account="editing"
      :parent="parentForNew"
      :chart="accounts"
      @saved="onSaved"
    />
  </AppPage>
</template>

<style scoped>
.accounts-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-block-end: 12px;
}
.accounts-toolbar__search {
  flex: 1 1 260px;
  max-width: 420px;
}
.accounts-table__code {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  width: 1%;
}
.accounts-table__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
}
.accounts-table__spacer {
  display: inline-block;
  width: 28px;
}
.accounts-table__heading
  .accounts-table__name
  > span:not(.accounts-table__spacer) {
  font-weight: 600;
}
.accounts-table__lock {
  opacity: var(--v-medium-emphasis-opacity);
}
.accounts-table__inactive td {
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.accounts-table__actions {
  white-space: nowrap;
  text-align: end;
  width: 1%;
}
</style>
