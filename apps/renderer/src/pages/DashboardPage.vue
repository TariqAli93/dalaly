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
import QuickActions from "../components/dashboard/QuickActions.vue";
import AttentionQueue from "../components/dashboard/AttentionQueue.vue";
import MatchWorkspace from "../components/dashboard/MatchWorkspace.vue";
import RiskPanel from "../components/dashboard/RiskPanel.vue";
import PerformanceSummary from "../components/dashboard/PerformanceSummary.vue";
import WorkSummary from "../components/dashboard/WorkSummary.vue";
import DealDialog from "../components/deals/DealDialog.vue";
import VoucherDialog from "../components/accounting/VoucherDialog.vue";
import { fetchBusinessSummary } from "../services/dashboard.service";
import * as commissionsService from "../services/commissions.service";
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
import type { DashboardSection, KpiItem } from "../utils/dashboardKpi";
import {
  attentionItems,
  attentionTotals,
  type AttentionItem,
} from "../utils/attentionQueue";
import {
  formatAmount,
  formatNumber,
  formatShortDate,
  formatTime,
} from "../utils/format";
import { commissionCollection } from "../utils/commissionVouchers";
import { rentReceipt } from "../utils/leaseVouchers";
import type {
  BusinessSummary,
  DashboardAppointment,
  DashboardCustomer,
  DashboardMatch,
  DashboardRequest,
  DealPayload,
  DealRecord,
  CommissionRecord,
  FollowupTarget,
  OperationsKind,
  OverdueInstallmentRecord,
  VoucherDetail,
  VoucherPayload,
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
const canSeeTasks = computed(
  () =>
    (can("followups.read") && can("properties.read")) ||
    (can("rentals.followups.read") && can("rentals.read")) ||
    (can("followups.read") && can("people.read")),
);
function canFollowup(kindOf: OperationsKind) {
  return kindOf === "sale"
    ? can("followups.create")
    : can("rentals.followups.create");
}

// ─── التحميل ───────────────────────────────────────────────────────────
// يبدأ في setup قبل التركيب؛ تغيّر النوع أو البحث يعيد الصفحة الأولى.
void dashboard.loadAll();
// المهام والصفقات والزبائن والإيجارات ومال الشهر (/dashboard/business).
const business = ref<BusinessSummary | null>(null);
const businessError = ref<string | null>(null);
const businessLoading = ref(false);
let businessController: AbortController | null = null;
async function loadBusiness() {
  businessController?.abort();
  businessController = new AbortController();
  businessLoading.value = true;
  try {
    business.value = await fetchBusinessSummary(businessController.signal);
    businessError.value = null;
  } catch (cause) {
    if ((cause as { name?: string }).name !== "AbortError")
      businessError.value = getErrorMessage(cause);
  } finally {
    businessLoading.value = false;
  }
}
void loadBusiness();
// أقدم العمولات التي لم تُقبض كلها، لسطور «للتحصيل» (كانت لوح «العمولات غير
// المستلمة»): الطلب نفسه، خمس منها والعدد الكلي.
const COMMISSION_ROWS = 5;
const commissions = ref<CommissionRecord[] | null>(null);
const commissionTotal = ref<number | null>(null);
const commissionsError = ref<string | null>(null);
async function loadCommissions() {
  if (!can("commissions.read")) return;
  try {
    const result = await commissionsService.listCommissionsPage(
      { state: "open" },
      {
        page: 1,
        page_size: COMMISSION_ROWS,
        sort_by: "commission_date",
        sort_order: "asc",
      },
    );
    commissions.value = result.items;
    commissionTotal.value = result.total;
    commissionsError.value = null;
  } catch (cause) {
    commissionsError.value = getErrorMessage(cause);
  }
}
void loadCommissions();
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
onMounted(() =>
  setRefreshHandler(async () => {
    await Promise.all([dashboard.loadAll(), loadBusiness(), loadCommissions()]);
  }),
);
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  dashboard.cancel();
  businessController?.abort();
});

