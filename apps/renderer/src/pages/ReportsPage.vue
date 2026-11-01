<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import ReportView from "../components/reports/ReportView.vue";
import MoneyStrip, {
  type MoneyCell,
} from "../components/shared/MoneyStrip.vue";
import * as reportsService from "../services/reports.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import { ACCOUNT_CURRENCIES } from "../constants/accounting";
import { DEAL_TYPES } from "../constants/deals";
import {
  REPORT_CATEGORIES,
  financialReportOf,
  reportCategoryOf,
  reportSpec,
  type ReportCategory,
  type ReportKey,
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
  customersDocument,
  dealsDocument,
  leasesDocument,
  listingsDocument,
} from "../utils/operationsReports";
import {
  exportReportExcel,
  exportReportPdf,
  printReport,
  type ReportDocument,
} from "../utils/reportDocument";
import {
  PERIOD_PRESETS,
  periodKeyOf,
  periodRange,
  type PeriodKey,
} from "../utils/periods";
import type { CommissionsReport, Currency, DealsReport } from "../types";
import type { SaveResult } from "../platform/types";

/**
 * التقارير: صفحة واحدة لكل تقارير العمل والمال. في أعلاها نظرة عامة على
 * الفترة (الصفقات المكتملة والعمولات)، ثم شريط فلاتر واحد بفترة جاهزة
 * (هذا الشهر افتراضياً) وتصنيف التقرير، ثم التقرير نفسه يُصدَّر إلى Excel
 * وPDF ويُطبع كما يُعرض. لا يظهر تقرير إلا لمن يملك صلاحيته، والفلاتر في
 * عنوان الصفحة فيُفتح التقرير نفسه من رابط. المعادلات في docs/REPORTS.md.
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifyError, notifySuccess } = useSnackbar();

const allowed = (report: ReportKey) =>
  reportSpec(report).permissions.every((key) => can(key));
const categories = computed(() =>
  REPORT_CATEGORIES.map((category) => ({
    ...category,
    reports: category.reports.filter(allowed),
  })).filter((category) => category.reports.length),
);

const text = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;
function firstReport(): ReportKey | null {
  const asked = text(route.query.report) as ReportKey | undefined;
  if (asked && categories.value.some((item) => item.reports.includes(asked)))
    return asked;
  // الصفقات أولاً لمن يراها: أكثر ما يسأل عنه صاحب المكتب، ثم العمولات.
  for (const preferred of ["deals", "commissions"] as const)
    if (allowed(preferred)) return preferred;
  return categories.value[0]?.reports[0] ?? null;
}
const thisMonth = periodRange("month");
const filters = reactive({
  report: firstReport(),
  from: text(route.query.from) ?? thisMonth.from,
  to: text(route.query.as_of) ?? text(route.query.to) ?? thisMonth.to,
  currency: (text(route.query.currency) as Currency | undefined) ?? null,
  group: route.query.group === "month",
  user_id: Number(route.query.user_id) || null,
  account: Number(route.query.account) || null,
  deal_type:
    (text(route.query.deal_type) as "sale" | "rent" | undefined) ?? null,
  days: Number(route.query.days) || null,
});
const search = ref("");

// ─── الفترة والتصنيف ────────────────────────────────────────────────────
type PeriodChoice = Exclude<PeriodKey, "all"> | "custom";
const PERIOD_CHOICES: Array<{ value: PeriodChoice; title: string }> = [
  ...PERIOD_PRESETS.filter((item) => item.value !== "all").map((item) => ({
    value: item.value as PeriodChoice,
    title: item.title,
  })),
  { value: "custom", title: "مخصص" },
];
/** A preset of this page, or custom (also for «منذ البداية» from a link). */
const choiceOf = (range: { from: string; to: string }): PeriodChoice => {
  const key = periodKeyOf(range);
  return key && key !== "all" ? key : "custom";
};
const periodChoice = ref<PeriodChoice>(
  choiceOf({ from: filters.from, to: filters.to }),
);
watch(periodChoice, (choice) => {
  if (choice === "custom") return;
  Object.assign(filters, periodRange(choice));
});
// Dates from a link that match no preset make the range custom; while the
// user types custom dates the fields stay, even on a preset's range.
watch(
  () => [filters.from, filters.to],
  () => {
    if (periodChoice.value === "custom") return;
    const choice = choiceOf({ from: filters.from, to: filters.to });
    if (choice !== periodChoice.value) periodChoice.value = choice;
  },
);

