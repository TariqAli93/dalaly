<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import RentalFilters from "../components/rentals/RentalFilters.vue";
import RentalTable from "../components/rentals/RentalTable.vue";
import RentalSummary from "../components/rentals/RentalSummary.vue";
import RentalDetailsDialog from "../components/rentals/RentalDetailsDialog.vue";
import MasterDetailLayout from "../components/shared/MasterDetailLayout.vue";
import * as rentals from "../services/rentals.service";
import { getErrorMessage } from "../services/api.service";
import { useLocations } from "../composables/useLocations";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { useConfirm } from "../composables/useConfirm";
import { useRefresh } from "../composables/useRefresh";
import { createPagedList } from "../composables/usePagedList";
import { exportRentalFolder } from "../utils/listingExport";
import { RENTAL_SORT_OPTIONS } from "../constants/domain";
import type {
  RentalFilters as RentalFiltersType,
  RentalRecord,
  RentalSortKey,
} from "../types";

const router = useRouter();
const { loadLocations } = useLocations();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const { openConfirm } = useConfirm();
const { setRefreshHandler } = useRefresh();

const defaultFilters = (): RentalFiltersType => ({
  property_type: "",
  rent_period: "",
  rent_price_min: "",
  rent_price_max: "",
  area_min: "",
  area_max: "",
  rooms_count: "",
  bathrooms_count: "",
  floors_count: "",
  governorate_id: null,
  district_id: null,
  neighborhood_id: null,
  status: "",
  negotiable: "",
  amenities: "",
  q: "",
});

const filters = ref<RentalFiltersType>(defaultFilters());
const favoriteIds = ref(new Set<number>());
const selected = ref<RentalRecord | null>(null);
const detailsDialog = ref(false);
const paneOpen = ref(false);

// صفحة واحدة من الخادم؛ الترتيب (والمساحة فيه بالمتر المربع) والمفضلة هناك.
const list = createPagedList<RentalRecord, RentalSortKey>(
  (page, signal) => rentals.listRentalsPage(filters.value, page, signal),
  RENTAL_SORT_OPTIONS[0],
);
const {
  items,
  total,
  loading,
  page,
  pageSize,
  sortBy,
  favoritesOnly,
  onTableOptions,
} = list;

const sortValue = computed(() => list.currentSortValue(RENTAL_SORT_OPTIONS));
function selectSort(value: string | null) {
  const option = RENTAL_SORT_OPTIONS.find((item) => item.value === value);
  if (option) void list.setSort(option);
}

const resultsLabel = computed(() => `عدد العروض الإيجارية: ${total.value}`);
const hasActiveFilters = computed(() => {
  const filter = filters.value;
  return Boolean(
    filter.q ||
    filter.property_type ||
    filter.rent_period ||
    filter.status ||
    filter.governorate_id ||
    filter.district_id ||
    filter.neighborhood_id ||
    filter.rent_price_min ||
    filter.rent_price_max ||
    filter.area_min ||
    filter.area_max ||
    filter.rooms_count ||
    filter.bathrooms_count ||
    filter.floors_count ||
    filter.negotiable ||
    filter.amenities ||
    favoritesOnly.value,
  );
});

async function loadFavoriteIds() {
  try {
    favoriteIds.value = new Set((await rentals.listRentalFavoriteIds()).ids);
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
/** فلاتر جديدة: من الصفحة الأولى. */
function load() {
  return list.loadFirstPage();
}
/** بعد أرشفة أو حذف أو تحديث: نفس الصفحة. */
async function reload() {
  await Promise.all([list.reload(), loadFavoriteIds()]);
}

function clear() {
  filters.value = defaultFilters();
  void load();
}
function resetAll() {
  favoritesOnly.value = false;
  clear();
}
function toggleAvailable() {
  filters.value.status =
    filters.value.status === "available" ? "" : "available";
}
function view(item: RentalRecord) {
  selected.value = item;
  detailsDialog.value = true;
}
function selectRow(item: RentalRecord) {
  selected.value = item;
  paneOpen.value = true;
}
function edit(item: RentalRecord) {
  detailsDialog.value = false;
  void router.push(`/rentals/${item.id}/edit`);
}
function favorite(item: RentalRecord) {
  const isFavorite = favoriteIds.value.has(item.id);
  const request = isFavorite
    ? rentals.removeRentalFavorite(item.id)
    : rentals.addRentalFavorite(item.id);
  void request
    .then(() => {
      const next = new Set(favoriteIds.value);
      if (isFavorite) next.delete(item.id);
      else next.add(item.id);
      favoriteIds.value = next;
      if (favoritesOnly.value) void list.reload();
    })
    .catch((error) => notifyError(getErrorMessage(error)));
}
function archive(item: RentalRecord) {
  openConfirm({
    title: `أرشفة ${item.code}`,
    body: "سيبقى العرض محفوظاً لكنه لن يظهر في القائمة الافتراضية.",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: async () => {
      try {
        await rentals.archiveRental(item.id);
        detailsDialog.value = false;
        await reload();
        notifySuccess("تمت أرشفة العرض الإيجاري.");
      } catch (error) {
        notifyError(getErrorMessage(error));
      }
    },
  });
}
function restore(item: RentalRecord) {
  openConfirm({
    title: `إرجاع ${item.code}`,
    body: "هل تريد إرجاع هذا الإيجار إلى حالة متاح؟",
    confirmText: "إرجاع",
    color: "success",
    onConfirm: async () => {
      try {
        await rentals.restoreRental(item.id);
        detailsDialog.value = false;
        await reload();
        notifySuccess("تم إرجاع العرض الإيجاري.");
      } catch (error) {
        notifyError(getErrorMessage(error));
      }
    },
  });
}
function remove(item: RentalRecord) {
  openConfirm({
    title: `حذف ${item.code}`,
    body: "سيتم حذف الإيجار وصوره ومتابعاته نهائياً.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      try {
        await rentals.deleteRental(item.id);
        detailsDialog.value = false;
        selected.value = null;
        await reload();
        notifySuccess("تم حذف العرض الإيجاري.");
      } catch (error) {
        notifyError(getErrorMessage(error));
      }
    },
  });
}