// ─── المؤشرات ───────────────────────────────────────────────────────────
// خمسة أرقام يُتصرَّف بها، كل منها يفتح قائمته الكاملة؛ ما لا يملك المستخدم
// صلاحيته لا يظهر، وما لم يصل قسمه بعد يظهر قيد التحميل (null).
const tasks = computed(() => business.value?.tasks ?? null);
const leases = computed(() => business.value?.leases ?? null);
const businessSettled = computed(
  () => business.value !== null || businessError.value !== null,
);
const kpis = computed<KpiItem[]>(() => {
  const items: KpiItem[] = [];
  const pending = !businessSettled.value;
  if (canSeeTasks.value && (pending || tasks.value)) {
    items.push(
      {
        key: "overdue",
        label: "مهام فات موعدها",
        value: tasks.value?.overdue.total ?? null,
        note: "مفتوحة ومضى موعدها",
        icon: "mdi-alarm",
        tone: "error",
        to: "/tasks?due=overdue",
      },
      {
        key: "today",
        label: "مواعيد ومهام اليوم",
        value: tasks.value?.today.total ?? null,
        note: tasks.value
          ? `خلال 7 أيام: ${formatNumber(tasks.value.week.total, 0)}`
          : undefined,
        icon: "mdi-calendar-today",
        tone: "primary",
        to: "/tasks?due=today",
      },
    );
  }
  if (can("leases.read") && (pending || leases.value))
    items.push({
      key: "installments",
      label: "أقساط إيجار متأخرة",
      value: leases.value?.overdue.total ?? null,
      note: leases.value?.overdue.by_currency.length
        ? leases.value.overdue.by_currency
            .map((row) => formatAmount(row.left, row.currency))
            .join(" · ")
        : undefined,
      icon: "mdi-home-clock-outline",
      tone: "error",
      to: "/leases?view=overdue",
    });
  if (can("commissions.read"))
    items.push({
      key: "commissions",
      label: "عمولات لم تُقبض",
      value: commissionTotal.value,
      note: "حتى اليوم",
      icon: "mdi-percent-circle-outline",
      tone: "warning",
      to: "/accounting?view=commissions&state=open",
    });
  if (canMatch.value) {
    const counts = matching.value?.counts;
    const sum = (key: "with_matches" | "without_matches") =>
      (counts?.sale?.[key] ?? 0) + (counts?.rental?.[key] ?? 0);
    items.push({
      key: "matched",
      label: "طلبات لها عروض مطابقة",
      value: matching.value ? sum("with_matches") : null,
      note: matching.value
        ? `بلا مطابقة: ${formatNumber(sum("without_matches"), 0)}`
        : undefined,
      icon: "mdi-handshake-outline",
      tone: "primary",
      target: "matches",
    });
  }
  return items;
});

// ─── يحتاج متابعتك ───────────────────────────────────────────────────────
const queuePermissions = { can, canFollowup };
const queueItems = computed<AttentionItem[] | null>(() =>
  businessSettled.value
    ? attentionItems(
        {
          business: business.value,
          overview: overview.value,
          matching: canMatch.value ? matching.value : null,
          commissions: commissions.value,
        },
        queuePermissions,
      )
    : null,
);
const queueTotals = computed(() =>
  attentionTotals({
    business: business.value,
    overview: overview.value,
    matching: canMatch.value ? matching.value : null,
    commissions: commissions.value,
    commissionTotal: commissionTotal.value,
  }),
);
// مصدر تعذّر تحميله يُذكر في القائمة نفسها، فلا يُقرأ غيابه «لا شيء ينتظرك».
const queueFailures = computed(() => {
  const failures: Array<{ key: string; label: string; retry: () => void }> = [];
  if (businessError.value)
    failures.push({
      key: "business",
      label: "المهام والأقساط والزبائن والصفقات",
      retry: () => void loadBusiness(),
    });
  if (overviewError.value)
    failures.push({
      key: "overview",
      label: "المواعيد والمعاينات",
      retry: () => void dashboard.loadOverview(),
    });
  if (commissionsError.value)
    failures.push({
      key: "commissions",
      label: "العمولات",
      retry: () => void loadCommissions(),
    });
  return failures;
});
// ما فُحص فعلاً، فلا تنفي «لا شيء ينتظرك» ما لم يُحمَّل أو لا يُسمح به.
const queueChecked = computed(() => {
  const checked: string[] = [];
  const summary = business.value;
  if (summary?.tasks) checked.push("المهام");
  if (summary?.leases) checked.push("أقساط الإيجار وانتهاؤه");
  if (commissions.value) checked.push("العمولات");
  if (summary?.customers || (canMatch.value && matching.value))
    checked.push("الزبائن");
  if (overview.value?.viewings_without_outcome) checked.push("المعاينات");
  if (summary?.deals) checked.push("الصفقات");
  return checked;
});
function act(item: AttentionItem) {
  const action = item.action;
  if (action.type === "route") void router.push(action.to);
  else if (action.type === "collect-commission") collect(action.commission);
  else if (action.type === "collect-installment")
    collectInstallment(action.installment);
  else if (action.type === "customer") showCustomer(action.customer);
  else recordViewing(action.appointment);
}

