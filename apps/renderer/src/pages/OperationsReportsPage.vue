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
import { DEAL_TYPES } from "../constants/deals";
import {
  OPERATIONS_REPORTS,
  type OperationsReportKey,
} from "../constants/reports";
import {
  customersDocument,
  dealsDocument,
  leasesDocument,
  listingsDocument,
  type OperationsLinks,
} from "../utils/operationsReports";
import {
  exportReportExcel,
  exportReportPdf,
  printReport,
  type ReportDocument,
} from "../utils/reportDocument";
import { todayIso } from "../utils/format";
import type { SaveResult } from "../platform/types";

/**
 * تقارير العمل: الصفقات والزبائن وعروض البيع والإيجار والإيجارات السارية،
 * كل تقرير بمدته وفلاتره، ويُصدَّر إلى Excel وPDF ويُطبع كما يُعرض. لا يظهر
 * تبويب تقرير إلا لمن يملك صلاحية عرض مجاله؛ معادلاته في docs/REPORTS.md.
 * الفلاتر في عنوان الصفحة.
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifyError, notifySuccess } = useSnackbar();

const available = computed(() =>
  OPERATIONS_REPORTS.filter((item) => can(item.permission)),
);
const text = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;
const today = todayIso();
const firstReport = () =>
  available.value.find((item) => item.value === route.query.report)?.value ??
  available.value[0]?.value ??
  "deals";
const filters = reactive({
  report: firstReport() as OperationsReportKey,
  from: text(route.query.from) ?? `${today.slice(0, 4)}-01-01`,
  to: text(route.query.to) ?? today,
  user_id: Number(route.query.user_id) || null,
  deal_type:
    (text(route.query.deal_type) as "sale" | "rent" | undefined) ?? null,
  days: Number(route.query.days) || null,
});
const search = ref("");
/** Customers stay uncontacted after 30 days; leases expire within 60. */
const defaultDays = computed(() => (filters.report === "leases" ? 60 : 30));

watch(
  filters,
  () => {
    void router.replace({
      query: {
        report: filters.report,
        from: filters.from,
        to: filters.to,
        ...(filters.user_id && ["deals", "customers"].includes(filters.report)
          ? { user_id: String(filters.user_id) }
          : {}),
        ...(filters.deal_type && filters.report === "deals"
          ? { deal_type: filters.deal_type }
          : {}),
        ...(filters.days && ["customers", "leases"].includes(filters.report)
          ? { days: String(filters.days) }
          : {}),
      },
    });
  },
  { deep: true },
);

const links: OperationsLinks = { can };
const report = ref<ReportDocument | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
/** Employees seen in the reports, for the employee filter. */
const employees = ref(new Map<number, string>());

let request = 0;
async function load() {
  if (!available.value.length) return;
  const current = ++request;
  loading.value = true;
  error.value = null;
  const period = {
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
  const remember = (
    rows: Array<{ user_id: number | null; display_name: string | null }>,
  ) => {
    for (const row of rows)
      if (row.user_id && row.display_name)
        employees.value.set(row.user_id, row.display_name);
  };
  try {
    let document: ReportDocument;
    switch (filters.report) {
      case "deals": {
        const data = await reportsService.getDealsReport({
          ...period,
          user_id: filters.user_id ?? undefined,
          deal_type: filters.deal_type ?? undefined,
        });
        remember(data.employees);
        document = dealsDocument(
          data,
          links,
          filters.user_id ? employees.value.get(filters.user_id) : null,
        );
        break;
      }
      case "customers": {
        const data = await reportsService.getCustomersReport({
          ...period,
          user_id: filters.user_id ?? undefined,
          days: filters.days ?? undefined,
        });
        remember(data.contacts_by_user);
        document = customersDocument(
          data,
          links,
          filters.user_id ? employees.value.get(filters.user_id) : null,
        );
        break;
      }
      case "sale-listings":
      case "rental-listings":
        document = listingsDocument(
          await reportsService.getListingsReport({
            ...period,
            kind: filters.report === "sale-listings" ? "sale" : "rental",
          }),
          links,
        );
        break;
      case "leases":
        document = leasesDocument(
          await reportsService.getLeasesReport({
            ...period,
            days: filters.days ?? undefined,
          }),
          links,
        );
        break;
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

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [
    filters.report,
    filters.from,
    filters.to,
    filters.user_id,
    filters.deal_type,
    filters.days,
  ],
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(), 300);
  },
);
// Days mean different things per report: back to the report's default.
watch(
  () => filters.report,
  () => {
    filters.days = null;
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
  <AppPage title="تقارير العمل">
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

    <v-alert v-if="!available.length" type="info" variant="tonal">
      تقارير العمل تحتاج صلاحية عرض الصفقات أو الزبائن أو العروض أو الإيجارات.
    </v-alert>

    <template v-else>
      <v-tabs
        v-model="filters.report"
        density="compact"
        show-arrows
        class="mb-2"
        aria-label="التقارير"
      >
        <v-tab
          v-for="item in available"
          :key="item.value"
          :value="item.value"
          :prepend-icon="item.icon"
          >{{ item.title }}</v-tab
        >
      </v-tabs>

      <section class="dal-panel reports-filters" aria-label="فلاتر التقرير">
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
        <v-select
          v-if="filters.report === 'deals' || filters.report === 'customers'"
          v-model="filters.user_id"
          :items="employeeOptions"
          label="الموظف"
          placeholder="كل الموظفين"
          persistent-placeholder
          no-data-text="لا موظفين في التقرير"
          density="compact"
          hide-details
          clearable
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
          <v-btn variant="text" size="small" @click="load"
            >إعادة المحاولة</v-btn
          >
        </template>
      </v-alert>
      <template v-else-if="report">
        <p class="reports-period">{{ report.title }} · {{ report.period }}</p>
        <ReportView :report="report" :search="search ?? ''" />
      </template>
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
.reports-period {
  margin: 0 0 8px;
  font-weight: 700;
}
</style>
