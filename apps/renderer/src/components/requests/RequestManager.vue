<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../app/AppPage.vue";
import FilterBar from "../shared/FilterBar.vue";
import DataGrid from "../shared/DataGrid.vue";
import type {
  DataGridApi,
  FilterChip,
  GridHeader,
  RowAction,
} from "../shared/grid";
import RequestFormDialog from "./RequestFormDialog.vue";
import MatchingResultsDialog from "./MatchingResultsDialog.vue";
import { RENT_PERIOD_LABELS } from "../../constants/domain";
import {
  REQUEST_STATUSES,
  requestStatusColor,
  requestStatusLabel,
} from "../../constants/crm";
import * as requests from "../../services/requests.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { useRefresh } from "../../composables/useRefresh";
import { useLocations } from "../../composables/useLocations";
import { useRequests } from "../../composables/useRequests";
import { formatMoney } from "../../utils/format";
import { isDialogOpen } from "../../utils/dialog";
import {
  requestLabel,
  requestPath,
  requestPropertyTypeLabel,
  requestPropertyTypes,
  type RequestMode,
  type RequestRecord,
} from "../../utils/requestForm";
import type { MatchResult } from "../../types";

/**
 * قائمة طلبات الشراء أو الإيجار بنمط القوائم الأخرى: لوح فيه شريط الفلاتر
 * (ومنها الحالة) والجدول. Enter أو النقر المزدوج يفتح صفحة الطلب ومطابقاته،
 * والتعديل والمطابقات أوامر في الصف. الحفظ والمطابقة خطوتان منفصلتان.
 */
const props = defineProps<{ mode: RequestMode }>();
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { notifyError, notifySuccess, notifyInfo } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { activeGovernorates, districtsByGovernorate, loadLocations } =
  useLocations();
const { filters, list, apply, clear } = useRequests(props.mode);
const { items, total, loading, error, page, pageSize, sortBy, onTableOptions } =
  list;

const grid = useTemplateRef<DataGridApi>("grid");
const label = computed(() => requestLabel(props.mode));
const title = computed(() =>
  props.mode === "rental" ? "طلبات الإيجار" : "طلبات الشراء",
);
const isRental = computed(() => props.mode === "rental");
const propertyItems = computed(() => requestPropertyTypes(props.mode));
const statusItems = [
  ...REQUEST_STATUSES,
  { title: "مؤرشف", value: "archived" },
];
const districtItems = computed(() =>
  districtsByGovernorate(filters.value.governorate_id),
);

// ─── الفلاتر ─────────────────────────────────────────────────────────────
function selectGovernorate(value: number | null) {
  filters.value.governorate_id = value;
  filters.value.district_id = null;
}
const openOnly = computed(() => filters.value.status === "open");
function toggleOpen() {
  filters.value.status = openOnly.value ? "" : "open";
}
const chips = computed<FilterChip[]>(() => {
  const f = filters.value;
  const result: FilterChip[] = [];
  if (f.q) result.push({ key: "q", label: `بحث: ${f.q}` });
  if (f.status)
    result.push({ key: "status", label: requestStatusLabel(f.status) });
  if (f.property_type)
    result.push({
      key: "property_type",
      label: requestPropertyTypeLabel(props.mode, f.property_type),
    });
  if (f.governorate_id)
    result.push({
      key: "governorate_id",
      label:
        activeGovernorates.value.find((g) => g.id === f.governorate_id)?.name ??
        "",
    });
  if (f.district_id)
    result.push({
      key: "district_id",
      label:
        districtItems.value.find((d) => d.id === f.district_id)?.name ?? "",
    });
  return result;
});
const hasFilters = computed(() => chips.value.length > 0);
function removeChip(key: string) {
  const f = filters.value;
  if (key === "governorate_id") selectGovernorate(null);
  else if (key === "district_id") f.district_id = null;
  else (f as unknown as Record<string, string>)[key] = "";
}

// ─── الجدول ──────────────────────────────────────────────────────────────
const headers = computed<GridHeader[]>(() => [
  { key: "code", title: "الطلب", sortable: true },
  { key: "person_name", title: "الزبون", sortable: true },
  { key: "property_type", title: "النوع", sortable: true },
  ...(isRental.value
    ? [
        {
          key: "rent_period",
          title: "نوع الإيجار",
          sortable: true,
          priority: 3 as const,
        },
      ]
    : []),
  { key: "district", title: "الموقع", sortable: true, priority: 2 },
  {
    key: "budget_max",
    title: "الميزانية (د.ع)",
    sortable: true,
    align: "end",
  },
  { key: "status", title: "الحالة", sortable: true },
  { key: "actions", title: "", align: "end", width: 96 },
]);
const locationOf = (item: RequestRecord) =>
  [item.governorate, item.district, item.neighborhood]
    .filter(Boolean)
    .join(" · ");
