import { computed, ref } from "vue";
import { getErrorMessage } from "../services/api.service";
import * as locationsService from "../services/locations.service";
import type { District, Governorate } from "../types";
import { useSnackbar } from "./useSnackbar";

const governorates = ref<Governorate[]>([]);
const districts = ref<District[]>([]);
const loaded = ref(false);

const activeGovernorates = computed(() =>
  governorates.value.filter((g) => g.is_active),
);

function districtsByGovernorate(governorateId: number | null) {
  if (!governorateId) return [];
  return districts.value.filter(
    (d) => d.governorate_id === governorateId && d.is_active,
  );
}

async function loadLocations(force = false) {
  if (loaded.value && !force) return;
  const { notifyError } = useSnackbar();
  try {
    const result = await locationsService.getLocations();
    governorates.value = result.governorates;
    districts.value = result.districts;
    loaded.value = true;
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

export function useLocations() {
  return {
    governorates,
    districts,
    activeGovernorates,
    districtsByGovernorate,
    loadLocations,
    service: locationsService,
  };
}
