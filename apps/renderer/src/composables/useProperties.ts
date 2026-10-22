import { ref } from "vue";
import { PROPERTY_SORT_OPTIONS } from "../constants/domain";
import * as propertiesService from "../services/properties.service";
import type {
  PropertyFilters,
  PropertyRecord,
  PropertySortKey,
} from "../types";
import { createPagedList } from "./usePagedList";

function emptyFilters(): PropertyFilters {
  return {
    name: "",
    property_type: "",
    legal_type: "",
    area_unit: "",
    pricing_method: "",
    status: "",
    district: "",
    governorate_id: null,
    district_id: null,
    neighborhood_id: null,
    plot_number: "",
    plot_letter: "",
    area_min: "",
    area_max: "",
    price_min: "",
    price_max: "",
    q: "",
  };
}

const filters = ref<PropertyFilters>(emptyFilters());
// الصفحة الحالية من الخادم؛ الفلاتر والصفحة والترتيب تبقى بين زيارات الصفحة.
const list = createPagedList<PropertyRecord, PropertySortKey>(
  (page, signal) =>
    propertiesService.listPropertiesPage(filters.value, page, signal),
  PROPERTY_SORT_OPTIONS[0],
);

/** فلاتر جديدة (من الصفحة أو لوحة التحكم أو البحث العلوي): من الصفحة الأولى. */
function loadProperties() {
  return list.loadFirstPage();
}

function clearFilters() {
  filters.value = emptyFilters();
  void loadProperties();
}

export function useProperties() {
  return {
    properties: list.items,
    total: list.total,
    loading: list.loading,
    filters,
    list,
    loadProperties,
    reloadProperties: list.reload,
    clearFilters,
    service: propertiesService,
  };
}
