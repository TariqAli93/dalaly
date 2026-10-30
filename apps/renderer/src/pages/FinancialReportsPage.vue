<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import ReportView from "../components/reports/ReportView.vue";
import * as reportsService from "../services/reports.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import { ACCOUNT_CURRENCIES } from "../constants/accounting";
import {
  FINANCIAL_REPORTS,
  financialReportOf,
  type FinancialReportKey,
} from "../constants/reports";
import {
  balanceSheetDocument,
  cashFlowDocument,
  commissionsDocument,
  incomeStatementDocument,
  ledgerDocument,
  payablesDocument,
  receivablesDocument,
  trialBalanceDocument,
  type ReportLinks,
} from "../utils/financialReports";
import {
  exportReportExcel,
  exportReportPdf,
  printReport,
  type ReportDocument,
} from "../utils/reportDocument";
import { todayIso } from "../utils/format";
import type { Currency } from "../types";
import type { SaveResult } from "../platform/types";

/**
 * التقارير المالية: كل تقرير بمدته (أو يومه) وعملته، يُعرض ويُصدَّر إلى
 * Excel وPDF ويُطبع كما هو على الشاشة. الأرقام من القيود المرحَّلة، فتتفق
 * التقارير بعضها مع بعض ومع ميزان المراجعة؛ معادلاتها في docs/REPORTS.md.
 * الفلاتر في عنوان الصفحة، فيُفتح التقرير نفسه من رابط (دفتر حساب مثلاً).
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifyError, notifySuccess } = useSnackbar();

const today = todayIso();
const text = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;
const filters = reactive({
  report: financialReportOf(text(route.query.report) ?? "").value,
  from: text(route.query.from) ?? `${today.slice(0, 4)}-01-01`,
  to: text(route.query.to) ?? today,
  as_of: text(route.query.as_of) ?? today,
  currency: (text(route.query.currency) as Currency | undefined) ?? null,
  group: route.query.group === "month",
  user_id: Number(route.query.user_id) || null,
  account: Number(route.query.account) || null,
});
const search = ref("");
const spec = computed(() => financialReportOf(filters.report));

// The filters live in the address, so a report opens from a link.
watch(
  filters,
  () => {
    const day = spec.value.span === "day";
    void router.replace({
      query: {
        report: filters.report,
        ...(day
          ? { as_of: filters.as_of }
          : { from: filters.from, to: filters.to }),
        ...(filters.currency ? { currency: filters.currency } : {}),
        ...(filters.report === "income-statement" && filters.group
          ? { group: "month" }
          : {}),
        ...(filters.report === "commissions" && filters.user_id
          ? { user_id: String(filters.user_id) }
          : {}),
        ...(filters.report === "ledger" && filters.account
          ? { account: String(filters.account) }
          : {}),
      },
    });
  },
  { deep: true },
);

const links: ReportLinks = {
  can,
  ledger: (accountId, range) =>
    router.resolve({
      query: {
        report: "ledger",
        account: String(accountId),
        ...(range.from ? { from: range.from } : { from: "" }),
        to: range.to,
      },
    }).fullPath,
};

const report = ref<ReportDocument | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
/** Employees seen in the commissions report, for its filter. */
const employees = ref(new Map<number, string>());
/** Accounts with postings in the period, for the ledger's picker. */
const accounts = ref<Array<{ value: number; title: string }>>([]);

let request = 0;
async function load() {
  const current = ++request;
  loading.value = true;
  error.value = null;
  const currency = filters.currency ?? undefined;
  const period = {
    from: filters.from || undefined,
    to: filters.to || undefined,
    currency,
  };
  const day = { as_of: filters.as_of || undefined, currency };
  try {
    let document: ReportDocument | null = null;
    switch (filters.report as FinancialReportKey) {
      case "trial-balance":
        document = trialBalanceDocument(
          await reportsService.getTrialBalance(period),
          links,
        );
        break;
      case "income-statement":
        document = incomeStatementDocument(
          await reportsService.getIncomeStatement({
            ...period,
            group: filters.group ? "month" : "none",
          }),
          links,
        );
        break;
      case "balance-sheet":
        document = balanceSheetDocument(
          await reportsService.getBalanceSheet(day),
          links,
        );
        break;
      case "cash-flow":
        document = cashFlowDocument(
          await reportsService.getCashFlow(period),
          links,
        );
        break;
      case "commissions": {
        const data = await reportsService.getCommissionsReport({
          ...period,
          user_id: filters.user_id ?? undefined,
        });
        for (const section of data.sections)
          for (const row of section.employees)
            employees.value.set(row.user_id, row.display_name);
        document = commissionsDocument(
          data,
          links,
          filters.user_id ? employees.value.get(filters.user_id) : null,
        );
        break;
      }
      case "receivables":
        document = receivablesDocument(
          await reportsService.getReceivables(day),
          links,
        );
        break;
      case "payables":
        document = payablesDocument(
          await reportsService.getPayables(day),
          links,
        );
        break;
      case "ledger": {
        const balances = await reportsService.getTrialBalance({
          to: filters.to || undefined,
          currency,
        });
        accounts.value = balances.sections.flatMap((section) =>
          section.rows.map((row) => ({
            value: row.account_id,
            title: `${row.code} — ${row.name}`,
          })),
        );
        document = filters.account
          ? ledgerDocument(
              await reportsService.getAccountLedger(filters.account, {
                from: filters.from || undefined,
                to: filters.to || undefined,
              }),
              links,
            )
          : null;
        break;
      }
    }
    if (current === request) report.value = document;
  } catch (cause) {
    if (current === request) {
      error.value = getErrorMessage(cause);
      report.value = null;
    }
  } finally {
    if (current === request) loading.value = false;
  }
}

