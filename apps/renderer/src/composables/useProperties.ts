import { computed, ref } from "vue";
import { getErrorMessage } from "../services/api.service";
import * as propertiesService from "../services/properties.service";
import type { PropertyFilters, PropertyRecord } from "../types";
import { useSnackbar } from "./useSnackbar";

function emptyFilters(): PropertyFilters {
  return {
    property_type: "",
    legal_type: "",
    area_unit: "",
    pricing_method: "",
    status: "",
    district: "",
    governorate_id: null,
    district_id: null,
    price_min: "",
    price_max: "",
    q: "",
  };
}

const properties = ref<PropertyRecord[]>([]);
const loading = ref(false);
const filters = ref<PropertyFilters>(emptyFilters());

const filteredCountLabel = computed(() =>
  properties.value.length === 1
    ? "عرض واحد"
    : `${properties.value.length} عرض`,
);

const topDistricts = computed(() => {
  const counts = new Map<string, number>();
  for (const property of properties.value) {
    if (property.district) {
      counts.set(property.district, (counts.get(property.district) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));
});

async function loadProperties() {
  const { notifyError } = useSnackbar();
  loading.value = true;
  try {
    properties.value = await propertiesService.listProperties(filters.value);
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

function clearFilters() {
  filters.value = emptyFilters();
  void loadProperties();
}

function applyQuickFilter(key: "status" | "district" | "q", value: string) {
  filters.value[key] = value;
  void loadProperties();
}

export function useProperties() {
  return {
    properties,
    loading,
    filters,
    filteredCountLabel,
    topDistricts,
    loadProperties,
    clearFilters,
    applyQuickFilter,
    service: propertiesService,
  };
}
