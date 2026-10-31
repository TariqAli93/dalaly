<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import PersonEditor from "../components/people/PersonEditor.vue";
import PersonActivity from "../components/people/PersonActivity.vue";
import PersonDeals from "../components/deals/PersonDeals.vue";
import PersonMoney from "../components/people/PersonMoney.vue";
import LeaseList from "../components/leases/LeaseList.vue";
import DealDialog from "../components/deals/DealDialog.vue";
import DocumentViewer from "../components/documents/DocumentViewer.vue";
import RecordNotes from "../components/shared/RecordNotes.vue";
import RecordFacts from "../components/shared/RecordFacts.vue";
import DetailList from "../components/shared/DetailList.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import PhoneLink from "../components/shared/PhoneLink.vue";
import StatusChip from "../components/shared/StatusChip.vue";
import type { DetailSection, RecordFact } from "../components/shared/record";
import type { GridHeader } from "../components/shared/grid";
import * as peopleService from "../services/people.service";
import * as propertiesService from "../services/properties.service";
import * as rentalsService from "../services/rentals.service";
import * as requestsService from "../services/requests.service";
import * as documentsService from "../services/documents.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import { useConfirm } from "../composables/useConfirm";
import { createPagedList } from "../composables/usePagedList";
import {
  DOCUMENTS_DEFAULT_SORT,
  REQUESTS_DEFAULT_SORT,
  documentStatusColor,
  documentStatusLabel,
  personStatusColor,
  personStatusLabel,
  personRoleLabel,
  personSourceLabel,
  personTypeLabel,
  requestStatusColor,
  requestStatusLabel,
} from "../constants/crm";
import {
  PROPERTY_SORT_OPTIONS,
  RENT_PERIOD_LABELS,
  RENTAL_PROPERTY_LABELS,
  RENTAL_SORT_OPTIONS,
} from "../constants/domain";
import { formatDate, formatDateTime, formatMoney } from "../utils/format";
import {
  requestPath,
  requestPropertyTypeLabel,
  type RequestMode,
  type RequestRecord,
} from "../utils/requestForm";
import type {
  DocumentRecord,
  DocumentSortKey,
  ListSortOption,
  PageQuery,
  PagedResult,
  DealPayload,
  DealRecord,
  PersonDetailRecord,
  PersonRecord,
  PropertyRecord,
  PropertySortKey,
  PurchaseRequestSortKey,
  RentalRecord,
  RentalRequestSortKey,
  RentalSortKey,
} from "../types";

