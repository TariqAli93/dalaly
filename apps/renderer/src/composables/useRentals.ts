import { ref } from "vue";
import { RENTAL_SORT_OPTIONS } from "../constants/domain";
import * as rentalsService from "../services/rentals.service";
import { getErrorMessage } from "../services/api.service";
import { useSnackbar } from "./useSnackbar";
import type { RentalFilters, RentalRecord, RentalSortKey } from "../types";
import { createPagedList } from "./usePagedList";

export function emptyRentalFilters(): RentalFilters {
  return {
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
  };
}

// كما في useProperties: الفلاتر والصفحة والترتيب على مستوى الوحدة، فتبقى بين
// زيارات القائمة وتعود إليها Alt+← على الصف نفسه.
const filters = ref<RentalFilters>(emptyRentalFilters());
let requestedFilters = "";
const list = createPagedList<RentalRecord, RentalSortKey>((page, signal) => {
  requestedFilters = JSON.stringify(filters.value);
  return rentalsService.listRentalsPage(filters.value, page, signal);
}, RENTAL_SORT_OPTIONS[0]);
const favoriteIds = ref(new Set<number>());

function loadRentals() {
  return list.loadFirstPage();
}
/** شريط الفلاتر بعد توقّف الكتابة: لا يعيد طلب فلاتر أُرسلت قبله. */
function applyFilters() {
  if (JSON.stringify(filters.value) !== requestedFilters) return loadRentals();
}
function clearFilters() {
  filters.value = emptyRentalFilters();
  void loadRentals();
}
/** يفتح القائمة على هذه الفلاتر وحدها (من لوحة التحكم). */
function showOnly(partial: Partial<RentalFilters>) {
  filters.value = { ...emptyRentalFilters(), ...partial };
  list.page.value = 1;
}

async function loadFavoriteIds() {
  try {
    favoriteIds.value = new Set(
      (await rentalsService.listRentalFavoriteIds()).ids,
    );
  } catch (error) {
    useSnackbar().notifyError(getErrorMessage(error));
  }
}
async function toggleFavorite(id: number) {
  const isFavorite = favoriteIds.value.has(id);
  if (isFavorite) await rentalsService.removeRentalFavorite(id);
  else await rentalsService.addRentalFavorite(id);
  const next = new Set(favoriteIds.value);
  if (isFavorite) next.delete(id);
  else next.add(id);
  favoriteIds.value = next;
}

export function useRentals() {
  return {
    rentals: list.items,
    total: list.total,
    loading: list.loading,
    filters,
    list,
    favoriteIds,
    loadRentals,
    applyFilters,
    reloadRentals: list.reload,
    clearFilters,
    showOnly,
    loadFavoriteIds,
    toggleFavorite,
  };
}
