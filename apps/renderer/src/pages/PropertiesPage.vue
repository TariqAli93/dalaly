<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import PropertyFilters from "../components/properties/PropertyFilters.vue";
import PropertiesTable from "../components/properties/PropertiesTable.vue";
import PropertyDetailsDialog from "../components/properties/PropertyDetailsDialog.vue";
import ExcelImportDialog from "../components/properties/ExcelImportDialog.vue";
import MasterDetailLayout from "../components/shared/MasterDetailLayout.vue";
import PropertySummary from "../components/shared/PropertySummary.vue";
import { useProperties } from "../composables/useProperties";
import { useStats } from "../composables/useStats";
import { useConfirm } from "../composables/useConfirm";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useFavorites } from "../composables/useFavorites";
import { usePermissions } from "../composables/usePermissions";
import { exportPropertiesToXlsx } from "../utils/excel";
import type { PropertyRecord } from "../types";

const router = useRouter();
const { properties, loading, filters, loadProperties, clearFilters, service } =
  useProperties();
const { loadStats } = useStats();
const { openConfirm } = useConfirm();
const { notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { isFavorite, loadFavoriteIds } = useFavorites();
const { can } = usePermissions();

const detailsDialog = ref(false);
const selectedProperty = ref<PropertyRecord | null>(null);
const favOnly = ref(false);
const importOpen = ref(false);
// Details pane (Master–Detail): يعرض ملخّص الصف المحدد من بيانات القائمة نفسها.
const paneOpen = ref(false);

// فرز على البيانات المُحمّلة فقط (client-side) — لا يغيّر أي طلب أو عقد بحث.
type SortKey = "newest" | "updated" | "price_asc" | "price_desc" | "area";
const sortBy = ref<SortKey>("newest");
const SORT_OPTIONS = [
  { value: "newest", title: "الأحدث" },
  { value: "updated", title: "آخر تحديث" },
  { value: "price_asc", title: "السعر: الأقل" },
  { value: "price_desc", title: "السعر: الأعلى" },
  { value: "area", title: "المساحة" },
];
const num = (v: unknown) =>
  Number(typeof v === "string" ? v.replace(/,/g, "") : v) || 0;
const timeOf = (v: string) => {
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};
function sortList(list: PropertyRecord[]) {
  const arr = [...list];
  switch (sortBy.value) {
    case "updated":
      return arr.sort((a, b) => timeOf(b.updated_at) - timeOf(a.updated_at));
    case "price_asc":
      return arr.sort((a, b) => num(a.total_price) - num(b.total_price));
    case "price_desc":
      return arr.sort((a, b) => num(b.total_price) - num(a.total_price));
    case "area":
      return arr.sort((a, b) => num(b.area_value) - num(a.area_value));
    case "newest":
    default:
      return arr.sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at));
  }
}

const displayed = computed(() => {
  const base = favOnly.value
    ? properties.value.filter((p) => isFavorite(p.id))
    : properties.value;
  return sortList(base);
});

// عدّاد النتائج مع سياق البحث (لا عنوان كبير ولا بطاقة).
const resultsLabel = computed(() => {
  const n = displayed.value.length;
  if (filters.value.q) return `${n} نتيجة مطابقة لـ "${filters.value.q}"`;
  return `${n} ${n === 1 ? "عرض" : "عرض"}`;
});

// هل توجد فلاتر فعّالة؟ (لتمييز الحالة الفارغة ومسح الكل)
const hasActiveFilters = computed(() => {
  const f = filters.value;
  return (
    Boolean(
      f.q ||
      f.status ||
      f.property_type ||
      f.governorate_id ||
      f.district_id ||
      f.neighborhood_id ||
      f.legal_type ||
      f.area_unit ||
      f.pricing_method ||
      f.district ||
      f.plot_number ||
      f.plot_letter ||
      f.area_min ||
      f.area_max ||
      f.price_min ||
      f.price_max,
    ) || favOnly.value
  );
});

// اختيار سريع "المتاحة": نفس قيمة الفلتر الحالية (status=available) ذهاباً وإياباً.
function toggleAvailable() {
  filters.value.status =
    filters.value.status === "available" ? "" : "available";
}
// مسح كل شيء بما فيه المفضلة (يعيد نفس clearFilters الحالي).
function resetAll() {
  favOnly.value = false;
  clearFilters();
}

async function refreshData() {
  await Promise.all([loadProperties(), loadStats()]);
}

function viewDetails(property: PropertyRecord) {
  selectedProperty.value = property;
  detailsDialog.value = true;
}

function editProperty(property: PropertyRecord) {
  detailsDialog.value = false;
  void router.push(`/properties/${property.id}/edit`);
}

function askArchive(property: PropertyRecord) {
  openConfirm({
    title: `أرشفة ${property.code}`,
    body: "سيبقى العرض محفوظاً لكنه لن يظهر في القائمة الافتراضية.",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: async () => {
      await service.archiveProperty(property.id);
      detailsDialog.value = false;
      await refreshData();
      notifySuccess("تمت أرشفة العرض بنجاح.");
    },
  });
}

function askRestore(property: PropertyRecord) {
  openConfirm({
    title: `إرجاع ${property.code}`,
    body: "هل تريد إرجاع هذا العرض إلى حالة متاح؟",
    confirmText: "إرجاع",
    color: "success",
    onConfirm: async () => {
      await service.restoreProperty(property.id);
      detailsDialog.value = false;
      await refreshData();
      notifySuccess("تم إرجاع العرض إلى المتاح بنجاح.");
    },
  });
}