/**
 * ملف الزبون مركزاً لعمله مع المكتب: هاتفه بأزرار الاتصال في الأعلى، ثم
 * طلباته (شراء وإيجار) وما يملكه من عروض ومستمسكاته وملاحظاته وبياناته.
 * «طلب جديد» يفتح نموذج الطلب والزبون مختار فيه. كل القوائم من مرشّحات
 * person_id وowner_person_id القائمة في الخادم.
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifyError, notifySuccess } = useSnackbar();
const { openConfirm } = useConfirm();

const person = ref<PersonDetailRecord | null>(null);
const loading = ref(false);
const error = ref("");
const editOpen = ref(false);
const personId = ref<number | null>(null);
// النشاط أولاً: ما جرى مع الزبون وما هو مستحق، لمن يرى المتابعات.
const canSeeActivity = computed(
  () => can("people.read") && can(["followups.read", "rentals.followups.read"]),
);
const firstTab = () => (canSeeActivity.value ? "activity" : "requests");
const tab = ref(firstTab());

// صفقة جديدة والزبون هو المشتري أو المستأجر؛ العرض يُختار في الحوار.
const dealDialog = ref(false);
const dealPreset = computed<Partial<DealPayload> | null>(() =>
  person.value
    ? { deal_type: "sale", client_person_id: person.value.id }
    : null,
);
function onDealSaved(deal: DealRecord) {
  notifySuccess(`أُنشئت الصفقة ${deal.code}.`);
  void router.push(`/deals/${deal.id}`);
}
let requestId = 0;

// ─── قوائم الملف: صفحة من الخادم لكل قسم، بمرشّح الزبون ─────────────────
const BIG_PAGE = 100;
function personList<T, K extends string>(
  fetch: (
    id: number,
    page: PageQuery<K>,
    signal: AbortSignal,
  ) => Promise<PagedResult<T>>,
  sort: ListSortOption<K>,
) {
  const list = createPagedList<T, K>(
    (page, signal) => fetch(personId.value!, page, signal),
    sort,
    { onError: () => undefined },
  );
  list.pageSize.value = BIG_PAGE;
  return list;
}
const purchaseList = personList<RequestRecord, PurchaseRequestSortKey>(
  (id, page, signal) =>
    requestsService.listPurchaseRequestsPage({ person_id: id }, page, signal),
  REQUESTS_DEFAULT_SORT,
);
const rentalRequestList = personList<RequestRecord, RentalRequestSortKey>(
  (id, page, signal) =>
    requestsService.listRentalRequestsPage({ person_id: id }, page, signal),
  REQUESTS_DEFAULT_SORT,
);
const saleList = personList<PropertyRecord, PropertySortKey>(
  (id, page, signal) =>
    propertiesService.listPropertiesPage(
      { owner_person_id: id, include_archived: "true" },
      page,
      signal,
    ),
  PROPERTY_SORT_OPTIONS[0]!,
);
const rentalList = personList<RentalRecord, RentalSortKey>(
  (id, page, signal) =>
    rentalsService.listRentalsPage(
      { owner_person_id: id, include_archived: "true" },
      page,
      signal,
    ),
  RENTAL_SORT_OPTIONS[0]!,
);
const documentList = personList<DocumentRecord, DocumentSortKey>(
  (id, page, signal) =>
    documentsService.listDocumentsPage({ person_id: id }, page, signal),
  DOCUMENTS_DEFAULT_SORT,
);
const allLists = [
  purchaseList,
  rentalRequestList,
  saleList,
  rentalList,
  documentList,
];

function loadLists() {
  if (can("requests.read")) {
    void purchaseList.loadFirstPage();
    void rentalRequestList.loadFirstPage();
  }
  if (can("properties.read")) void saleList.loadFirstPage();
  if (can("rentals.read")) void rentalList.loadFirstPage();
  if (can("documents.read")) void documentList.loadFirstPage();
}

async function load() {
  const current = ++requestId;
  loading.value = true;
  error.value = "";
  for (const list of allLists) list.cancel();
  try {
    const id = Number(route.params.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("رقم الزبون غير صالح.");
    personId.value = id;
    // القوائم مع بيانات الزبون، لا بعدها.
    loadLists();
    const record = await peopleService.getPerson(id);
    if (current !== requestId) return;
    person.value = record;
  } catch (cause) {
    if (current === requestId) {
      person.value = null;
      error.value = getErrorMessage(cause);
    }
  } finally {
    if (current === requestId) loading.value = false;
  }
}
watch(
  () => route.params.id,
  () => {
    person.value = null;
    tab.value = firstTab();
    void load();
  },
  { immediate: true },
);
onMounted(() => setRefreshHandler(load));
onBeforeUnmount(() => {
  for (const list of allLists) list.cancel();
});

// ─── الهوية ─────────────────────────────────────────────────────────────
const residence = computed(() => {
  const p = person.value;
  if (!p) return "";
  return [p.governorate, p.district, p.neighborhood]
    .filter(Boolean)
    .join(" · ");
});
const facts = computed<RecordFact[]>(() => {
  const p = person.value;
  if (!p) return [];
  return [
    { key: "phone", label: "الهاتف", value: p.phone_primary },
    { key: "phone2", label: "هاتف إضافي", value: p.phone_secondary },
    {
      key: "residence",
      label: "السكن",
      value: residence.value || p.address,
      hint: residence.value ? p.address : null,
    },
    {
      key: "type",
      label: "النوع",
      value: personTypeLabel(p.person_type),
      hint: p.email,
    },
    {
      key: "roles",
      label: "صفته",
      value: roleLabels.value || "—",
      hint: personSourceLabel(p.source) || null,
    },
    {
      key: "assigned",
      label: "الموظف المتابع",
      value: p.assigned_user_name ?? "—",
    },
  ];
});
/** صفاته المسجلة وما تقوله سجلاته (مالك عرض، صاحب طلب، طرف عقد). */
const roleLabels = computed(() => {
  const p = person.value;
  if (!p) return "";
  return [...new Set([...p.roles, ...p.implied_roles])]
    .map(personRoleLabel)
    .join("، ");
});
const sections = computed<DetailSection[]>(() => {
  const p = person.value;
  if (!p) return [];
  return [
    {
      title: "الاتصال",
      items: [
        { label: "الهاتف الأساسي", value: p.phone_primary, ltr: true },
        { label: "هاتف إضافي", value: p.phone_secondary, ltr: true },
        { label: "البريد الإلكتروني", value: p.email, ltr: true },
      ],
    },
    {
      title: "الهوية",
      items: [
        { label: "الاسم الكامل", value: p.full_name },
        { label: "الرمز", value: p.code, ltr: true },
        { label: "النوع", value: personTypeLabel(p.person_type) },
        { label: "رقم البطاقة الوطنية", value: p.national_id, ltr: true },
        { label: "رقم بطاقة السكن", value: p.residence_card_number, ltr: true },
      ],
    },
    {
      title: "السكن",
      items: [
        { label: "المحافظة", value: p.governorate },
        { label: "القضاء أو الناحية", value: p.district },
        { label: "المنطقة أو المحلة", value: p.neighborhood },
        { label: "الزقاق", value: p.alley },
        { label: "الدار", value: p.house_number },
        { label: "العنوان", value: p.address },
      ],
    },
    {
      title: "التواريخ",
      items: [
        { label: "تاريخ الإضافة", value: formatDateTime(p.created_at) },
        { label: "آخر تحديث", value: formatDateTime(p.updated_at) },
      ],
    },
  ];
});

