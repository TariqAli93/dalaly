import { ref } from "vue";
import { getErrorMessage } from "../services/api.service";
import * as propertiesService from "../services/properties.service";
import type { PropertyFilters, PropertyRecord } from "../types";
import { useSnackbar } from "./useSnackbar";

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

const properties = ref<PropertyRecord[]>([]);
const loading = ref(false);
const filters = ref<PropertyFilters>(emptyFilters());

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

export function useProperties() {
  return {
    properties,
    loading,
    filters,
    loadProperties,
    clearFilters,
    service: propertiesService,
  };
}
