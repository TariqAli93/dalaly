<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";
import {
  RENT_PERIODS,
  RENTAL_PROPERTY_TYPES,
  RENTAL_STATUSES,
} from "../../constants/domain";
import { useLocations } from "../../composables/useLocations";
import NumberField from "../app/NumberField.vue";
import FilterBar from "../shared/FilterBar.vue";
import type { FilterChip } from "../shared/grid";
import { AMENITY_OPTIONS } from "../../utils/amenities";
import { formatMoney } from "../../utils/format";
import type { RentalFilters } from "../../types";

/**
 * فلاتر العروض الإيجارية على شريط القوائم المشترك. لكل فلتر فعّال شريحة، ومنها
 * الغرف والحمامات والطوابق والمميزات التي كانت تُخفي عروضاً بلا أثر ظاهر.
 * المميزات مفاتيح القائمة نفسها في كائن JSON كما يقارنها الخادم (@>)؛ النص
 * الحر الذي كان هنا لم يكن JSON فلم يُصفِّ شيئاً.
 */
const model = defineModel<RentalFilters>({ required: true });
const emit = defineEmits<{ apply: []; clear: []; down: [] }>();
const bar = useTemplateRef<{ focusSearch: () => void }>("bar");

const {
  activeGovernorates,
  districtsByGovernorate,
  neighborhoodsByDistrict,
  loadLocations,
} = useLocations();
const districts = computed(() =>
  districtsByGovernorate(model.value.governorate_id),
);
const neighborhoods = computed(() =>
  neighborhoodsByDistrict(model.value.district_id),
);

const negotiableOptions = [
  { title: "قابل للتفاوض", value: "true" },
  { title: "غير قابل للتفاوض", value: "false" },
];

function selectGovernorate(value: number | null) {
  model.value.governorate_id = value;
  model.value.district_id = null;
  model.value.neighborhood_id = null;
}
function selectDistrict(value: number | null) {
  model.value.district_id = value;
  model.value.neighborhood_id = null;
}

function parseAmenities(value: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.keys(parsed).filter((key) => parsed[key] === true);
  } catch {
    return [];
  }
}
const amenityKeys = computed({
  get: () => parseAmenities(model.value.amenities),
  set: (keys: string[]) => {
    model.value.amenities = keys.length
      ? JSON.stringify(Object.fromEntries(keys.map((key) => [key, true])))
      : "";
  },
});
const amenityTitle = (key: string) =>
  AMENITY_OPTIONS.find((item) => item.key === key)?.title ?? key;

const titleOf = (items: { title: string; value: string }[], value: string) =>
  items.find((item) => item.value === value)?.title ?? value;

const chips = computed<FilterChip[]>(() => {
  const f = model.value;
  const list: FilterChip[] = [];
  if (f.q) list.push({ key: "q", label: `بحث: ${f.q}` });
  if (f.governorate_id)
    list.push({
      key: "governorate_id",
      label:
        activeGovernorates.value.find((g) => g.id === f.governorate_id)?.name ??
        "",
    });
  if (f.district_id)
    list.push({
      key: "district_id",
      label: districts.value.find((d) => d.id === f.district_id)?.name ?? "",
    });
  if (f.neighborhood_id)
    list.push({
      key: "neighborhood_id",
      label:
        neighborhoods.value.find((n) => n.id === f.neighborhood_id)?.name ?? "",
    });
  if (f.property_type)
    list.push({
      key: "property_type",
      label: titleOf(RENTAL_PROPERTY_TYPES, f.property_type),
    });
  if (f.status)
    list.push({ key: "status", label: titleOf(RENTAL_STATUSES, f.status) });
  if (f.rent_period)
    list.push({
      key: "rent_period",
      label: titleOf(RENT_PERIODS, f.rent_period),
    });
  if (f.negotiable)
    list.push({
      key: "negotiable",
      label: titleOf(negotiableOptions, f.negotiable),
    });
  if (f.rent_price_min || f.rent_price_max)
    list.push({
      key: "price",
      label: `إيجار ${f.rent_price_min ? formatMoney(f.rent_price_min) : "…"}–${f.rent_price_max ? formatMoney(f.rent_price_max) : "…"}`,
    });
  if (f.area_min || f.area_max)
    list.push({
      key: "area",
      label: `مساحة ${f.area_min || "…"}–${f.area_max || "…"}`,
    });
  if (f.rooms_count)
    list.push({ key: "rooms_count", label: `${f.rooms_count}+ غرف` });
  if (f.bathrooms_count)
    list.push({
      key: "bathrooms_count",
      label: `${f.bathrooms_count}+ حمامات`,
    });
  if (f.floors_count)
    list.push({ key: "floors_count", label: `${f.floors_count}+ طوابق` });
  for (const key of amenityKeys.value)
    list.push({ key: `amenity:${key}`, label: amenityTitle(key) });
  return list;
});