function askDelete(property: PropertyRecord) {
  openConfirm({
    title: `حذف ${property.code}`,
    body: "سيتم حذف العرض نهائياً من قاعدة البيانات. لا يمكن التراجع عن هذه العملية.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await service.deleteProperty(property.id);
      if (selectedProperty.value?.id === property.id)
        selectedProperty.value = null;
      detailsDialog.value = false;
      await refreshData();
      notifySuccess("تم حذف العرض بنجاح.");
    },
  });
}

function exportExcel() {
  exportPropertiesToXlsx(displayed.value);
  notifySuccess("تم تصدير العروض إلى Excel.");
}

// تحديد صف يفتح الـ Details pane (لا يفتح الحوار). الحوار الكامل يبقى عبر
// نفس حدث العرض الحالي (زر العين / زر "فتح التفاصيل" داخل الـ pane).
function selectRow(property: PropertyRecord) {
  selectedProperty.value = property;
  paneOpen.value = true;
}
function paneOpenDetails() {
  if (selectedProperty.value) viewDetails(selectedProperty.value);
}
function paneEdit() {
  if (selectedProperty.value) editProperty(selectedProperty.value);
}
function paneArchive() {
  if (selectedProperty.value) askArchive(selectedProperty.value);
}
function paneRestore() {
  if (selectedProperty.value) askRestore(selectedProperty.value);
}
function paneDelete() {
  if (selectedProperty.value) askDelete(selectedProperty.value);
}

onMounted(() => {
  setRefreshHandler(loadProperties);
  void loadProperties();
  void loadFavoriteIds();
});
</script>

<template>
  <AppLayout
    title="العروض العقارية"
    subtitle="إدارة محلية وسريعة لعروض البيع والتسويق داخل المكتب."
  >
    <template #header-actions>
      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-if="can('properties.export')"
          variant="tonal"
          prepend-icon="mdi-microsoft-excel"
          @click="exportExcel"
        >
          تصدير Excel
        </v-btn>
        <v-btn
          v-if="can('properties.create')"
          variant="tonal"
          prepend-icon="mdi-file-import-outline"
          @click="importOpen = true"
        >
          استيراد Excel
        </v-btn>
        <v-btn
          v-if="can('properties.create')"
          color="primary"
          prepend-icon="mdi-plus"
          @click="router.push('/properties/new')"
        >
          إضافة عرض
        </v-btn>
      </div>
    </template>

    <PropertyFilters
      v-model="filters"
      @apply="loadProperties"
      @clear="clearFilters"
    />

    <!-- شريط النتائج: العدد بسياقه، اختيارات سريعة، والفرز -->
    <div class="dal-resultsbar bg-surface pa-3 border">
      <span class="dal-resultsbar__count">{{ resultsLabel }}</span>
      <div class="dal-quickpicks">
        <v-btn
          size="small"
          :variant="filters.status === 'available' ? 'flat' : 'text'"
          :color="filters.status === 'available' ? 'primary' : undefined"
          @click="toggleAvailable"
        >
          المتاحة
        </v-btn>
        <v-btn
          size="small"
          :variant="sortBy === 'newest' ? 'flat' : 'text'"
          :color="sortBy === 'newest' ? 'primary' : undefined"
          @click="sortBy = 'newest'"
        >
          المضافة حديثاً
        </v-btn>
        <v-btn
          size="small"
          :variant="favOnly ? 'flat' : 'text'"
          :color="favOnly ? 'error' : undefined"
          prepend-icon="mdi-heart-outline"
          @click="favOnly = !favOnly"
        >
          المفضلة
        </v-btn>
      </div>
      <v-spacer />
      <v-select
        v-model="sortBy"
        :items="SORT_OPTIONS"
        label="ترتيب"
        density="compact"
        hide-details
        class="dal-sort"
      />
    </div>

    <MasterDetailLayout
      :open="paneOpen && !!selectedProperty"
      @close="paneOpen = false"
    >
      <template #main>
        <PropertiesTable
          :properties="displayed"
          :loading="loading"
          :selected-id="selectedProperty?.id ?? null"
          :has-filters="hasActiveFilters"
          @view="viewDetails"
          @edit="editProperty"
          @archive="askArchive"
          @restore="askRestore"
          @delete="askDelete"
          @create="router.push('/properties/new')"
          @select="selectRow"
          @clear-filters="resetAll"
        />
      </template>
      <template #detail>
        <PropertySummary
          v-if="selectedProperty"
          :property="selectedProperty"
          @open="paneOpenDetails"
          @edit="paneEdit"
          @archive="paneArchive"
          @restore="paneRestore"
          @delete="paneDelete"
          @close="paneOpen = false"
        />
      </template>
    </MasterDetailLayout>

    <PropertyDetailsDialog
      v-model="detailsDialog"
      :property="selectedProperty"
      @edit="editProperty"
      @archive="askArchive"
      @restore="askRestore"
      @delete="askDelete"
    />

    <ExcelImportDialog v-model="importOpen" @imported="refreshData" />
  </AppLayout>
</template>

<style scoped>
.dal-resultsbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 8px 0 10px;
}
.dal-resultsbar__count {
  font-size: 13px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
.dal-quickpicks {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dal-sort {
  max-width: 170px;
  flex: 0 0 auto;
}
</style>