// Dates are typed a digit at a time: wait for a pause before loading.
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [
    filters.report,
    filters.from,
    filters.to,
    filters.as_of,
    filters.currency,
    filters.group,
    filters.user_id,
    filters.account,
  ],
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(), 300);
  },
);
// A link inside the page (an account's ledger) changes only the address.
watch(
  () => route.query,
  (query) => {
    if (route.name !== "financial-reports") return;
    const next = financialReportOf(text(query.report) ?? "").value;
    if (next !== filters.report) filters.report = next;
    if (text(query.account) && Number(query.account) !== filters.account)
      filters.account = Number(query.account);
    if (query.from !== undefined && (text(query.from) ?? "") !== filters.from)
      filters.from = text(query.from) ?? "";
    if (text(query.to) && query.to !== filters.to) filters.to = text(query.to)!;
  },
);
onMounted(() => {
  setRefreshHandler(load);
  void load();
});
onBeforeUnmount(() => clearTimeout(timer));

const employeeOptions = computed(() =>
  [...employees.value].map(([value, title]) => ({ value, title })),
);

const exporting = ref<"" | "excel" | "pdf" | "print">("");
async function run(kind: "excel" | "pdf" | "print") {
  if (!report.value || exporting.value) return;
  exporting.value = kind;
  try {
    const result: SaveResult =
      kind === "excel"
        ? await exportReportExcel(report.value)
        : kind === "pdf"
          ? await exportReportPdf(report.value)
          : await printReport(report.value);
    if (!result.ok && !result.canceled)
      notifyError(result.message ?? "تعذّر إخراج التقرير.");
    else if (result.ok && result.path) notifySuccess(`حُفظ في ${result.path}`);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    exporting.value = "";
  }
}
</script>

<template>
  <AppPage title="التقارير المالية">
    <template #header-actions>
      <v-btn
        variant="text"
        prepend-icon="mdi-microsoft-excel"
        :disabled="!report"
        :loading="exporting === 'excel'"
        @click="run('excel')"
        >Excel</v-btn
      >
      <v-btn
        variant="text"
        prepend-icon="mdi-file-pdf-box"
        :disabled="!report"
        :loading="exporting === 'pdf'"
        @click="run('pdf')"
        >PDF</v-btn
      >
      <v-btn
        variant="tonal"
        prepend-icon="mdi-printer-outline"
        :disabled="!report"
        :loading="exporting === 'print'"
        @click="run('print')"
        >طباعة</v-btn
      >
    </template>

    <v-tabs
      v-model="filters.report"
      density="compact"
      show-arrows
      class="mb-2"
      aria-label="التقارير"
    >
      <v-tab
        v-for="item in FINANCIAL_REPORTS"
        :key="item.value"
        :value="item.value"
        :prepend-icon="item.icon"
        >{{ item.title }}</v-tab
      >
    </v-tabs>

    <section class="dal-panel reports-filters" aria-label="فلاتر التقرير">
      <template v-if="spec.span === 'period'">
        <v-text-field
          v-model="filters.from"
          type="date"
          label="من"
          density="compact"
          hide-details
        />
        <v-text-field
          v-model="filters.to"
          type="date"
          label="إلى"
          density="compact"
          hide-details
        />
      </template>
      <v-text-field
        v-else
        v-model="filters.as_of"
        type="date"
        label="في يوم"
        density="compact"
        hide-details
      />
      <v-select
        v-model="filters.currency"
        :items="ACCOUNT_CURRENCIES"
        label="العملة"
        placeholder="كل العملات"
        persistent-placeholder
        density="compact"
        hide-details
        clearable
      />
      <v-select
        v-if="filters.report === 'commissions'"
        v-model="filters.user_id"
        :items="employeeOptions"
        label="الموظف"
        placeholder="كل الموظفين"
        persistent-placeholder
        no-data-text="لا حصص لموظفين في المدة"
        density="compact"
        hide-details
        clearable
      />
      <v-autocomplete
        v-if="filters.report === 'ledger'"
        v-model="filters.account"
        :items="accounts"
        label="الحساب"
        placeholder="اختر حساباً"
        persistent-placeholder
        no-data-text="لا حساب عليه قيود حتى هذا التاريخ"
        density="compact"
        hide-details
        class="reports-filters__wide"
      />
      <v-switch
        v-if="filters.report === 'income-statement'"
        v-model="filters.group"
        label="شهراً بشهر"
        color="primary"
        density="compact"
        hide-details
      />
      <v-text-field
        v-model="search"
        label="بحث في الصفوف"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        hide-details
        clearable
      />
    </section>

    <v-progress-linear v-if="loading" indeterminate class="mb-2" />
    <v-alert v-if="error" type="error" variant="tonal" class="mb-3">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>
    <p
      v-else-if="filters.report === 'ledger' && !filters.account"
      class="reports-hint"
    >
      اختر حساباً لترى حركاته ورصيده، أو افتح حساباً من أي تقرير آخر.
    </p>
    <template v-else-if="report">
      <p class="reports-period">{{ report.title }} · {{ report.period }}</p>
      <ReportView :report="report" :search="search ?? ''" />
    </template>
  </AppPage>
</template>

<style scoped>
.reports-filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 10px 12px;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 12px;
}
.reports-filters__wide {
  grid-column: span 2;
}
.reports-period {
  margin: 0 0 8px;
  font-weight: 700;
}
.reports-hint {
  padding: 24px;
  text-align: center;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
