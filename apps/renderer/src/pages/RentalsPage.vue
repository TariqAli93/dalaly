<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
import { exportRentalFolder } from "../utils/listingExport";
import type {
  RentalFilters as RentalFiltersType,
  RentalRecord,
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
const items = ref<RentalRecord[]>([]);
const favoriteIds = ref(new Set<number>());
const loading = ref(false);
const selected = ref<RentalRecord | null>(null);
const detailsDialog = ref(false);
const paneOpen = ref(false);
const favOnly = ref(false);

type SortKey =
  | "newest"
  | "updated"
  | "price_asc"
  | "price_desc"
  | "area_desc"
  | "area_asc";
const sortBy = ref<SortKey>("newest");
const SORT_OPTIONS = [
  { value: "newest", title: "الأحدث" },
  { value: "updated", title: "آخر تحديث" },
  { value: "price_asc", title: "السعر: الأقل" },
  { value: "price_desc", title: "السعر: الأعلى" },
  { value: "area_desc", title: "المساحة: الأكبر أولاً" },
  { value: "area_asc", title: "المساحة: الأصغر أولاً" },
];

const num = (value: unknown) =>
  Number(typeof value === "string" ? value.replace(/,/g, "") : value) || 0;
const timeOf = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

function sortList(list: RentalRecord[]) {
  const result = [...list];
  switch (sortBy.value) {
    case "updated":
      return result.sort((a, b) => timeOf(b.updated_at) - timeOf(a.updated_at));
    case "price_asc":
      return result.sort((a, b) => num(a.rent_price) - num(b.rent_price));
    case "price_desc":
      return result.sort((a, b) => num(b.rent_price) - num(a.rent_price));
    case "area_desc":
      return result.sort((a, b) => num(b.area_value) - num(a.area_value));
    case "area_asc":
      return result.sort((a, b) => num(a.area_value) - num(b.area_value));
    case "newest":
    default:
      return result.sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at));
  }
}

const displayed = computed(() => {
  const base = favOnly.value
    ? items.value.filter((item) => favoriteIds.value.has(item.id))
    : items.value;
  return sortList(base);
});
const resultsLabel = computed(() => `${displayed.value.length} عرض إيجاري`);
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
    favOnly.value,
  );
});

async function load() {
  loading.value = true;
  try {
    const [result, favorites] = await Promise.all([
      rentals.listRentals(filters.value),
      rentals.listRentalFavoriteIds(),
    ]);
    items.value = result;
    favoriteIds.value = new Set(favorites.ids);

    console.log(result);
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

function clear() {
  filters.value = defaultFilters();
  void load();
}
function resetAll() {
  favOnly.value = false;
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
        await load();
        notifySuccess("تمت أرشفة الإيجار بنجاح.");
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
        await load();
        notifySuccess("تم إرجاع الإيجار بنجاح.");
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
        await load();
        notifySuccess("تم حذف الإيجار بنجاح.");
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
  setRefreshHandler(load);
  await load();
});
</script>

<template>
  <AppLayout
    title="الإيجارات"
    subtitle="إدارة محلية وسريعة للعروض الإيجارية داخل المكتب."
  >
    <template #header-actions>
      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-if="can('rentals.read')"
          variant="tonal"
          prepend-icon="mdi-folder-multiple-outline"
          :disabled="!selected"
          @click="exportSelected"
        >
          تصدير TXT والصور
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
          :variant="sortBy === 'newest' ? 'flat' : 'text'"
          :color="sortBy === 'newest' ? 'primary' : undefined"
          @click="sortBy = 'newest'"
          >المضافة حديثاً</v-btn
        >
        <v-btn
          size="small"
          :variant="favOnly ? 'flat' : 'text'"
          :color="favOnly ? 'error' : undefined"
          prepend-icon="mdi-heart-outline"
          @click="favOnly = !favOnly"
          >المفضلة</v-btn
        >
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
      :open="paneOpen && !!selected"
      @close="paneOpen = false"
    >
      <template #main>
        <RentalTable
          :rentals="displayed"
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
      :favorite="selected ? favoriteIds.has(selected.id) : false"
      :can-manage="can('rentals.update')"
      @favorite="favorite"
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