const customerOf = (item: RequestRecord) =>
  item.person_name || item.person_code || "—";
// الأرقام وحدها معزولة الاتجاه؛ «حتى» و«من» نص عربي يبقى في مكانه.
const budgetMin = (item: RequestRecord) =>
  item.budget_min ? formatMoney(item.budget_min) : null;
const budgetMax = (item: RequestRecord) =>
  item.budget_max ? formatMoney(item.budget_max) : null;
const rowLabel = (item: RequestRecord) =>
  `${label.value} ${item.code} · ${customerOf(item)}`;

function actionsOf(item: RequestRecord): RowAction[] {
  const actions: RowAction[] = [
    {
      key: "matches",
      label: "المطابقات",
      icon: "mdi-home-search-outline",
      inline: true,
      run: () => void showMatches(item),
    },
  ];
  if (can("requests.update"))
    actions.push({
      key: "edit",
      label: "تعديل",
      icon: "mdi-pencil-outline",
      inline: true,
      run: () => openEdit(item),
    });
  actions.push({
    key: "open",
    label: "فتح الطلب",
    icon: "mdi-open-in-app",
    run: () => openRecord(item),
  });
  if (can("people.read"))
    actions.push({
      key: "person",
      label: "فتح ملف الزبون",
      icon: "mdi-account-outline",
      run: () => void router.push(`/clients/${item.person_id}`),
    });
  return actions;
}

function openRecord(item: RequestRecord) {
  grid.value?.remember(item.id);
  void router.push(requestPath(props.mode, item.id));
}

// ─── النموذج والمطابقة ───────────────────────────────────────────────────
const dialog = ref(false);
const editing = ref<RequestRecord | null>(null);
const presetPerson = ref<number | null>(null);
const matchDialog = ref(false);
const matches = ref<MatchResult[]>([]);
const matchTitle = ref("العروض المطابقة");

function openCreate(personId: number | null = null) {
  editing.value = null;
  presetPerson.value = personId;
  dialog.value = true;
}
function openEdit(item: RequestRecord) {
  editing.value = item;
  presetPerson.value = null;
  dialog.value = true;
}
const fetchMatches = (id: number) =>
  props.mode === "rental"
    ? requests.rentalOfferMatches(id)
    : requests.purchaseOfferMatches(id);

