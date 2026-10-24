<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import LocationSelects from "../properties/LocationSelects.vue";
import PersonPicker from "../people/PersonPicker.vue";
import MatchingResultsDialog from "./MatchingResultsDialog.vue";
import NumberField from "../app/NumberField.vue";
import AppPage from "../app/AppPage.vue";
import {
  AREA_UNITS,
  LIST_PAGE_SIZES,
  PROPERTY_TYPES,
  RENT_PERIOD_LABELS,
  RENT_PERIODS,
  RENTAL_PROPERTY_TYPES,
} from "../../constants/domain";
import {
  REQUEST_STATUSES,
  REQUESTS_DEFAULT_SORT,
  requestStatusColor,
  requestStatusLabel,
} from "../../constants/crm";
import * as requests from "../../services/requests.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { createPagedList } from "../../composables/usePagedList";
import { formatMoney } from "../../utils/format";
import type {
  MatchResult,
  PageQuery,
  PurchaseRequestRecord,
  PurchaseRequestSortKey,
  RentalRequestRecord,
  RentalRequestSortKey,
} from "../../types";

const props = defineProps<{ mode: "rental" | "purchase" }>();
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const dialog = ref(false);
const matchDialog = ref(false);
const saving = ref(false);
const editing = ref<(RentalRequestRecord | PurchaseRequestRecord) | null>(null);
const matches = ref<Array<MatchResult>>([]);
const matchTitle = ref("العروض المطابقة");
const matchingId = ref<number | null>(null);
const q = ref("");
const form = ref({
  person_id: null as number | null,
  property_type: props.mode === "rental" ? "apartment" : PROPERTY_TYPES[0],
  rent_period: "monthly",
  budget_min: null as number | null,
  budget_max: null as number | null,
  area_unit: "متر",
  area_min: null as number | null,
  area_max: null as number | null,
  floors_count: null as number | null,
  rooms_count: null as number | null,
  bathrooms_count: null as number | null,
  governorate_id: null as number | null,
  district_id: null as number | null,
  neighborhood_id: null as number | null,
  governorate: "",
  district: "",
  neighborhood: "",
  amenities: {} as Record<string, unknown>,
  other_requirements: "",
  status: "open",
  notes: "",
});
const amenitiesInput = ref("");
const title = computed(() =>
  props.mode === "rental" ? "طلبات الإيجار" : "طلبات الشراء",
);
const endpointLabel = computed(() =>
  props.mode === "rental" ? "طلب إيجار" : "طلب شراء",
);
const propertyItems = computed(() =>
  props.mode === "rental"
    ? RENTAL_PROPERTY_TYPES
    : PROPERTY_TYPES.map((value) => ({ title: value, value })),
);
const headers = computed(() => [
  { title: "الرمز", key: "code" },
  { title: "الشخص", key: "person_name" },
  { title: "نوع العقار", key: "property_type" },
  ...(props.mode === "rental"
    ? [{ title: "نوع الإيجار", key: "rent_period" }]
    : []),
  { title: "الميزانية القصوى", key: "budget_max" },
  { title: "الموقع", key: "district" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false, align: "end" as const },
]);
const isRental = computed(() => props.mode === "rental");

// صفحة واحدة من الخادم؛ البحث والترتيب هناك. مفاتيح الأعمدة هي مفاتيح الترتيب
// (عمود نوع الإيجار لا يظهر في طلبات الشراء، فلا يصل مفتاحه إليها).
const list = createPagedList<
  RentalRequestRecord | PurchaseRequestRecord,
  RentalRequestSortKey
>(
  (page, signal) =>
    props.mode === "rental"
      ? requests.listRentalRequestsPage({ q: q.value }, page, signal)
      : requests.listPurchaseRequestsPage(
          { q: q.value },
          page as PageQuery<PurchaseRequestSortKey>,
          signal,
        ),
  REQUESTS_DEFAULT_SORT,
);
const {
  items: rows,
  total,
  loading,
  page,
  pageSize,
  sortBy,
  onTableOptions,
} = list;

function requestPropertyTypeLabel(value: string) {
  if (!isRental.value) return value;
  return (
    RENTAL_PROPERTY_TYPES.find((item) => item.value === value)?.title ?? value
  );
}

function requestRentPeriodLabel(
  item: RentalRequestRecord | PurchaseRequestRecord,
) {
  if (!("rent_period" in item)) return "-";
  return RENT_PERIOD_LABELS[item.rent_period ?? ""] ?? item.rent_period ?? "-";
}

function handleRowClick(
  _event: Event,
  context: { item: RentalRequestRecord | PurchaseRequestRecord },
) {
  openEdit(context.item);
}
function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
/** بحث جديد: من الصفحة الأولى. */
function load() {
  clearTimeout(searchTimer);
  return list.loadFirstPage();
}
// البحث يُطبَّق بعد توقّف الكتابة كبقية القوائم، وEnter يطبّقه فوراً.
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void list.loadFirstPage(), 300);
});

