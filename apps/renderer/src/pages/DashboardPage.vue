<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import SummaryStrip from "../components/dashboard/SummaryStrip.vue";
import PriorityStrip from "../components/dashboard/PriorityStrip.vue";
import MatchWorkspace from "../components/dashboard/MatchWorkspace.vue";
import DecisionsPanel from "../components/dashboard/DecisionsPanel.vue";
import RiskPanel from "../components/dashboard/RiskPanel.vue";
import PerformanceSummary from "../components/dashboard/PerformanceSummary.vue";
import MatchDetailsDrawer from "../components/dashboard/MatchDetailsDrawer.vue";
import CustomerDrawer from "../components/dashboard/CustomerDrawer.vue";
import RecordFollowupDialog from "../components/shared/RecordFollowupDialog.vue";
import { createBackup } from "../services/backup.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useProperties } from "../composables/useProperties";
import { useRentals } from "../composables/useRentals";
import { emptyRequestFilters, useRequests } from "../composables/useRequests";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import {
  STALE_DAY_OPTIONS,
  useOperationsDashboard,
} from "../composables/useOperationsDashboard";
import {
  priorityItems,
  type DashboardSection,
  type KpiItem,
} from "../utils/dashboardPriority";
import { formatNumber, formatTime } from "../utils/format";
import type {
  DashboardAppointment,
  DashboardCustomer,
  DashboardMatch,
  DashboardRequest,
  FollowupTarget,
  OperationsKind,
} from "../types";

const router = useRouter();
const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { showOnly, list: propertyList } = useProperties();
const { showOnly: showRentalsOnly, list: rentalList } = useRentals();
const dashboard = useOperationsDashboard();
const {
  overview,
  overviewError,
  matching,
  matchingError,
  matchingLoading,
  loadedAt,
  kind,
  q,
  page,
  staleDays,
} = dashboard;

// ما تسمح به الصلاحيات قبل وصول البيانات، كي لا تومض أقسام ستُخفى.
const canMatch = computed(
  () => can("requests.read") && (can("properties.read") || can("rentals.read")),
);
const canSeeAppointments = computed(
  () =>
    (can("followups.read") && can("properties.read")) ||
    (can("rentals.followups.read") && can("rentals.read")),
);
function canFollowup(kindOf: OperationsKind) {
  return kindOf === "sale"
    ? can("followups.create")
    : can("rentals.followups.create");
}

// ─── التحميل ───────────────────────────────────────────────────────────
// يبدأ في setup قبل التركيب؛ تغيّر النوع أو البحث يعيد الصفحة الأولى.
void dashboard.loadAll();
let searchTimer: ReturnType<typeof setTimeout> | undefined;
function reloadFirstPage() {
  if (page.value !== 1) page.value = 1;
  else void dashboard.loadMatching();
}
watch(kind, reloadFirstPage);
watch(page, () => void dashboard.loadMatching());
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(reloadFirstPage, 300);
});
watch(staleDays, () => void dashboard.loadOverview());
onMounted(() => setRefreshHandler(dashboard.loadAll));
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  dashboard.cancel();
});

