<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import * as accountingService from "../services/accounting.service";
import { getErrorMessage } from "../services/api.service";
import { useRefresh } from "../composables/useRefresh";
import { accountTypeLabel } from "../constants/accounting";
import { formatAmount, formatDate, todayIso } from "../utils/format";
import type { AccountStatement } from "../types";

/**
 * كشف حساب: القيود المرحَّلة على الحساب في مدة، برصيد أول المدة ورصيد بعد
 * كل سطر على جهة الحساب المعتادة (المدين للأصول والمصروفات، والدائن لغيرها).
 * المسودات لا تظهر: لا أثر لها حتى تُرحَّل.
 */
const route = useRoute();
const { setRefreshHandler } = useRefresh();

const id = computed(() => Number(route.params.id));
const from = ref(`${todayIso().slice(0, 4)}-01-01`);
const to = ref(todayIso());
const statement = ref<AccountStatement | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    statement.value = await accountingService.getAccountStatement(id.value, {
      from: from.value || undefined,
      to: to.value || undefined,
    });
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
watch([id, from, to], () => void load());
onMounted(() => {
  setRefreshHandler(load);
  void load();
});

const currency = computed(() => statement.value?.account.currency ?? "IQD");
const money = (value: string) =>
  value === "0.00" ? "" : formatAmount(value, currency.value);
const sideNote = computed(() =>
  statement.value?.account.normal_side === "debit"
    ? "الرصيد = المدين − الدائن"
    : "الرصيد = الدائن − المدين",
);
</script>

<template>
  <AppPage
    :title="
      statement
        ? `كشف حساب ${statement.account.code} ${statement.account.name}`
        : 'كشف حساب'
    "
    :parent="{ to: '/accounting/accounts', label: 'دليل الحسابات' }"
  >
    <div class="statement-toolbar">
      <v-text-field
        v-model="from"
        type="date"
        label="من تاريخ"
        density="compact"
        hide-details
        clearable
      />
      <v-text-field
        v-model="to"
        type="date"
        label="إلى تاريخ"
        density="compact"
        hide-details
        clearable
      />
      <span v-if="statement" class="text-body-2 text-medium-emphasis">
        {{ accountTypeLabel(statement.account.account_type) }} ·
        {{ sideNote }}
      </span>
    </div>

    <v-progress-linear v-if="loading && !statement" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>

    <template v-else-if="statement">
      <v-alert
        v-if="!statement.account.currency"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-3"
        >حساب رئيسي: لا يُرحَّل إليه مباشرة. افتح حساباته الفرعية
        لكشوفها.</v-alert
      >
      <v-alert
        v-if="statement.truncated"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-3"
        >يعرض الكشف أول 2000 سطر في المدة؛ ضيّق التواريخ لرؤية البقية.</v-alert
      >
      <section class="dal-panel" aria-label="كشف الحساب">
        <v-table density="compact" class="statement">
          <thead>
            <tr>
              <th scope="col">التاريخ</th>
              <th scope="col">القيد</th>
              <th scope="col">البيان</th>
              <th scope="col" class="statement__amount">مدين</th>
              <th scope="col" class="statement__amount">دائن</th>
              <th scope="col" class="statement__amount">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            <tr class="statement__opening">
              <td colspan="5">
                رصيد أول المدة
                <template v-if="statement.from">
                  (قبل {{ formatDate(statement.from) }})</template
                >
              </td>
              <td class="statement__amount">
                <bdi>{{
                  formatAmount(statement.opening_balance, currency)
                }}</bdi>
              </td>
            </tr>
            <tr v-for="(line, index) in statement.lines" :key="index">
              <td>
                <span>{{ formatDate(line.entry_date) }}</span>
              </td>
              <td>
                <router-link :to="`/accounting/journal/${line.entry_id}`"
                  ><bdi>{{ line.code }}</bdi></router-link
                >
              </td>
              <td>
                {{ line.description }}
                <span v-if="line.memo" class="text-medium-emphasis">
                  · {{ line.memo }}</span
                >
              </td>
              <td class="statement__amount">
                <bdi>{{ money(line.debit) }}</bdi>
              </td>
              <td class="statement__amount">
                <bdi>{{ money(line.credit) }}</bdi>
              </td>
              <td class="statement__amount">
                <bdi>{{ formatAmount(line.balance, currency) }}</bdi>
              </td>
            </tr>
            <tr v-if="!statement.lines.length">
              <td colspan="6" class="text-center text-medium-emphasis py-4">
                لا قيود مرحَّلة على الحساب في هذه المدة.
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colspan="5">رصيد آخر المدة</th>
              <td class="statement__amount">
                <bdi>{{
                  formatAmount(statement.closing_balance, currency)
                }}</bdi>
              </td>
            </tr>
          </tfoot>
        </v-table>
      </section>
    </template>
  </AppPage>
</template>

<style scoped>
.statement-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-block-end: 12px;
}
.statement-toolbar > .v-input {
  flex: 0 1 12rem;
}
.statement__amount {
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  width: 14%;
}
.statement__opening td,
.statement tfoot th,
.statement tfoot td {
  font-weight: 600;
}
</style>