const category = computed<ReportCategory | null>({
  get: () => (filters.report ? reportCategoryOf(filters.report) : null),
  set: (value) => {
    const next = categories.value.find((item) => item.value === value);
    if (next && !next.reports.includes(filters.report!))
      filters.report = next.reports[0];
  },
});
const categoryReports = computed(
  () =>
    categories.value
      .find((item) => item.value === category.value)
      ?.reports.map((value) => ({ value, title: reportSpec(value).title })) ??
    [],
);
const spec = computed(() =>
  filters.report ? reportSpec(filters.report) : null,
);
/** Balance sheet, receivables and payables are read on one day: `to`. */
const onDay = computed(
  () =>
    Boolean(spec.value?.financial) &&
    financialReportOf(filters.report!).span === "day",
);
const defaultDays = computed(() => (filters.report === "leases" ? 60 : 30));

// The filters live in the address, so a report opens from a link.
watch(
  filters,
  () => {
    if (!filters.report) return;
    const report = filters.report;
    void router.replace({
      query: {
        report,
        ...(onDay.value
          ? { as_of: filters.to }
          : { from: filters.from, to: filters.to }),
        ...(filters.currency && spec.value?.financial
          ? { currency: filters.currency }
          : {}),
        ...(report === "income-statement" && filters.group
          ? { group: "month" }
          : {}),
        ...(filters.user_id &&
        ["commissions", "deals", "customers"].includes(report)
          ? { user_id: String(filters.user_id) }
          : {}),
        ...(report === "ledger" && filters.account
          ? { account: String(filters.account) }
          : {}),
        ...(filters.deal_type && report === "deals"
          ? { deal_type: filters.deal_type }
          : {}),
        ...(filters.days && ["customers", "leases"].includes(report)
          ? { days: String(filters.days) }
          : {}),
      },
    });
  },
  { deep: true },
);
// Days and the employee mean different things per report.
watch(
  () => filters.report,
  () => {
    filters.days = null;
    filters.user_id = null;
  },
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

// ─── النظرة العامة ──────────────────────────────────────────────────────
const canDeals = computed(() => allowed("deals"));
const canMoney = computed(() => can("reports.financial"));
const overview = shallowRef<{
  all: DealsReport | null;
  sale: DealsReport | null;
  rent: DealsReport | null;
  commissions: CommissionsReport | null;
} | null>(null);
const overviewLoading = ref(false);
let overviewRequest = 0;
async function loadOverview() {
  if (!canDeals.value && !canMoney.value) return;
  const current = ++overviewRequest;
  overviewLoading.value = true;
  const period = {
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
  try {
    const [all, sale, rent, commissions] = await Promise.all([
      canDeals.value ? reportsService.getDealsReport(period) : null,
      canDeals.value
        ? reportsService.getDealsReport({ ...period, deal_type: "sale" })
        : null,
      canDeals.value
        ? reportsService.getDealsReport({ ...period, deal_type: "rent" })
        : null,
      canMoney.value ? reportsService.getCommissionsReport(period) : null,
    ]);
    if (current === overviewRequest)
      overview.value = { all, sale, rent, commissions };
  } catch {
    // The report below shows the error; the overview stays empty.
    if (current === overviewRequest) overview.value = null;
  } finally {
    if (current === overviewRequest) overviewLoading.value = false;
  }
}
const overviewCells = computed<MoneyCell[]>(() => {
  const data = overview.value;
  const cells: MoneyCell[] = [];
  if (canDeals.value)
    cells.push(
      {
        key: "sales",
        label: "إجمالي المبيعات",
        values: [],
        count: data ? (data.sale?.totals.won ?? 0) : null,
        note: "صفقة بيع مكتملة",
        action: true,
      },
      {
        key: "rentals",
        label: "إجمالي الإيجارات",
        values: [],
        count: data ? (data.rent?.totals.won ?? 0) : null,
        note: "صفقة إيجار مكتملة",
        action: true,
      },
    );
  if (canMoney.value) {
    const sections = data?.commissions?.sections ?? [];
    cells.push(
      {
        key: "collected",
        label: "العمولات المحصلة",
        values: sections.map((section) => ({
          currency: section.currency,
          amount: section.totals.collected,
        })),
        note: "من عمولات الفترة",
        action: true,
      },
      {
        key: "outstanding",
        label: "العمولات المتبقية",
        values: sections.map((section) => ({
          currency: section.currency,
          amount: section.totals.outstanding,
        })),
        note: "من عمولات الفترة، لم تُقبض بعد",
        tone: "warning",
        action: true,
      },
    );
  }
  if (canDeals.value)
    cells.push({
      key: "won",
      label: "الصفقات المكتملة",
      values: [],
      count: data ? (data.all?.totals.won ?? 0) : null,
      note: data?.all
        ? `من ${data.all.totals.created} صفقة جديدة في الفترة`
        : "بيعاً وإيجاراً",
      action: true,
    });
  return cells;
});
function onOverview(key: string) {
  if (key === "sales" || key === "rentals" || key === "won") {
    filters.report = "deals";
    filters.deal_type =
      key === "sales" ? "sale" : key === "rentals" ? "rent" : null;
  } else filters.report = "commissions";
}

// ─── التقرير ────────────────────────────────────────────────────────────
const report = ref<ReportDocument | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
/** Employees seen in the reports, for the employee filter. */
const employees = ref(new Map<number, string>());
/** Accounts with postings by `to`, for the ledger's picker. */
const accounts = ref<Array<{ value: number; title: string }>>([]);

let request = 0;
async function load() {
  if (!filters.report) return;
  const current = ++request;
  loading.value = true;
  error.value = null;
  const range = {
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
  const currency = filters.currency ?? undefined;
  const period = { ...range, currency };
  const day = { as_of: filters.to || undefined, currency };
  const employee = () =>
    filters.user_id ? employees.value.get(filters.user_id) : null;
  const remember = (
    rows: Array<{ user_id: number | null; display_name: string | null }>,
  ) => {
    for (const row of rows)
      if (row.user_id && row.display_name)
        employees.value.set(row.user_id, row.display_name);
  };
  try {
    let document: ReportDocument | null = null;
    switch (filters.report) {
      case "deals": {
        const data = await reportsService.getDealsReport({
          ...range,
          user_id: filters.user_id ?? undefined,
          deal_type: filters.deal_type ?? undefined,
        });
        remember(data.employees);
        document = dealsDocument(data, links, employee());
        break;
      }
      case "customers": {
        const data = await reportsService.getCustomersReport({
          ...range,
          user_id: filters.user_id ?? undefined,
          days: filters.days ?? undefined,
        });
        remember(data.contacts_by_user);
        document = customersDocument(data, links, employee());
        break;
      }
      case "sale-listings":
      case "rental-listings":
        document = listingsDocument(
          await reportsService.getListingsReport({
            ...range,
            kind: filters.report === "sale-listings" ? "sale" : "rental",
          }),
          links,
        );
        break;
      case "leases":
        document = leasesDocument(
          await reportsService.getLeasesReport({
            ...range,
            days: filters.days ?? undefined,
          }),
          links,
        );
        break;
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
        for (const section of data.sections) remember(section.employees);
        document = commissionsDocument(data, links, employee());
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
              await reportsService.getAccountLedger(filters.account, range),
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
    filters.currency,
    filters.group,
    filters.user_id,
    filters.account,
    filters.deal_type,
    filters.days,
  ],
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(), 300);
  },
);
let overviewTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [filters.from, filters.to],
  () => {
    clearTimeout(overviewTimer);
    overviewTimer = setTimeout(() => void loadOverview(), 300);
  },
);
// A link inside the page (an account's ledger) changes only the address.
watch(
  () => route.query,
  (query) => {
    if (route.name !== "reports") return;
    const next = text(query.report) as ReportKey | undefined;
    if (next && next !== filters.report && allowed(next)) filters.report = next;
    if (text(query.account) && Number(query.account) !== filters.account)
      filters.account = Number(query.account);
    if (query.from !== undefined && (text(query.from) ?? "") !== filters.from)
      filters.from = text(query.from) ?? "";
    if (text(query.to) && query.to !== filters.to) filters.to = text(query.to)!;
  },
);
onMounted(() => {
  setRefreshHandler(() =>
    Promise.all([load(), loadOverview()]).then(() => undefined),
  );
  void load();
  void loadOverview();
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  clearTimeout(overviewTimer);
});

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
  <AppPage title="التقارير">
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

    <v-alert v-if="!categories.length" type="info" variant="tonal">
      التقارير تحتاج صلاحية تقارير العمل أو التقارير المالية.
    </v-alert>

    <div v-else class="reports">
      <MoneyStrip
        v-if="overviewCells.length"
        :cells="overviewCells"
        :loading="overviewLoading"
        label="نظرة عامة على الفترة"
        @select="onOverview"
      />

      <section class="dal-panel reports-filters" aria-label="فلاتر التقرير">
        <div class="reports-filters__row">
          <v-btn-toggle
            v-model="category"
            mandatory
            divided
            density="compact"
            variant="outlined"
            color="primary"
            aria-label="تصنيف التقرير"
            class="reports-filters__segments"
          >
            <v-btn
              v-for="item in categories"
              :key="item.value"
              :value="item.value"
              :prepend-icon="item.icon"
              >{{ item.title }}</v-btn
            >
          </v-btn-toggle>
        </div>
        <div class="reports-filters__row">
          <v-select
            v-if="categoryReports.length > 1"
            v-model="filters.report"
            :items="categoryReports"
            label="التقرير"
            density="compact"
            hide-details
            class="reports-filters__field reports-filters__field--wide"
          />
          <v-btn-toggle
            v-model="periodChoice"
            mandatory
            divided
            density="compact"
            variant="outlined"
            color="primary"
            :aria-label="onDay ? 'اليوم' : 'الفترة'"
          >
            <v-btn
              v-for="item in PERIOD_CHOICES"
              :key="item.value"
              :value="item.value"
              >{{ item.title }}</v-btn
            >
          </v-btn-toggle>
          <template v-if="periodChoice === 'custom'">
            <v-text-field
              v-if="!onDay"
              v-model="filters.from"
              type="date"
              label="من"
              density="compact"
              hide-details
              class="reports-filters__field"
            />
            <v-text-field
              v-model="filters.to"
              type="date"
              :label="onDay ? 'في يوم' : 'إلى'"
              density="compact"
              hide-details
              class="reports-filters__field"
            />
          </template>
          <v-select
            v-if="spec?.financial"
            v-model="filters.currency"
            :items="ACCOUNT_CURRENCIES"
            label="العملة"
            placeholder="كل العملات"
            persistent-placeholder
            density="compact"
            hide-details
            clearable
            class="reports-filters__field"
          />
          <v-select
            v-if="
              ['commissions', 'deals', 'customers'].includes(
                filters.report ?? '',
              )
            "
            v-model="filters.user_id"
            :items="employeeOptions"
            label="الموظف"
            placeholder="كل الموظفين"
            persistent-placeholder
            no-data-text="لا موظفين في التقرير"
            density="compact"
            hide-details
            clearable
            class="reports-filters__field"
          />
          <v-select
            v-if="filters.report === 'deals'"
            v-model="filters.deal_type"
            :items="DEAL_TYPES"
            label="نوع الصفقة"
            placeholder="البيع والإيجار"
            persistent-placeholder
            density="compact"
            hide-details
            clearable
            class="reports-filters__field"
          />
          <v-text-field
            v-if="filters.report === 'customers' || filters.report === 'leases'"
            v-model.number="filters.days"
            type="number"
            min="1"
            max="365"
            :label="
              filters.report === 'leases'
                ? 'تنتهي خلال (يوماً)'
                : 'بلا تواصل منذ (يوماً)'
            "
            :placeholder="String(defaultDays)"
            persistent-placeholder
            density="compact"
            hide-details
            class="reports-filters__field"
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
            class="reports-filters__field reports-filters__field--wide"
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
            class="reports-filters__field"
          />
        </div>
      </section>

      <v-progress-linear v-if="loading" indeterminate />
      <v-alert v-if="error" type="error" variant="tonal">
        {{ error }}
        <template #append>
          <v-btn variant="text" size="small" @click="load"
            >إعادة المحاولة</v-btn
          >
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
    </div>
  </AppPage>
</template>

<style scoped>
.reports {
  display: grid;
  gap: var(--dal-gutter);
}
.reports-filters {
  display: grid;
}
.reports-filters__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 8px 12px;
}
.reports-filters__row + .reports-filters__row {
  border-top: 1px solid var(--dal-stroke);
}
.reports-filters__segments {
  flex-wrap: wrap;
  height: auto !important;
}
.reports-filters__field {
  flex: 1 1 10rem;
  min-width: 9rem;
  max-width: 14rem;
}
.reports-filters__field--wide {
  flex-basis: 16rem;
  max-width: 22rem;
}
.reports-period {
  margin: 0;
  font-weight: 700;
}
.reports-hint {
  padding: 24px;
  text-align: center;
  color: var(--dal-muted);
}
</style>