// ─── المؤشرات والأولوية ──────────────────────────────────────────────────
// كل عدد يظهر في شريط الملخّص مرة واحدة؛ الأقسام تحته تعرض السجلات نفسها.
const kpis = computed<KpiItem[]>(() => {
  const items: KpiItem[] = [];
  const counts = matching.value?.counts;
  const sum = (key: "with_matches" | "without_matches" | "open_requests") =>
    (counts?.sale?.[key] ?? 0) + (counts?.rental?.[key] ?? 0);
  if (canSeeAppointments.value)
    items.push({
      key: "appointments",
      label: "مواعيد اليوم",
      value: overview.value ? (overview.value.appointments?.today ?? 0) : null,
      note: overview.value?.appointments
        ? `خلال ${overview.value.appointments.days} أيام: ${formatNumber(overview.value.appointments.next_days, 0)}`
        : undefined,
      icon: "mdi-calendar-clock-outline",
      tone: "error",
      target: "appointments",
    });
  if (canMatch.value)
    items.push(
      {
        key: "matched",
        label: "طلبات لها مطابقة",
        value: matching.value ? sum("with_matches") : null,
        note: matching.value
          ? [
              counts?.sale
                ? `شراء ${formatNumber(counts.sale.with_matches, 0)}`
                : null,
              counts?.rental
                ? `إيجار ${formatNumber(counts.rental.with_matches, 0)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : undefined,
        icon: "mdi-handshake-outline",
        tone: "primary",
        target: "matches",
      },
      {
        key: "unmatched",
        label: "طلبات بلا مطابقة",
        value: matching.value ? sum("without_matches") : null,
        note: matching.value
          ? `من ${formatNumber(sum("open_requests"), 0)} طلباً مفتوحاً`
          : undefined,
        icon: "mdi-home-search-outline",
        tone: "warning",
        target: "risks",
      },
    );
  if (canSeeAppointments.value)
    items.push({
      key: "viewings",
      label: "معاينات بلا نتيجة",
      value: overview.value
        ? (overview.value.viewings_without_outcome?.total ?? 0)
        : null,
      note: overview.value?.viewings_without_outcome
        ? `خلال آخر ${overview.value.viewings_without_outcome.days} يوماً`
        : undefined,
      icon: "mdi-eye-check-outline",
      tone: "warning",
      target: "viewings",
    });
  if (can("properties.read") || can("rentals.read"))
    items.push({
      key: "stale",
      label: "عروض راكدة",
      value: overview.value
        ? (overview.value.stale_listings.sale?.total ?? 0) +
          (overview.value.stale_listings.rental?.total ?? 0)
        : null,
      note: overview.value
        ? `بلا نشاط منذ ${overview.value.stale_days} يوماً`
        : undefined,
      icon: "mdi-timer-sand",
      tone: "warning",
      target: "stale",
    });
  return items;
});

// الأولويات بعد أن يستقرّ كل قسم مسموح (بيانات أو خطأ): الملخّص يصل عادةً
// قبل المطابقة، فكانت الشريحة تقول «لا أعمال معلّقة» والمطابقات لم تصل بعد.
const overviewSettled = computed(
  () => overview.value !== null || overviewError.value !== null,
);
const matchingSettled = computed(
  () =>
    !canMatch.value || matching.value !== null || matchingError.value !== null,
);
const priorities = computed(() =>
  overviewSettled.value && matchingSettled.value
    ? priorityItems(overview.value, canMatch.value ? matching.value : null)
    : null,
);
// ما فُحص فعلاً، فلا تنفي عبارة الهدوء شيئاً عن قسم لم يُحمَّل أو لا يُسمح به.
const priorityScope = computed(() => ({
  appointments: overview.value !== null && canSeeAppointments.value,
  matching: matching.value !== null && canMatch.value,
  failed:
    overviewError.value !== null ||
    (canMatch.value && matchingError.value !== null),
}));

// ─── التنقّل داخل اللوحة ──────────────────────────────────────────────────
const decisionsTab = ref<"customers" | "appointments">("customers");
const SECTION_IDS: Record<DashboardSection, string> = {
  matches: "dash-matches",
  customers: "dash-decisions",
  appointments: "dash-decisions",
  risks: "risk-unmatched",
  stale: "risk-stale",
  viewings: "risk-viewings",
};
async function openSection(section: DashboardSection) {
  if (section === "appointments") decisionsTab.value = "appointments";
  if (section === "customers") decisionsTab.value = "customers";
  await nextTick();
  const element = document.getElementById(SECTION_IDS[section]);
  if (!element) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "start",
  });
  element.focus({ preventScroll: true });
}
// ─── الانتقال إلى السجلات ─────────────────────────────────────────────────
function openListing(target: { kind: OperationsKind; id: number }) {
  closeDrawers();
  if (target.kind === "sale") void router.push(`/properties/${target.id}`);
  else void router.push(`/rentals/${target.id}`);
}
function openPerson(personId: number) {
  closeDrawers();
  void router.push(`/clients/${personId}`);
}
function openRequest(target: { kind: OperationsKind; id: number }) {
  closeDrawers();
  void router.push(
    `${target.kind === "sale" ? "/purchase-requests" : "/rental-requests"}/${target.id}`,
  );
}
function openListingsByStatus(target: {
  kind: OperationsKind;
  status: string;
}) {
  if (target.kind === "sale") {
    showOnly({ status: target.status });
    void router.push("/properties");
  } else
    void router.push({ path: "/rentals", query: { status: target.status } });
}
// «عرض الكل» في الفرص المعرّضة للضياع: القائمة التي تحوي الفئة كاملة.
function openAll(target: {
  section: "unmatched" | "stale";
  kind: OperationsKind;
}) {
  if (target.section === "unmatched") {
    const mode = target.kind === "sale" ? "purchase" : "rental";
    useRequests(mode).filters.value = {
      ...emptyRequestFilters(),
      status: "open",
    };
    void router.push(
      mode === "purchase" ? "/purchase-requests" : "/rental-requests",
    );
    return;
  }
  // لا فلتر «راكد» في الخادم: المتاحة بأقدم تعديل أقرب تقريب، والرابط يقول ذلك.
  const oldest = [{ key: "updated_at", order: "asc" as const }];
  if (target.kind === "sale") {
    showOnly({ status: "available" });
    propertyList.sortBy.value = oldest;
    void router.push("/properties");
  } else {
    showRentalsOnly({ status: "available" });
    rentalList.sortBy.value = oldest;
    void router.push("/rentals");
  }
}

// ─── الألواح الجانبية والمتابعة ───────────────────────────────────────────
const matchOpen = ref(false);
const selectedMatch = ref<DashboardMatch | null>(null);
const customerOpen = ref(false);
const selectedCustomer = ref<DashboardCustomer | null>(null);
const followupOpen = ref(false);
const followupTarget = ref<FollowupTarget | null>(null);

function closeDrawers() {
  matchOpen.value = false;
  customerOpen.value = false;
}
function showMatch(match: DashboardMatch) {
  selectedMatch.value = match;
  matchOpen.value = true;
}
function showCustomerById(personId: number) {
  const customer =
    matching.value?.customers.items.find(
      (item) => item.person_id === personId,
    ) ?? customerFromMatches(personId);
  if (!customer) {
    if (can("people.read")) openPerson(personId);
    return;
  }
  selectedCustomer.value = customer;
  matchOpen.value = false;
  customerOpen.value = true;
}
/** زبون خارج أول ثمانية: يُبنى من طلباته الظاهرة في صفحة المطابقات. */
function customerFromMatches(personId: number): DashboardCustomer | null {
  const requests = matching.value?.items
    .map((item) => item.request)
    .filter((request) => request.person_id === personId);
  if (!requests?.length) return null;
  const first = requests[0];
  return {
    person_id: personId,
    person_code: first.person_code,
    person_name: first.person_name,
    person_phone: first.person_phone,
    open_requests: requests.length,
    requests_with_matches: requests.filter((request) => request.match_count)
      .length,
    total_matches: requests.reduce(
      (sum, request) => sum + request.match_count,
      0,
    ),
    oldest_request_at: requests.map((request) => request.created_at).sort()[0],
    last_request_update_at: requests
      .map((request) => request.updated_at)
      .sort()
      .at(-1)!,
    requests: requests.map((request) => ({
      kind: request.kind,
      id: request.id,
      code: request.code,
      property_type: request.property_type,
      match_count: request.match_count,
    })),
  };
}
function showCustomer(customer: DashboardCustomer) {
  selectedCustomer.value = customer;
  customerOpen.value = true;
}
function showUnmatched(request: DashboardRequest) {
  showCustomerById(request.person_id);
}
function recordFollowup(match: DashboardMatch) {
  followupTarget.value = {
    kind: match.offer.kind,
    listingId: match.offer.id,
    listingLabel: `${match.offer.code} · ${match.offer.name}`,
    notes: `تواصل مع ${match.request.person_name} بخصوص طلب ${match.request.code}.`,
  };
  followupOpen.value = true;
}
function openAppointment(item: DashboardAppointment) {
  openListing({ kind: item.kind, id: item.listing_id });
}

// ─── أوامر الترويسة ──────────────────────────────────────────────────────
const createItems = computed(() =>
  [
    {
      title: "عرض بيع",
      icon: "mdi-home-plus-outline",
      to: "/properties/new",
      show: can("properties.create"),
    },
    {
      title: "عرض إيجار",
      icon: "mdi-key-plus",
      to: "/rentals/new",
      show: can("rentals.create"),
    },
    {
      title: "طلب شراء",
      icon: "mdi-home-search-outline",
      to: "/purchase-requests?new=1",
      show: can("requests.create"),
    },
    {
      title: "طلب إيجار",
      icon: "mdi-home-search-outline",
      to: "/rental-requests?new=1",
      show: can("requests.create"),
    },
  ].filter((item) => item.show),
);
const backupRunning = ref(false);
async function runBackup() {
  backupRunning.value = true;
  try {
    await createBackup();
    notifySuccess("تم إنشاء نسخة احتياطية.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    backupRunning.value = false;
  }
}
</script>

<template>
  <AppPage title="لوحة التحكم">
    <template v-if="loadedAt" #status>
      <span class="ops__updated">آخر تحديث {{ formatTime(loadedAt) }}</span>
    </template>
    <template #header-actions>
      <v-menu v-if="createItems.length" location="bottom end">
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            color="primary"
            prepend-icon="mdi-plus"
            append-icon="mdi-chevron-down"
            >إضافة</v-btn
          >
        </template>
        <v-list density="compact" min-width="180">
          <v-list-item
            v-for="item in createItems"
            :key="item.to"
            :title="item.title"
            :prepend-icon="item.icon"
            @click="router.push(item.to)"
          />
        </v-list>
      </v-menu>
      <v-btn
        v-if="can('backups.create')"
        variant="text"
        prepend-icon="mdi-database-export"
        :loading="backupRunning"
        @click="runBackup"
        >نسخة احتياطية</v-btn
      >
    </template>

    <div class="ops">
      <SummaryStrip v-if="kpis.length" :items="kpis" @select="openSection" />
      <v-alert
        v-if="overviewError && !overview"
        type="warning"
        variant="tonal"
        density="compact"
        role="status"
      >
        تعذّر تحميل المواعيد وحالة العروض: {{ overviewError }}
        <template #append>
          <v-btn size="small" variant="text" @click="dashboard.loadOverview()"
            >إعادة المحاولة</v-btn
          >
        </template>
      </v-alert>
      <PriorityStrip
        :items="priorities"
        :scope="priorityScope"
        @select="openSection"
      />

      <!-- عمودان: المطابقات (عمل اليوم) ثم حالة العروض، وبجانبهما الزبائن
           والمواعيد ثم الفرص المعرّضة للضياع. -->
      <div class="ops__columns">
        <div class="ops__column">
          <div
            v-if="canMatch"
            id="dash-matches"
            tabindex="-1"
            class="ops__anchor"
          >
            <MatchWorkspace
              v-model:kind="kind"
              v-model:q="q"
              v-model:page="page"
              :data="matching"
              :loading="matchingLoading"
              :error="matchingError"
              :can-followup="canFollowup"
              @retry="dashboard.loadMatching()"
              @details="showMatch"
              @customer="showCustomerById"
              @listing="openListing"
              @followup="recordFollowup"
            />
          </div>
          <PerformanceSummary
            :overview="overview"
            @open="openListingsByStatus"
          />
        </div>
        <div class="ops__column">
          <div
            v-if="canMatch || canSeeAppointments"
            id="dash-decisions"
            tabindex="-1"
            class="ops__anchor"
          >
            <DecisionsPanel
              v-model:tab="decisionsTab"
              :matching="canMatch ? matching : null"
              :overview="overview"
              @customer="showCustomer"
              @appointment="openAppointment"
            />
          </div>
          <RiskPanel
            v-model:stale-days="staleDays"
            :matching="canMatch ? matching : null"
            :overview="overview"
            :stale-options="STALE_DAY_OPTIONS"
            @request="showUnmatched"
            @listing="openListing"
            @all="openAll"
          />
        </div>
      </div>
    </div>

    <MatchDetailsDrawer
      v-model="matchOpen"
      :match="selectedMatch"
      :can-followup="
        selectedMatch ? canFollowup(selectedMatch.offer.kind) : false
      "
      :can-open-person="can('people.read')"
      @customer="showCustomerById"
      @listing="openListing"
      @request="openRequest"
      @followup="recordFollowup"
    />
    <CustomerDrawer
      v-model="customerOpen"
      :customer="selectedCustomer"
      :can-read-person="can('people.read')"
      @person="openPerson"
      @listing="openListing"
      @request="openRequest"
    />
    <RecordFollowupDialog
      v-model="followupOpen"
      :target="followupTarget"
      @saved="dashboard.loadOverview()"
    />
  </AppPage>
</template>

<style scoped>
.ops {
  display: grid;
  gap: var(--dal-gutter);
  container-type: inline-size;
  container-name: ops;
}
.ops__columns {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
  gap: var(--dal-gutter);
  align-items: start;
}
.ops__column {
  display: grid;
  gap: var(--dal-gutter);
  min-width: 0;
}
.ops__anchor {
  min-width: 0;
  scroll-margin-top: 72px;
  outline: none;
}
.ops__updated {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
@container ops (max-width: 980px) {
  .ops__columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