// ─── التنقّل داخل اللوحة ──────────────────────────────────────────────────
const SECTION_IDS: Record<DashboardSection, string> = {
  matches: "dash-matches",
  queue: "dash-queue",
};
async function openSection(section: DashboardSection) {
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
/** «تسجيل النتيجة» لمعاينة مضى موعدها: متابعة على عرضها. */
function recordViewing(item: DashboardAppointment) {
  followupTarget.value = {
    kind: item.kind,
    listingId: item.listing_id,
    listingLabel: `${item.listing_code} · ${item.listing_name}`,
    notes: "نتيجة المعاينة: ",
  };
  followupOpen.value = true;
}

// ─── من المطابقة إلى صفقة، ومن العمولة إلى قبضها ───────────────────────
// الطلب والعرض معروفان في المطابقة، فتبدأ الصفقة بزبونها وعرضها وطلبها.
const canDeal = computed(() => can("deals.create"));
const dealOpen = ref(false);
const dealPreset = ref<Partial<DealPayload> | null>(null);
function startDeal(match: DashboardMatch) {
  const sale = match.request.kind === "sale";
  dealPreset.value = {
    deal_type: sale ? "sale" : "rent",
    client_person_id: match.request.person_id,
    ...(sale
      ? { property_id: match.offer.id, purchase_request_id: match.request.id }
      : { rental_id: match.offer.id, rental_request_id: match.request.id }),
  };
  matchOpen.value = false;
  dealOpen.value = true;
}
function onDealSaved(deal: DealRecord) {
  notifySuccess(`أُنشئت الصفقة ${deal.code}.`);
  void router.push(`/deals/${deal.id}`);
}

const collectOpen = ref(false);
const collectPreset = ref<Partial<VoucherPayload> | null>(null);
const collectNote = ref("");
function collect(commission: CommissionRecord) {
  const { preset, note } = commissionCollection(commission);
  collectPreset.value = preset;
  collectNote.value = note;
  collectOpen.value = true;
}
/** القسط المتأخر: سند قبض المتبقي منه، أمانة لحساب المؤجر (leaseVouchers). */
function collectInstallment(row: OverdueInstallmentRecord) {
  const { preset, note } = rentReceipt(
    {
      id: row.lease_id,
      code: row.lease_code,
      currency: row.currency,
      landlord_person_id: row.landlord_person_id,
      landlord_name: row.landlord_name,
      tenant_person_id: row.tenant_person_id,
      tenant_name: row.tenant_name,
    },
    row,
  );
  collectPreset.value = preset;
  collectNote.value = note;
  collectOpen.value = true;
}
function onCollected(voucher: VoucherDetail) {
  notifySuccess(`صدر سند القبض ${voucher.code}.`, {
    label: "فتح السند للطباعة",
    run: () => void router.push(`/accounting/vouchers/${voucher.id}`),
  });
  void loadCommissions();
  void loadBusiness();
}

// ─── أوامر الترويسة ──────────────────────────────────────────────────────
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
      <span class="ops__updated"
        ><bdi dir="rtl">{{ formatShortDate(loadedAt) }}</bdi> · آخر تحديث
        <bdi dir="rtl">{{ formatTime(loadedAt) }}</bdi></span
      >
    </template>
    <template #header-actions>
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
      <QuickActions />
      <SummaryStrip v-if="kpis.length" :items="kpis" @select="openSection" />

      <!-- عمودان: «يحتاج متابعتك» أولاً (يمين الشاشة) لأنه ما يُفعل الآن، وتحته
           ملخّص العمل وحالة العروض؛ وبجانبه المطابقة والفرص المعرّضة للضياع. -->
      <div class="ops__columns">
        <div class="ops__column ops__column--queue">
          <div id="dash-queue" tabindex="-1" class="ops__anchor">
            <AttentionQueue
              :items="queueItems"
              :totals="queueTotals"
              :failures="queueFailures"
              :checked="queueChecked"
              @act="act"
            />
          </div>
          <WorkSummary :summary="business" />
          <PerformanceSummary
            :overview="overview"
            @open="openListingsByStatus"
          />
        </div>
        <div class="ops__column ops__column--main">
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
              :can-deal="canDeal"
              @retry="dashboard.loadMatching()"
              @details="showMatch"
              @customer="showCustomerById"
              @listing="openListing"
              @followup="recordFollowup"
              @deal="startDeal"
            />
          </div>
          <v-alert
            v-if="overviewError && !overview"
            type="warning"
            variant="tonal"
            density="compact"
            role="status"
          >
            تعذّر تحميل المواعيد وحالة العروض: {{ overviewError }}
            <template #append>
              <v-btn
                size="small"
                variant="text"
                @click="dashboard.loadOverview()"
                >إعادة المحاولة</v-btn
              >
            </template>
          </v-alert>
          <RiskPanel
            v-model:stale-days="staleDays"
            :matching="canMatch ? matching : null"
            :overview="overview"
            :stale-options="STALE_DAY_OPTIONS"
            :show-viewings="false"
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
      :can-deal="canDeal"
      @customer="showCustomerById"
      @listing="openListing"
      @request="openRequest"
      @followup="recordFollowup"
      @deal="startDeal"
    />
    <DealDialog v-model="dealOpen" :preset="dealPreset" @saved="onDealSaved" />
    <VoucherDialog
      v-model="collectOpen"
      kind="receipt"
      :preset="collectPreset"
      :allocation-note="collectNote"
      @saved="onCollected"
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
/* القائمة أولاً بعرض يكفي سطرها (السبب والتاريخ والزر)، والمطابقة أعرض: صفّها
   بجانبين (الطلب والعرض) يحتاج مكانه. */
.ops__columns {
  display: grid;
  grid-template-columns: minmax(340px, 1fr) minmax(0, 1.55fr);
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
  white-space: nowrap;
}
@container ops (max-width: 980px) {
  .ops__columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