function resetForm() {
  form.value = {
    person_id: null,
    property_type: props.mode === "rental" ? "apartment" : PROPERTY_TYPES[0],
    rent_period: "monthly",
    budget_min: null,
    budget_max: null,
    area_unit: "متر",
    area_min: null,
    area_max: null,
    floors_count: null,
    rooms_count: null,
    bathrooms_count: null,
    governorate_id: null,
    district_id: null,
    neighborhood_id: null,
    governorate: "",
    district: "",
    neighborhood: "",
    amenities: {},
    other_requirements: "",
    status: "open",
    notes: "",
  };
  amenitiesInput.value = "";
}
function openCreate() {
  editing.value = null;
  resetForm();
  dialog.value = true;
}
function openEdit(item: RentalRequestRecord | PurchaseRequestRecord) {
  editing.value = item;
  form.value = {
    person_id: item.person_id,
    property_type: item.property_type,
    rent_period:
      "rent_period" in item ? (item.rent_period ?? "monthly") : "monthly",
    budget_min: numberOrNull(item.budget_min),
    budget_max: numberOrNull(item.budget_max),
    area_unit: item.area_unit ?? "متر",
    area_min: numberOrNull(item.area_min),
    area_max: numberOrNull(item.area_max),
    floors_count: item.floors_count,
    rooms_count: item.rooms_count,
    bathrooms_count: item.bathrooms_count,
    governorate_id: item.governorate_id,
    district_id: item.district_id,
    neighborhood_id: item.neighborhood_id,
    governorate: item.governorate ?? "",
    district: item.district ?? "",
    neighborhood: item.neighborhood ?? "",
    amenities: item.amenities,
    other_requirements: item.other_requirements ?? "",
    status: item.status,
    notes: item.notes ?? "",
  };
  amenitiesInput.value = Object.keys(item.amenities ?? {}).join(", ");
  dialog.value = true;
}
function payload() {
  const base = {
    ...form.value,
    budget_min: numberOrNull(form.value.budget_min),
    budget_max: numberOrNull(form.value.budget_max),
    area_min: numberOrNull(form.value.area_min),
    area_max: numberOrNull(form.value.area_max),
    amenities: Object.fromEntries(
      amenitiesInput.value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [value, true]),
    ),
  };
  if (props.mode === "rental") return base;
  const { rent_period: _rentPeriod, ...purchase } = base;
  return purchase;
}
async function save() {
  if (!form.value.person_id) {
    notifyError("اختر العميل أولاً.");
    return;
  }
  saving.value = true;
  try {
    let saved: RentalRequestRecord | PurchaseRequestRecord;
    if (props.mode === "rental")
      saved = editing.value
        ? await requests.updateRentalRequest(editing.value.id, payload())
        : await requests.createRentalRequest(payload());
    else
      saved = editing.value
        ? await requests.updatePurchaseRequest(editing.value.id, payload())
        : await requests.createPurchaseRequest(payload());
    const result =
      props.mode === "rental"
        ? await requests.rentalOfferMatches(saved.id)
        : await requests.purchaseOfferMatches(saved.id);
    matches.value = result.matches;
    matchTitle.value = "العروض المطابقة";
    dialog.value = false;
    await list.reload();
    notifySuccess(
      `تم حفظ ${endpointLabel.value}. العروض المطابقة: ${result.count}.`,
    );
    if (result.count) matchDialog.value = true;
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    saving.value = false;
  }
}
/** العروض المتاحة لطلب من الجدول، دون فتحه وحفظه. */
async function showMatches(item: RentalRequestRecord | PurchaseRequestRecord) {
  matchingId.value = item.id;
  try {
    const result =
      props.mode === "rental"
        ? await requests.rentalOfferMatches(item.id)
        : await requests.purchaseOfferMatches(item.id);
    matches.value = result.matches;
    matchTitle.value = `العروض المطابقة للطلب ${item.code}`;
    matchDialog.value = true;
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    matchingId.value = null;
  }
}
function openMatch(match: MatchResult) {
  const id = Number((match.record as { id?: number }).id);
  if (!id) return;
  matchDialog.value = false;
  void router.push(
    props.mode === "rental"
      ? { path: "/rentals", query: { open: String(id) } }
      : `/properties/${id}`,
  );
}
// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void list.reload();
onMounted(async () => {
  // ?new=1 من زر "إضافة" في لوحة التحكم.
  if (route.query.new && can("requests.create")) {
    openCreate();
    return;
  }
  // ?open=<id> من شاشة مطابقة العرض: الطلب قد لا يكون في الصفحة الأولى.
  const requestedId = Number(route.query.open);
  if (!requestedId) return;
  try {
    openEdit(
      props.mode === "rental"
        ? await requests.getRentalRequest(requestedId)
        : await requests.getPurchaseRequest(requestedId),
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
});
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  list.cancel();
});
</script>
<template>
  <AppPage :title="title" subtitle="طلبات العملاء ومطابقتها بالعروض المتاحة.">
    <template #header-actions
      ><v-btn
        v-if="can('requests.create')"
        color="primary"
        prepend-icon="mdi-plus"
        @click="openCreate"
        >إضافة {{ endpointLabel }}</v-btn
      ></template
    >
    <div class="d-flex ga-2 mb-3">
      <v-text-field
        v-model="q"
        label="بحث في الطلبات"
        prepend-inner-icon="mdi-magnify"
        hide-details
        @keyup.enter="load"
      /><v-btn variant="tonal" @click="load">بحث</v-btn>
    </div>
    <v-card variant="flat" border
      ><v-data-table-server
        v-model:page="page"
        v-model:items-per-page="pageSize"
        v-model:sort-by="sortBy"
        :headers="headers"
        :items="rows"
        :items-length="total"
        :items-per-page-options="LIST_PAGE_SIZES"
        :loading="loading"
        item-value="id"
        density="compact"
        hover
        @click:row="handleRowClick"
        @update:options="onTableOptions"
      >
        <template #item.person_name="{ item }">{{
          item.person_name || item.person_code || "-"
        }}</template
        ><template #item.property_type="{ item }">{{
          requestPropertyTypeLabel(item.property_type)
        }}</template
        ><template #item.rent_period="{ item }">{{
          requestRentPeriodLabel(item)
        }}</template
        ><template #item.budget_max="{ item }">{{
          item.budget_max === null || item.budget_max === undefined
            ? "بدون حد"
            : formatMoney(item.budget_max)
        }}</template
        ><template #item.district="{ item }">{{
          [item.governorate, item.district, item.neighborhood]
            .filter(Boolean)
            .join(" · ") || "-"
        }}</template
        ><template #item.status="{ item }"
          ><v-chip
            size="small"
            variant="tonal"
            label
            :color="requestStatusColor(item.status)"
            >{{ requestStatusLabel(item.status) }}</v-chip
          ></template
        ><template #item.actions="{ item }"
          ><v-btn
            v-if="item.status === 'open'"
            size="small"
            variant="text"
            color="primary"
            prepend-icon="mdi-home-search-outline"
            :loading="matchingId === item.id"
            @click.stop="showMatches(item)"
            >المطابقات</v-btn
          ></template
        >
      </v-data-table-server></v-card
    >
    <v-dialog v-model="dialog" max-width="900"
      ><v-card
        ><v-card-title
          >{{ editing ? "تعديل" : "إضافة" }} {{ endpointLabel }}</v-card-title
        ><v-card-text
          ><div class="form-grid">
            <PersonPicker v-model="form.person_id" label="العميل" /><v-select
              v-model="form.property_type"
              :items="propertyItems"
              item-title="title"
              item-value="value"
              label="نوع العقار"
            /><v-select
              v-if="isRental"
              v-model="form.rent_period"
              :items="RENT_PERIODS"
              label="نوع الإيجار"
            /><NumberField
              v-model="form.budget_min"
              label="الميزانية من"
              :decimals="false"
            /><NumberField
              v-model="form.budget_max"
              label="الميزانية إلى"
            /><v-text-field
              v-model="form.area_min"
              type="number"
              label="المساحة من"
            /><v-text-field
              v-model="form.area_max"
              type="number"
              label="المساحة إلى"
            /><v-select
              v-model="form.area_unit"
              :items="AREA_UNITS"
              label="وحدة المساحة"
              clearable
            /><v-text-field
              v-model="form.rooms_count"
              type="number"
              label="الغرف"
            /><v-text-field
              v-model="form.bathrooms_count"
              type="number"
              label="الحمامات"
            /><v-text-field
              v-model="form.floors_count"
              type="number"
              label="الطوابق"
            /><v-select
              v-model="form.status"
              :items="REQUEST_STATUSES"
              label="الحالة"
            />
          </div>
          <LocationSelects
            v-model:governorate-id="form.governorate_id"
            v-model:district-id="form.district_id"
            v-model:neighborhood-id="form.neighborhood_id"
            v-model:governorate-text="form.governorate"
            v-model:district-text="form.district"
            v-model:neighborhood-text="form.neighborhood" /><v-text-field
            v-model="amenitiesInput"
            label="المميزات (مفصولة بفواصل)" /><v-textarea
            v-model="form.other_requirements"
            label="متطلبات إضافية"
            rows="2" /><v-textarea
            v-model="form.notes"
            label="ملاحظات"
            rows="2" /></v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn variant="text" @click="dialog = false"
            >إلغاء</v-btn
          ><v-btn color="primary" :loading="saving" @click="save"
            >حفظ ومطابقة</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
    <MatchingResultsDialog
      v-model="matchDialog"
      :matches="matches"
      :title="matchTitle"
      @open="openMatch"
    />
  </AppPage>
</template>
<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 800px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