const INLINE_KEYS = new Set([
  "q",
  "governorate_id",
  "district_id",
  "neighborhood_id",
  "property_type",
  "status",
]);
const extraCount = computed(
  () => chips.value.filter((chip) => !INLINE_KEYS.has(chip.key)).length,
);

function removeChip(key: string) {
  const f = model.value;
  if (key.startsWith("amenity:")) {
    const name = key.slice("amenity:".length);
    amenityKeys.value = amenityKeys.value.filter((item) => item !== name);
  } else if (key === "price") {
    f.rent_price_min = "";
    f.rent_price_max = "";
  } else if (key === "area") {
    f.area_min = "";
    f.area_max = "";
  } else if (key === "governorate_id") selectGovernorate(null);
  else if (key === "district_id") selectDistrict(null);
  else if (key === "neighborhood_id") f.neighborhood_id = null;
  else (f as unknown as Record<string, string>)[key] = "";
}

onMounted(() => void loadLocations());

defineExpose({ focusSearch: () => bar.value?.focusSearch() });
</script>

<template>
  <FilterBar
    ref="bar"
    v-model:search="model.q"
    :filters="model"
    search-label="بحث في عروض الإيجار"
    placeholder="بحث بالرمز أو المالك أو الهاتف أو المنطقة"
    :chips="chips"
    :extra-count="extraCount"
    @apply="emit('apply')"
    @down="emit('down')"
    @remove="removeChip"
    @clear="emit('clear')"
  >
    <template #filters>
      <v-select
        :model-value="model.governorate_id"
        :items="activeGovernorates"
        item-title="name"
        item-value="id"
        label="المحافظة"
        hide-details
        clearable
        class="dal-toolbar__filter"
        @update:model-value="selectGovernorate"
      />
      <v-select
        :model-value="model.district_id"
        :items="districts"
        item-title="name"
        item-value="id"
        label="المنطقة"
        :disabled="!model.governorate_id"
        hide-details
        clearable
        class="dal-toolbar__filter"
        @update:model-value="selectDistrict"
      />
      <v-select
        v-model="model.neighborhood_id"
        :items="neighborhoods"
        item-title="name"
        item-value="id"
        label="الحي"
        :disabled="!model.district_id"
        hide-details
        clearable
        class="dal-toolbar__filter"
      />
      <v-select
        :model-value="model.property_type || null"
        :items="RENTAL_PROPERTY_TYPES"
        label="النوع"
        hide-details
        clearable
        class="dal-toolbar__filter"
        @update:model-value="model.property_type = $event ?? ''"
      />
      <v-select
        :model-value="model.status || null"
        :items="RENTAL_STATUSES"
        label="الحالة"
        hide-details
        clearable
        class="dal-toolbar__filter"
        @update:model-value="model.status = $event ?? ''"
      />
    </template>
    <template #views><slot name="views" /></template>
    <template #end><slot name="end" /></template>
    <template #extra>
      <v-select
        :model-value="model.rent_period || null"
        :items="RENT_PERIODS"
        label="نوع الإيجار"
        hide-details
        clearable
        @update:model-value="model.rent_period = $event ?? ''"
      />
      <v-select
        :model-value="model.negotiable || null"
        :items="negotiableOptions"
        label="التفاوض"
        hide-details
        clearable
        @update:model-value="model.negotiable = $event ?? ''"
      />
      <div class="dal-extra__pair">
        <NumberField
          v-model="model.rent_price_min"
          :decimals="false"
          label="الإيجار من"
          hide-details
          clearable
        />
        <NumberField
          v-model="model.rent_price_max"
          :decimals="false"
          label="الإيجار إلى"
          hide-details
          clearable
        />
      </div>
      <div class="dal-extra__pair">
        <NumberField
          v-model="model.area_min"
          label="المساحة من"
          hide-details
          clearable
        />
        <NumberField
          v-model="model.area_max"
          label="المساحة إلى"
          hide-details
          clearable
        />
      </div>
      <div class="dal-extra__pair">
        <NumberField
          v-model="model.rooms_count"
          :decimals="false"
          label="الغرف (على الأقل)"
          hide-details
          clearable
        />
        <NumberField
          v-model="model.bathrooms_count"
          :decimals="false"
          label="الحمامات (على الأقل)"
          hide-details
          clearable
        />
      </div>
      <NumberField
        v-model="model.floors_count"
        :decimals="false"
        label="الطوابق (على الأقل)"
        hide-details
        clearable
      />
      <fieldset class="rental-filters__amenities">
        <legend>المميزات (كلها مطلوبة)</legend>
        <v-chip-group v-model="amenityKeys" column multiple>
          <v-chip
            v-for="item in AMENITY_OPTIONS"
            :key="item.key"
            :value="item.key"
            filter
            size="small"
            variant="outlined"
            >{{ item.title }}</v-chip
          >
        </v-chip-group>
      </fieldset>
    </template>
  </FilterBar>
</template>

<style scoped>
.rental-filters__amenities {
  border: 0;
  margin: 0;
  padding: 0;
}
.rental-filters__amenities legend {
  margin-bottom: 4px;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
</style>