// ─── الأوامر ─────────────────────────────────────────────────────────────
function newRequest(kind: RequestMode) {
  void router.push({
    path: kind === "purchase" ? "/purchase-requests" : "/rental-requests",
    query: { new: "1", person: String(personId.value) },
  });
}
async function restore() {
  const p = person.value;
  if (!p) return;
  try {
    person.value = withImplied(await peopleService.restorePerson(p.id));
    notifySuccess(`أُعيد ${p.full_name} إلى الزبائن الحاليين.`);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
function askArchive() {
  const p = person.value;
  if (!p) return;
  openConfirm({
    title: `أرشفة ${p.full_name}`,
    body: "سيبقى الزبون وسجلّه محفوظين، لكنه لن يظهر في القائمة الافتراضية. تجده تحت «المؤرشفون» في تصفية الحالة.",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: async () => {
      person.value = withImplied(await peopleService.archivePerson(p.id));
      notifySuccess(`أُرشف ${p.full_name}.`, { label: "تراجع", run: restore });
    },
  });
}
function onSaved(saved: PersonRecord) {
  person.value = withImplied(saved);
}
/** A saved record keeps the roles implied by the records, which it lacks. */
function withImplied(record: PersonRecord): PersonDetailRecord {
  return { ...record, implied_roles: person.value?.implied_roles ?? [] };
}

// ─── أعمدة القوائم ───────────────────────────────────────────────────────
const requestHeaders = (mode: RequestMode): GridHeader[] => [
  { key: "code", title: "الطلب" },
  { key: "property_type", title: "النوع" },
  ...(mode === "rental"
    ? [{ key: "rent_period", title: "نوع الإيجار" } as GridHeader]
    : []),
  { key: "district", title: "الموقع", priority: 2 },
  { key: "budget_max", title: "الميزانية حتى (د.ع)", align: "end" },
  { key: "status", title: "الحالة" },
];
const saleHeaders: GridHeader[] = [
  { key: "name", title: "العرض" },
  { key: "property_type", title: "النوع" },
  { key: "district", title: "الموقع", priority: 2 },
  { key: "total_price", title: "السعر (د.ع)", align: "end" },
  { key: "status", title: "الحالة" },
];
const rentalHeaders: GridHeader[] = [
  { key: "name", title: "العرض" },
  { key: "property_type", title: "النوع" },
  { key: "district", title: "الموقع", priority: 2 },
  { key: "rent_price", title: "الإيجار (د.ع)", align: "end" },
  { key: "status", title: "الحالة" },
];
const documentHeaders: GridHeader[] = [
  { key: "document_name", title: "المستمسك" },
  { key: "document_type_name", title: "النوع" },
  { key: "document_number", title: "الرقم" },
  { key: "expires_at", title: "ينتهي في" },
  { key: "computed_status", title: "الحالة" },
  { key: "actions", title: "", align: "end", width: 56 },
];
const place = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ") || "—";

const requestsCount = computed(
  () => purchaseList.total.value + rentalRequestList.total.value,
);
const listingsCount = computed(
  () => saleList.total.value + rentalList.total.value,
);
const viewingDocument = ref<DocumentRecord | null>(null);
function openDocument(item: DocumentRecord) {
  viewingDocument.value = item;
}
const listLabel = (count: number, label: string) =>
  count ? `${label} (${count})` : label;
</script>

<template>
  <AppPage
    :title="person?.full_name ?? 'ملف الزبون'"
    :parent="{ to: '/people', label: 'الزبائن' }"
  >
    <template v-if="person" #status>
      <bdi class="text-medium-emphasis">{{ person.code }}</bdi>
      <StatusChip
        :status="person.status"
        :label="personStatusLabel(person.status)"
        :color="personStatusColor(person.status)"
      />
    </template>
    <template v-if="person" #header-actions>
      <v-btn
        v-if="can('deals.create') && person.status !== 'archived'"
        variant="text"
        prepend-icon="mdi-handshake-outline"
        @click="dealDialog = true"
        >صفقة جديدة</v-btn
      >
      <v-btn
        v-if="can('agreements.read')"
        variant="text"
        prepend-icon="mdi-file-sign"
        :to="`/contracts?person=${person.id}`"
        >العقود</v-btn
      >
      <v-btn
        v-if="can('people.update')"
        color="primary"
        prepend-icon="mdi-pencil-outline"
        @click="editOpen = true"
        >تعديل</v-btn
      >
      <v-menu
        v-if="can('requests.create') && person.status !== 'archived'"
        location="bottom end"
      >
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            variant="text"
            prepend-icon="mdi-plus"
            append-icon="mdi-chevron-down"
            >طلب جديد</v-btn
          >
        </template>
        <v-list density="compact" min-width="180">
          <v-list-item
            prepend-icon="mdi-home-search-outline"
            title="طلب شراء"
            @click="newRequest('purchase')"
          />
          <v-list-item
            prepend-icon="mdi-text-box-search-outline"
            title="طلب إيجار"
            @click="newRequest('rental')"
          />
        </v-list>
      </v-menu>
      <v-menu v-if="can('people.update')" location="bottom end">
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            icon="mdi-dots-horizontal"
            variant="text"
            aria-label="أوامر أخرى للزبون"
            title="أوامر أخرى"
          />
        </template>
        <v-list density="compact" min-width="200">
          <v-list-item
            v-if="person.status === 'archived'"
            prepend-icon="mdi-archive-arrow-up-outline"
            title="إرجاع من الأرشيف"
            @click="restore"
          />
          <v-list-item
            v-else
            prepend-icon="mdi-archive-arrow-down-outline"
            title="أرشفة"
            @click="askArchive"
          />
        </v-list>
      </v-menu>
    </template>

    <v-skeleton-loader v-if="loading && !person" type="table-heading, table" />
    <v-alert v-else-if="error" type="error" variant="tonal"
      >{{ error
      }}<template #append
        ><v-btn variant="text" @click="load">إعادة المحاولة</v-btn></template
      ></v-alert
    >
    <template v-else-if="person">
      <RecordFacts :facts="facts" label="بيانات الاتصال بالزبون">
        <template #phone>
          <PhoneLink :phone="person.phone_primary" :name="person.full_name" />
        </template>
        <template #phone2>
          <PhoneLink
            v-if="person.phone_secondary"
            :phone="person.phone_secondary"
            :name="person.full_name"
          />
          <span v-else>—</span>
        </template>
      </RecordFacts>

      <section class="dal-panel person-hub" aria-label="عمل الزبون مع المكتب">
        <v-tabs v-model="tab" color="primary" show-arrows>
          <v-tab v-if="canSeeActivity" value="activity">النشاط</v-tab>
          <v-tab v-if="can('deals.read')" value="deals">الصفقات</v-tab>
          <v-tab v-if="can('leases.read')" value="leases">الإيجارات</v-tab>
          <v-tab v-if="can('vouchers.read')" value="money">المال</v-tab>
          <v-tab v-if="can('requests.read')" value="requests">{{
            listLabel(requestsCount, "الطلبات")
          }}</v-tab>
          <v-tab
            v-if="can('properties.read') || can('rentals.read')"
            value="listings"
            >{{ listLabel(listingsCount, "العروض المملوكة") }}</v-tab
          >
          <v-tab v-if="can('documents.read')" value="documents">{{
            listLabel(documentList.total.value, "المستمسكات")
          }}</v-tab>
          <v-tab value="notes">الملاحظات</v-tab>
          <v-tab value="data">البيانات</v-tab>
        </v-tabs>
        <v-divider />
        <v-window v-model="tab" class="person-hub__body">
          <v-window-item v-if="canSeeActivity" value="activity">
            <PersonActivity
              :person-id="person.id"
              :person-name="person.full_name"
            />
          </v-window-item>
          <v-window-item v-if="can('deals.read')" value="deals">
            <PersonDeals :person-id="person.id" />
          </v-window-item>
          <v-window-item v-if="can('leases.read')" value="leases">
            <LeaseList
              :filters="{ person_id: person.id }"
              :person-id="person.id"
            />
          </v-window-item>
          <v-window-item v-if="can('vouchers.read')" value="money">
            <PersonMoney
              :person-id="person.id"
              :person-name="person.full_name"
            />
          </v-window-item>
          <v-window-item v-if="can('requests.read')" value="requests">
            <div
              v-for="section in [
                {
                  mode: 'purchase' as RequestMode,
                  title: 'طلبات الشراء',
                  list: purchaseList,
                },
                {
                  mode: 'rental' as RequestMode,
                  title: 'طلبات الإيجار',
                  list: rentalRequestList,
                },
              ]"
              :key="section.mode"
              class="person-hub__section"
            >
              <div class="person-hub__head">
                <h2 class="dal-section-title">{{ section.title }}</h2>
                <v-spacer />
                <v-btn
                  v-if="can('requests.create') && person.status !== 'archived'"
                  size="small"
                  variant="text"
                  prepend-icon="mdi-plus"
                  @click="newRequest(section.mode)"
                  >{{
                    section.mode === "purchase" ? "طلب شراء" : "طلب إيجار"
                  }}</v-btn
                >
              </div>
              <DataGrid
                :grid-key="`person:${section.mode}`"
                :table-label="`${section.title} للزبون`"
                :items="section.list.items.value"
                :headers="requestHeaders(section.mode)"
                :loading="section.list.loading.value"
                :error="section.list.error.value"
                compact
                :row-label="(item) => item.code"
                :empty="{
                  icon: 'mdi-home-search-outline',
                  title: `لا توجد ${section.title} لهذا الزبون`,
                }"
                @open="router.push(requestPath(section.mode, $event.id))"
                @retry="section.list.reload"
              >
                <template #item.code="{ item }">
                  <router-link
                    :to="requestPath(section.mode, item.id)"
                    class="record-link"
                    tabindex="-1"
                    ><bdi>{{ item.code }}</bdi></router-link
                  >
                </template>
                <template #item.property_type="{ item }">{{
                  requestPropertyTypeLabel(section.mode, item.property_type)
                }}</template>
                <template #item.rent_period="{ item }">{{
                  "rent_period" in item
                    ? (RENT_PERIOD_LABELS[item.rent_period ?? ""] ?? "—")
                    : "—"
                }}</template>
                <template #item.district="{ item }">{{
                  place(item.governorate, item.district, item.neighborhood)
                }}</template>
                <template #item.budget_max="{ item }">
                  <span v-if="item.budget_max" class="money">{{
                    formatMoney(item.budget_max)
                  }}</span>
                  <span v-else class="text-medium-emphasis">بلا حد</span>
                </template>
                <template #item.status="{ item }">
                  <v-chip
                    size="small"
                    variant="tonal"
                    label
                    :color="requestStatusColor(item.status)"
                    >{{ requestStatusLabel(item.status) }}</v-chip
                  >
                </template>
              </DataGrid>
            </div>
          </v-window-item>

          <v-window-item
            v-if="can('properties.read') || can('rentals.read')"
            value="listings"
          >
            <div v-if="can('properties.read')" class="person-hub__section">
              <div class="person-hub__head">
                <h2 class="dal-section-title">عروض البيع</h2>
              </div>
              <DataGrid
                grid-key="person:sale"
                table-label="عروض البيع التي يملكها الزبون"
                :items="saleList.items.value"
                :headers="saleHeaders"
                :loading="saleList.loading.value"
                :error="saleList.error.value"
                compact
                :row-label="(item) => item.name || `عقار ${item.code}`"
                :empty="{
                  icon: 'mdi-home-outline',
                  title: 'لا يملك عروض بيع مسجّلة',
                  text: 'تظهر هنا العروض المربوطة بالزبون مالكاً.',
                }"
                @open="router.push(`/properties/${$event.id}`)"
                @retry="saleList.reload"
              >
                <template #item.name="{ item }">
                  <div class="dal-cell-name">
                    <router-link
                      :to="`/properties/${item.id}`"
                      class="record-link"
                      tabindex="-1"
                      >{{ item.name || `عقار ${item.code}` }}</router-link
                    >
                    <bdi v-if="item.name">{{ item.code }}</bdi>
                  </div>
                </template>
                <template #item.district="{ item }">{{
                  place(item.district, item.neighborhood)
                }}</template>
                <template #item.total_price="{ item }">
                  <span class="money">{{ formatMoney(item.total_price) }}</span>
                </template>
                <template #item.status="{ item }">
                  <StatusChip :status="item.status" />
                </template>
              </DataGrid>
            </div>
            <div v-if="can('rentals.read')" class="person-hub__section">
              <div class="person-hub__head">
                <h2 class="dal-section-title">عروض الإيجار</h2>
              </div>
              <DataGrid
                grid-key="person:rental"
                table-label="عروض الإيجار التي يملكها الزبون"
                :items="rentalList.items.value"
                :headers="rentalHeaders"
                :loading="rentalList.loading.value"
                :error="rentalList.error.value"
                compact
                :row-label="(item) => item.name || `إيجار ${item.code}`"
                :empty="{
                  icon: 'mdi-key-outline',
                  title: 'لا يملك عروض إيجار مسجّلة',
                }"
                @open="router.push(`/rentals/${$event.id}`)"
                @retry="rentalList.reload"
              >
                <template #item.name="{ item }">
                  <div class="dal-cell-name">
                    <router-link
                      :to="`/rentals/${item.id}`"
                      class="record-link"
                      tabindex="-1"
                      >{{ item.name || `إيجار ${item.code}` }}</router-link
                    >
                    <bdi v-if="item.name">{{ item.code }}</bdi>
                  </div>
                </template>
                <template #item.property_type="{ item }">{{
                  RENTAL_PROPERTY_LABELS[item.property_type] ??
                  item.property_type
                }}</template>
                <template #item.district="{ item }">{{
                  place(item.district, item.neighborhood)
                }}</template>
                <template #item.rent_price="{ item }">
                  <span class="money">{{ formatMoney(item.rent_price) }}</span>
                  <small class="text-medium-emphasis">
                    {{ RENT_PERIOD_LABELS[item.rent_period] ?? "" }}</small
                  >
                </template>
                <template #item.status="{ item }">
                  <StatusChip :status="item.status" />
                </template>
              </DataGrid>
            </div>
          </v-window-item>

          <v-window-item v-if="can('documents.read')" value="documents">
            <div class="person-hub__section">
              <div class="person-hub__head">
                <h2 class="dal-section-title">المستمسكات</h2>
                <v-spacer />
                <v-btn
                  v-if="can('documents.manage')"
                  size="small"
                  variant="text"
                  prepend-icon="mdi-file-upload-outline"
                  :to="{
                    path: '/documents',
                    query: { person: String(person.id), new: '1' },
                  }"
                  >إضافة مستمسك</v-btn
                >
              </div>
              <DataGrid
                grid-key="person:documents"
                table-label="مستمسكات الزبون"
                :items="documentList.items.value"
                :headers="documentHeaders"
                :loading="documentList.loading.value"
                :error="documentList.error.value"
                compact
                :row-label="(item) => item.document_name"
                :actions="
                  (item) => [
                    {
                      key: 'file',
                      label: 'فتح الملف',
                      icon: 'mdi-file-eye-outline',
                      inline: true,
                      run: () => openDocument(item),
                    },
                  ]
                "
                :empty="{
                  icon: 'mdi-file-document-outline',
                  title: 'لا توجد مستمسكات لهذا الزبون',
                }"
                @open="openDocument"
                @retry="documentList.reload"
              >
                <template #item.document_type_name="{ item }">{{
                  item.document_type_name || "—"
                }}</template>
                <template #item.document_number="{ item }">
                  <bdi>{{ item.document_number || "—" }}</bdi>
                </template>
                <template #item.expires_at="{ item }">
                  <bdi dir="rtl">{{
                    item.expires_at ? formatDate(item.expires_at) : "—"
                  }}</bdi>
                </template>
                <template #item.computed_status="{ item }">
                  <v-chip
                    size="small"
                    variant="tonal"
                    label
                    :color="documentStatusColor(item.computed_status)"
                    >{{ documentStatusLabel(item.computed_status) }}</v-chip
                  >
                </template>
              </DataGrid>
            </div>
          </v-window-item>

          <v-window-item value="notes">
            <RecordNotes
              :notes="[{ label: 'ملاحظات الزبون', text: person.notes }]"
              :updated-at="person.updated_at"
              :can-edit="can('people.update')"
              @edit="editOpen = true"
            />
          </v-window-item>
          <v-window-item value="data">
            <DetailList :sections="sections" />
          </v-window-item>
        </v-window>
      </section>
      <PersonEditor v-model="editOpen" :person="person" @saved="onSaved" />
    </template>
    <DocumentViewer
      :document="viewingDocument"
      @close="viewingDocument = null"
    />
    <DealDialog
      v-model="dealDialog"
      :preset="dealPreset"
      @saved="onDealSaved"
    />
  </AppPage>
</template>

<style scoped>
.person-hub {
  margin-top: var(--dal-gutter);
}
.person-hub__body {
  padding: 8px 16px 16px;
}
.person-hub__section + .person-hub__section {
  margin-top: 16px;
}
.person-hub__head {
  display: flex;
  align-items: center;
  min-height: 36px;
}
.person-hub__head h2 {
  margin: 0;
}
.person-hub__section :deep(.dal-grid) {
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
  overflow: hidden;
}
</style>