async function onSaved(record: RequestRecord) {
  void list.reload();
  const openAction = {
    label: "فتح الطلب",
    run: () => void router.push(requestPath(props.mode, record.id)),
  };
  try {
    // المطابقة استشارية: فشلها لا يُبطل الحفظ ولا يعيد فتح النموذج.
    const result = await fetchMatches(record.id);
    matches.value = result.matches;
    matchTitle.value = `العروض المطابقة للطلب ${record.code}`;
    notifySuccess(
      `تم حفظ ${label.value} ${record.code}. العروض المطابقة: ${result.count}.`,
      openAction,
    );
    if (result.count) matchDialog.value = true;
  } catch {
    notifyInfo(
      `تم حفظ ${label.value} ${record.code}. تعذر عرض المطابقات الآن؛ افتحها من صفحة الطلب.`,
      openAction,
    );
  }
}
async function showMatches(item: RequestRecord) {
  try {
    const result = await fetchMatches(item.id);
    matches.value = result.matches;
    matchTitle.value = `العروض المطابقة للطلب ${item.code}`;
    matchDialog.value = true;
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
function openMatch(match: MatchResult) {
  const id = Number((match.record as { id?: number }).id);
  if (!id) return;
  matchDialog.value = false;
  void router.push(
    props.mode === "rental" ? `/rentals/${id}` : `/properties/${id}`,
  );
}

function onShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyN") return;
  if (event.altKey || event.shiftKey || !can("requests.create")) return;
  if (isDialogOpen()) return;
  event.preventDefault();
  openCreate();
}

// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void list.reload();
onMounted(() => {
  void loadLocations();
  setRefreshHandler(list.reload);
  window.addEventListener("keydown", onShortcut);
  // ?new=1 (من لوحة التحكم) و&person=<id> (من ملف الزبون).
  if (route.query.new && can("requests.create")) {
    const person = Number(route.query.person);
    openCreate(Number.isSafeInteger(person) && person > 0 ? person : null);
    void router.replace({ query: {} });
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onShortcut);
  list.cancel();
});
</script>

<template>
  <AppPage :title="title" :count="loading && !total ? null : total">
    <template #header-actions>
      <v-btn
        v-if="can('requests.create')"
        color="primary"
        prepend-icon="mdi-plus"
        :title="`إضافة ${label} (Ctrl+N)`"
        aria-keyshortcuts="Control+N"
        @click="openCreate()"
        >إضافة {{ label }}</v-btn
      >
    </template>

    <section class="dal-panel dal-listpanel dal-fill" :aria-label="title">
      <FilterBar
        v-model:search="filters.q"
        :filters="filters"
        :search-label="`بحث في ${title}`"
        placeholder="بحث برمز الطلب أو اسم الزبون أو هاتفه"
        :chips="chips"
        @apply="apply"
        @down="grid?.focusFirstRow()"
        @remove="removeChip"
        @clear="clear"
      >
        <template #filters>
          <v-select
            :model-value="filters.status || null"
            :items="statusItems"
            label="الحالة"
            hide-details
            clearable
            class="dal-toolbar__filter"
            @update:model-value="filters.status = $event ?? ''"
          />
          <v-select
            :model-value="filters.property_type || null"
            :items="propertyItems"
            label="النوع"
            hide-details
            clearable
            class="dal-toolbar__filter"
            @update:model-value="filters.property_type = $event ?? ''"
          />
          <v-select
            :model-value="filters.governorate_id"
            :items="activeGovernorates"
            item-title="name"
            item-value="id"
            label="المحافظة"
            hide-details
            clearable
            class="dal-toolbar__filter"
            @update:model-value="selectGovernorate"
          />
          <v-select
            v-model="filters.district_id"
            :items="districtItems"
            item-title="name"
            item-value="id"
            label="المنطقة"
            :disabled="!filters.governorate_id"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
        </template>
        <template #views>
          <div class="dal-views" role="group" aria-label="عرض سريع">
            <v-btn
              size="small"
              :variant="openOnly ? 'tonal' : 'text'"
              :color="openOnly ? 'primary' : undefined"
              :aria-pressed="openOnly"
              @click="toggleOpen"
              >المفتوحة</v-btn
            >
          </div>
        </template>
      </FilterBar>

      <DataGrid
        ref="grid"
        v-model:page="page"
        v-model:items-per-page="pageSize"
        v-model:sort-by="sortBy"
        :grid-key="`requests:${mode}`"
        :table-label="`جدول ${title}`"
        :items="items"
        :headers="headers"
        :total="total"
        :loading="loading"
        :error="error"
        :has-filters="hasFilters"
        :actions="actionsOf"
        :row-label="rowLabel"
        :empty="{
          icon: 'mdi-home-search-outline',
          title: `لا توجد ${title} بعد`,
          text: 'سجّل ما يطلبه الزبون لتظهر العروض المطابقة له.',
        }"
        :no-match="{ title: `لا توجد ${title} مطابقة للبحث والفلاتر الحالية` }"
        @open="openRecord"
        @retry="list.reload"
        @clear-filters="clear"
        @options="onTableOptions"
      >
        <template #item.code="{ item }">
          <router-link
            :to="requestPath(mode, item.id)"
            class="record-link"
            tabindex="-1"
            @click="grid?.remember(item.id)"
            ><bdi>{{ item.code }}</bdi></router-link
          >
        </template>
        <template #item.person_name="{ item }">
          <span class="dal-clip" :title="customerOf(item)">{{
            customerOf(item)
          }}</span>
        </template>
        <template #item.property_type="{ item }">{{
          requestPropertyTypeLabel(mode, item.property_type)
        }}</template>
        <template #item.rent_period="{ item }">{{
          "rent_period" in item
            ? (RENT_PERIOD_LABELS[item.rent_period ?? ""] ??
              item.rent_period ??
              "—")
            : "—"
        }}</template>
        <template #item.district="{ item }">
          <span class="dal-clip" :title="locationOf(item)">{{
            locationOf(item) || "—"
          }}</span>
        </template>
        <template #item.budget_max="{ item }">
          <template v-if="budgetMin(item) && budgetMax(item)"
            ><span class="money">{{ budgetMin(item) }}</span> –
            <span class="money">{{ budgetMax(item) }}</span></template
          >
          <template v-else-if="budgetMax(item)"
            >حتى <span class="money">{{ budgetMax(item) }}</span></template
          >
          <template v-else-if="budgetMin(item)"
            >من <span class="money">{{ budgetMin(item) }}</span></template
          >
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
        <template #empty-actions>
          <v-btn
            v-if="can('requests.create')"
            color="primary"
            prepend-icon="mdi-plus"
            @click="openCreate()"
            >إضافة {{ label }}</v-btn
          >
        </template>
      </DataGrid>
    </section>

    <RequestFormDialog
      v-model="dialog"
      :mode="mode"
      :request="editing"
      :person-id="presetPerson"
      @saved="onSaved"
    />
    <MatchingResultsDialog
      v-model="matchDialog"
      :matches="matches"
      :title="matchTitle"
      @open="openMatch"
    />
  </AppPage>
</template>
