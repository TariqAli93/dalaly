import { computed, ref } from "vue";
import { getErrorMessage } from "../services/api.service";
import * as locationsService from "../services/locations.service";
import type { District, Governorate, Neighborhood } from "../types";
import { useSnackbar } from "./useSnackbar";

const governorates = ref<Governorate[]>([]);
const districts = ref<District[]>([]);
const neighborhoods = ref<Neighborhood[]>([]);
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

function neighborhoodsByDistrict(districtId: number | null) {
  if (!districtId) return [];
  return neighborhoods.value.filter(
    (n) => n.district_id === districtId && n.is_active,
  );
}

// الطلب الجاري: الصفحة وفلاترها أو حقول الموقع تطلب المواقع معاً عند فتحها،
// فيشتركون في طلب واحد.
let pending: Promise<void> | null = null;

async function fetchLocations() {
  const { notifyError } = useSnackbar();
  try {
    const result = await locationsService.getLocations();
    governorates.value = result.governorates;
    districts.value = result.districts;
    neighborhoods.value = result.neighborhoods ?? [];
    loaded.value = true;
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

/** force: بعد تعديل المواقع، طلب جديد ولو كان غيره جارياً. */
function loadLocations(force = false): Promise<void> {
  if (loaded.value && !force) return Promise.resolve();
  if (pending && !force) return pending;
  const request = fetchLocations().finally(() => {
    if (pending === request) pending = null;
  });
  pending = request;
  return request;
}

export function useLocations() {
  return {
    governorates,
    districts,
    neighborhoods,
    activeGovernorates,
    districtsByGovernorate,
    neighborhoodsByDistrict,
    loadLocations,
    service: locationsService,
  };
}
