<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import LocationSelects from "../properties/LocationSelects.vue";
import StatusChip from "../shared/StatusChip.vue";
import NumberField from "../app/NumberField.vue";
import AppLayout from "../../layouts/AppLayout.vue";
import { PROPERTY_TYPES, RENTAL_PROPERTY_TYPES } from "../../constants/domain";
import * as customersService from "../../services/customers.service";
import * as requests from "../../services/requests.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { formatMoney } from "../../utils/format";
import type {
  CustomerRecord,
  MatchResult,
  PurchaseRequestRecord,
  RentalRequestRecord,
} from "../../types";

const props = defineProps<{ mode: "rental" | "purchase" }>();
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const rows = ref<Array<RentalRequestRecord | PurchaseRequestRecord>>([]);
const customers = ref<CustomerRecord[]>([]);
const loading = ref(false);
const dialog = ref(false);
const matchDialog = ref(false);
const saving = ref(false);
const editing = ref<(RentalRequestRecord | PurchaseRequestRecord) | null>(null);
const matches = ref<Array<MatchResult>>([]);
const q = ref("");
const form = ref({
  customer_id: null as number | null,
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
  { title: "العميل", key: "customer_name" },
  { title: "نوع العقار", key: "property_type" },
  ...(props.mode === "rental"
    ? [{ title: "نوع الإيجار", key: "rent_period" }]
    : []),
  { title: "الميزانية القصوى", key: "budget_max" },
  { title: "الموقع", key: "district" },
  { title: "الحالة", key: "status" },
]);
const isRental = computed(() => props.mode === "rental");

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
  return (
    {
      monthly: "شهري",
      semi_annual: "نصف سنوي",
      annual: "سنوي",
    }[item.rent_period ?? ""] ??
    item.rent_period ??
    "-"
  );
}

function handleRowClick(
  _event: Event,
  context: { item: RentalRequestRecord | PurchaseRequestRecord },
) {
  openEdit(context.item);
}
function matchKey(match: MatchResult) {
  return String((match.record as { id: number }).id);
}
function matchTitle(match: MatchResult) {
  const record = match.record as { name?: string; code?: string };
  return String(record.name || record.code || "offer");
}
function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
async function load() {
  loading.value = true;
  try {
    rows.value =
      props.mode === "rental"
        ? await requests.listRentalRequests({ q: q.value })
        : await requests.listPurchaseRequests({ q: q.value });
    customers.value = await customersService.listCustomers();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}
function resetForm() {
  form.value = {
    customer_id: null,
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
    customer_id: item.customer_id,
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
  if (!form.value.customer_id) {
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
    dialog.value = false;
    await load();
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
function openMatch(match: MatchResult) {
  const id = Number((match.record as { id?: number }).id);
  if (!id) return;
  void router.push(
    props.mode === "rental" ? `/rentals/${id}/edit` : `/properties/${id}/edit`,
  );
}
onMounted(async () => {
  await load();
  const requestedId = Number(route.query.open);
  if (!requestedId) return;
  const item = rows.value.find((row) => row.id === requestedId);
  if (item) openEdit(item);
});
</script>
<template>
  <AppLayout :title="title" subtitle="طلبات العملاء ومطابقتها بالعروض المتاحة.">
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
      ><v-data-table
        :headers="headers"
        :items="rows"
        :loading="loading"
        item-value="id"
        density="compact"
        hover
        @click:row="handleRowClick"
      >
        <template #item.customer_name="{ item }">{{
          item.customer_name || item.customer_code || "-"
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
          ><StatusChip :status="item.status"
        /></template> </v-data-table
    ></v-card>
    <v-dialog v-model="dialog" max-width="900"
      ><v-card
        ><v-card-title
          >{{ editing ? "تعديل" : "إضافة" }} {{ endpointLabel }}</v-card-title
        ><v-card-text
          ><div class="form-grid">
            <v-select
              v-model="form.customer_id"
              :items="customers"
              item-title="full_name"
              item-value="id"
              label="العميل"
            /><v-select
              v-model="form.property_type"
              :items="propertyItems"
              item-title="title"
              item-value="value"
              label="نوع العقار"
            /><v-select
              v-if="isRental"
              v-model="form.rent_period"
              :items="[
                { title: 'شهري', value: 'monthly' },
                { title: 'نصف سنوي', value: 'semi_annual' },
                { title: 'سنوي', value: 'annual' },
              ]"
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
            /><v-text-field
              v-model="form.area_unit"
              label="وحدة المساحة"
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
              :items="[
                { title: 'مفتوح', value: 'open' },
                { title: 'تمت المطابقة', value: 'matched' },
                { title: 'مغلق', value: 'closed' },
              ]"
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
    <v-dialog v-model="matchDialog" max-width="760"
      ><v-card
        ><v-card-title>العروض المطابقة: {{ matches.length }}</v-card-title
        ><v-card-text
          ><v-list lines="three"
            ><v-list-item
              v-for="match in matches"
              :key="String((match.record as { id: number }).id)"
              :title="
                String(
                  (match.record as { name?: string; code?: string }).name ||
                    (match.record as { code?: string }).code ||
                    'عرض',
                )
              "
              :subtitle="`نسبة المطابقة ${match.score}%`"
              @click="openMatch(match)"
              ><template #append
                ><v-chip size="small" color="success" variant="tonal"
                  >{{ match.score }}%</v-chip
                ></template
              >
              <div class="text-caption">
                {{
                  match.reasons
                    .filter((reason) => reason.matched)
                    .map((reason) => reason.detail)
                    .join(" · ")
                }}
              </div></v-list-item
            ></v-list
          ></v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn @click="matchDialog = false"
            >إغلاق</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
  </AppLayout>
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
