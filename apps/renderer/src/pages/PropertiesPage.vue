<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import PropertyFilters from "../components/properties/PropertyFilters.vue";
import PropertiesTable from "../components/properties/PropertiesTable.vue";

import ExcelImportDialog from "../components/properties/ExcelImportDialog.vue";
import MasterDetailLayout from "../components/shared/MasterDetailLayout.vue";
import PropertySummary from "../components/shared/PropertySummary.vue";
import { useProperties } from "../composables/useProperties";
import { usePropertyActions } from "../composables/usePropertyActions";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useFavorites } from "../composables/useFavorites";
import { usePermissions } from "../composables/usePermissions";
import { exportPropertyFolder } from "../utils/listingExport";
import { PROPERTY_SORT_OPTIONS } from "../constants/domain";
import { getErrorMessage } from "../services/api.service";
import type { PropertyRecord } from "../types";

const router = useRouter();
const {
  properties,
  total,
  loading,
  filters,
  list,
  applyFilters,
  reloadProperties,
  clearFilters,
} = useProperties();
// الصفحة والحجم والترتيب والمفضلة: مربوطة بالجدول وتُرسل إلى الخادم.
const { page, pageSize, sortBy, favoritesOnly, onTableOptions } = list;

const { notifyError, notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { favoriteIds, loadFavoriteIds } = useFavorites();
const { can } = usePermissions();

const selectedProperty = ref<PropertyRecord | null>(null);
const importOpen = ref(false);
// Details pane (Master–Detail): يعرض ملخّص الصف المحدد من بيانات القائمة نفسها.
const paneOpen = ref(false);

// الترتيب على الخادم (صفحة واحدة فقط محمّلة)، والمساحة فيه بالمتر المربع. قائمة
// "ترتيب" ورؤوس الأعمدة تكتبان نفس sortBy.
const sortValue = computed(() => list.currentSortValue(PROPERTY_SORT_OPTIONS));
function selectSort(value: string | null) {
  const option = PROPERTY_SORT_OPTIONS.find((item) => item.value === value);
  if (option) void list.setSort(option);
}

// عدّاد النتائج مع سياق البحث (لا عنوان كبير ولا بطاقة).
const resultsLabel = computed(() => {
  const n = total.value;
  if (filters.value.q)
    return `عدد النتائج المطابقة لـ "${filters.value.q}": ${n}`;
  return `عدد العروض: ${n}`;
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
    ) || favoritesOnly.value
  );
});

// اختيار سريع "المتاحة": نفس قيمة الفلتر الحالية (status=available) ذهاباً وإياباً.
function toggleAvailable() {
  filters.value.status =
    filters.value.status === "available" ? "" : "available";
}
// مسح كل شيء بما فيه المفضلة (يعيد نفس clearFilters الحالي).
function resetAll() {
  favoritesOnly.value = false;
  clearFilters();
}

async function refreshData() {
  await reloadProperties();
}

// إزالة عقار من المفضلة أثناء عرض المفضلة فقط: أعد تحميل الصفحة.
watch(favoriteIds, () => {
  if (favoritesOnly.value) void reloadProperties();
});

function viewDetails(property: PropertyRecord) {
  void router.push(`/properties/${property.id}`);
}

function editProperty(property: PropertyRecord) {
  void router.push(`/properties/${property.id}/edit`);
}

const { askArchive, askRestore, askDelete } = usePropertyActions(
  async (action, property) => {
    if (action === "delete" && selectedProperty.value?.id === property.id)
      selectedProperty.value = null;
    await refreshData();
  },
);

async function exportSelected() {
  try {
    if (!selectedProperty.value) {
      notifyError("اختر عقاراً أولاً لتصديره.");
      return;
    }
    const result = await exportPropertyFolder(selectedProperty.value);
    if (result.canceled) return;
    if (!result.ok) throw new Error(result.message ?? "تعذر تصدير العروض.");
    notifySuccess(
      `تم تصدير العقار مع صوره إلى: ${result.path ?? "المجلد المحدد"}`,
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
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

// نفس الصفحة والفلاتر من الزيارة السابقة، قبل أن يُظهر الجدول خياراته الأولى
// فلا يطلب الصفحة نفسها مرتين.
void reloadProperties();
onMounted(() => {
  setRefreshHandler(reloadProperties);
  void loadFavoriteIds();
});
</script>

<template>
  <AppPage title="العروض العقارية" subtitle="إدارة عروض البيع داخل المكتب.">
    <template #header-actions>
      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-if="can('properties.export')"
          variant="tonal"
          prepend-icon="mdi-folder-multiple-outline"
          :disabled="!selectedProperty"
          @click="exportSelected"
        >
          تصدير ملف نصي والصور
        </v-btn>
        <v-btn
          v-if="can('properties.create')"
          variant="tonal"
          prepend-icon="mdi-file-import-outline"
          @click="importOpen = true"
        >
          استيراد ملف إكسل
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

    <PropertyFilters v-model="filters" @apply="applyFilters" />

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
          :variant="sortValue === 'newest' ? 'flat' : 'text'"
          :color="sortValue === 'newest' ? 'primary' : undefined"
          @click="selectSort('newest')"
        >
          المضافة حديثاً
        </v-btn>
        <v-btn
          size="small"
          :variant="favoritesOnly ? 'flat' : 'text'"
          :color="favoritesOnly ? 'error' : undefined"
          prepend-icon="mdi-heart-outline"
          @click="list.setFavoritesOnly(!favoritesOnly)"
        >
          المفضلة
        </v-btn>
      </div>
      <v-spacer />
      <v-select
        :model-value="sortValue"
        :items="PROPERTY_SORT_OPTIONS"
        label="ترتيب"
        density="compact"
        hide-details
        class="dal-sort"
        @update:model-value="selectSort"
      />
    </div>

    <MasterDetailLayout
      :open="paneOpen && !!selectedProperty"
      @close="paneOpen = false"
    >
      <template #main>
        <PropertiesTable
          v-model:page="page"
          v-model:items-per-page="pageSize"
          v-model:sort-by="sortBy"
          :properties="properties"
          :total="total"
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
          @options="onTableOptions"
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

    <ExcelImportDialog v-model="importOpen" @imported="refreshData" />
  </AppPage>
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
  font-size: calc(13px * var(--dal-font-scale));
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