async function exportSelected() {
  try {
    if (!selected.value) {
      notifyError("اختر إيجاراً أولاً لتصديره.");
      return;
    }
    const result = await exportRentalFolder(selected.value);
    if (result.canceled) return;
    if (!result.ok) throw new Error(result.message ?? "تعذر تصدير الإيجارات.");
    notifySuccess(
      `تم تصدير الإيجار مع صوره إلى: ${result.path ?? "المجلد المحدد"}`,
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

onMounted(async () => {
  await loadLocations();
  setRefreshHandler(reload);
  await reload();
});
onBeforeUnmount(() => list.cancel());
</script>

<template>
  <AppLayout title="الإيجارات" subtitle="إدارة العروض الإيجارية داخل المكتب.">
    <template #header-actions>
      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-if="can('rentals.read')"
          variant="tonal"
          prepend-icon="mdi-folder-multiple-outline"
          :disabled="!selected"
          @click="exportSelected"
        >
          تصدير ملف نصي والصور
        </v-btn>
        <v-btn
          v-if="can('rentals.read')"
          variant="tonal"
          prepend-icon="mdi-heart-outline"
          @click="router.push('/rental-favorites')"
        >
          مفضلة الإيجارات
        </v-btn>
        <v-btn
          v-if="can('rentals.create')"
          color="primary"
          prepend-icon="mdi-plus"
          @click="router.push('/rentals/new')"
        >
          إضافة إيجار
        </v-btn>
      </div>
    </template>

    <RentalFilters v-model="filters" @apply="load" @clear="clear" />

    <div class="dal-resultsbar bg-surface pa-3 border">
      <span class="dal-resultsbar__count">{{ resultsLabel }}</span>
      <div class="dal-quickpicks">
        <v-btn
          size="small"
          :variant="filters.status === 'available' ? 'flat' : 'text'"
          :color="filters.status === 'available' ? 'primary' : undefined"
          @click="toggleAvailable"
          >المتاحة</v-btn
        >
        <v-btn
          size="small"
          :variant="sortValue === 'newest' ? 'flat' : 'text'"
          :color="sortValue === 'newest' ? 'primary' : undefined"
          @click="selectSort('newest')"
          >المضافة حديثاً</v-btn
        >
        <v-btn
          size="small"
          :variant="favoritesOnly ? 'flat' : 'text'"
          :color="favoritesOnly ? 'error' : undefined"
          prepend-icon="mdi-heart-outline"
          @click="list.setFavoritesOnly(!favoritesOnly)"
          >المفضلة</v-btn
        >
      </div>
      <v-spacer />
      <v-select
        :model-value="sortValue"
        :items="RENTAL_SORT_OPTIONS"
        label="ترتيب"
        density="compact"
        hide-details
        class="dal-sort"
        @update:model-value="selectSort"
      />
    </div>

    <MasterDetailLayout
      :open="paneOpen && !!selected"
      @close="paneOpen = false"
    >
      <template #main>
        <RentalTable
          v-model:page="page"
          v-model:items-per-page="pageSize"
          v-model:sort-by="sortBy"
          :rentals="items"
          :total="total"
          :favorite-ids="favoriteIds"
          :loading="loading"
          :selected-id="selected?.id ?? null"
          :has-filters="hasActiveFilters"
          @view="view"
          @edit="edit"
          @archive="archive"
          @restore="restore"
          @delete="remove"
          @favorite="favorite"
          @create="router.push('/rentals/new')"
          @select="selectRow"
          @clear-filters="resetAll"
          @options="onTableOptions"
        />
      </template>
      <template #detail>
        <RentalSummary
          v-if="selected"
          :rental="selected"
          :favorite="favoriteIds.has(selected.id)"
          @open="view(selected)"
          @edit="edit(selected)"
          @archive="archive(selected)"
          @restore="restore(selected)"
          @delete="remove(selected)"
          @favorite="favorite(selected)"
          @close="paneOpen = false"
        />
      </template>
    </MasterDetailLayout>

    <RentalDetailsDialog
      v-model="detailsDialog"
      :rental="selected"
      @edit="edit"
      @archive="archive"
      @restore="restore"
      @delete="remove"
    />
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
