<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";
import {
  AREA_UNITS,
  LEGAL_TYPES,
  PRICING_METHODS,
  PROPERTY_TYPES,
  STATUSES,
  statusLabel,
} from "../../constants/domain";
import { useLocations } from "../../composables/useLocations";
import NumberField from "../app/NumberField.vue";
import FilterBar from "../shared/FilterBar.vue";
import type { FilterChip } from "../shared/grid";
import { formatMoney } from "../../utils/format";
import type { PropertyFilters } from "../../types";

/**
 * فلاتر عروض البيع على شريط القوائم المشترك (FilterBar): البحث والموقع والنوع
 * والحالة ظاهرة، والباقي في «فلاتر إضافية». لكل فلتر فعّال شريحة.
 */
const model = defineModel<PropertyFilters>({ required: true });
const emit = defineEmits<{ apply: []; cleared: []; down: [] }>();
const bar = useTemplateRef<{ focusSearch: () => void }>("bar");

const {
  activeGovernorates,
  districtsByGovernorate,
  neighborhoodsByDistrict,
  loadLocations,
} = useLocations();
const districtItems = computed(() =>
  districtsByGovernorate(model.value.governorate_id),
);
const neighborhoodItems = computed(() =>
  neighborhoodsByDistrict(model.value.district_id),
);

// اختيار المحافظة يصفّر المنطقة والحي، واختيار المنطقة يصفّر الحي: بدونهما
// يبقى معرّف منطقة من محافظة أخرى فلا تظهر أي نتيجة ويُعرض المعرّف خاماً.
function selectGovernorate(value: number | null) {
  model.value.governorate_id = value;
  model.value.district_id = null;
  model.value.neighborhood_id = null;
}
function selectDistrict(value: number | null) {
  model.value.district_id = value;
  model.value.neighborhood_id = null;
}

function govName(id: number | null) {
  return activeGovernorates.value.find((g) => g.id === id)?.name ?? "";
}
function distName(id: number | null) {
  return districtItems.value.find((d) => d.id === id)?.name ?? "";
}
function neighName(id: number | null) {
  return neighborhoodItems.value.find((n) => n.id === id)?.name ?? "";
}

const chips = computed<FilterChip[]>(() => {
  const m = model.value;
  const list: FilterChip[] = [];
  if (m.q) list.push({ key: "q", label: `بحث: ${m.q}` });
  if (m.governorate_id)
    list.push({ key: "governorate_id", label: govName(m.governorate_id) });
  if (m.district_id)
    list.push({ key: "district_id", label: distName(m.district_id) });
  if (m.neighborhood_id)
    list.push({ key: "neighborhood_id", label: neighName(m.neighborhood_id) });
  if (m.property_type)
    list.push({ key: "property_type", label: m.property_type });
  if (m.status) list.push({ key: "status", label: statusLabel(m.status) });
  if (m.legal_type) list.push({ key: "legal_type", label: m.legal_type });
  if (m.area_unit) list.push({ key: "area_unit", label: m.area_unit });
  if (m.pricing_method)
    list.push({ key: "pricing_method", label: m.pricing_method });
  if (m.district) list.push({ key: "district", label: m.district });
  if (m.plot_number)
    list.push({ key: "plot_number", label: `قطعة ${m.plot_number}` });
  if (m.plot_letter)
    list.push({ key: "plot_letter", label: `حرف ${m.plot_letter}` });
  if (m.area_min || m.area_max)
    list.push({
      key: "area",
      label: `مساحة ${m.area_min || "…"}–${m.area_max || "…"}`,
    });
  if (m.price_min || m.price_max)
    list.push({
      key: "price",
      label: `سعر ${m.price_min ? formatMoney(m.price_min) : "…"}–${m.price_max ? formatMoney(m.price_max) : "…"}`,
    });
  return list;
});

// فلاتر اللوحة الجانبية وحدها، لعددها على زر «فلاتر إضافية».
const EXTRA_KEYS = [
  "legal_type",
  "area_unit",
  "pricing_method",
  "district",
  "plot_number",
  "plot_letter",
  "area",
  "price",
];
const extraCount = computed(
  () => chips.value.filter((chip) => EXTRA_KEYS.includes(chip.key)).length,
);

function removeChip(key: string) {
  const m = model.value;
  if (key === "area") {
    m.area_min = "";
    m.area_max = "";
  } else if (key === "price") {
    m.price_min = "";
    m.price_max = "";
  } else if (key === "governorate_id") {
    selectGovernorate(null);
  } else if (key === "district_id") {
    selectDistrict(null);
  } else if (key.endsWith("_id")) {
    (m as unknown as Record<string, number | null>)[key] = null;
  } else {
    (m as unknown as Record<string, string>)[key] = "";
  }
}

function clearAll() {
  Object.assign(model.value, {
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
  });
  emit("cleared");
}

onMounted(() => void loadLocations());

defineExpose({ focusSearch: () => bar.value?.focusSearch() });
</script>

<template>
  <FilterBar
    ref="bar"
    v-model:search="model.q"
    :filters="model"
    search-label="بحث في عروض البيع"
    placeholder="بحث بالمالك أو الهاتف أو رقم القطعة أو الرمز"
    :chips="chips"
    :extra-count="extraCount"
    @apply="emit('apply')"
    @down="emit('down')"
    @remove="removeChip"
    @clear="clearAll"
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
        :items="districtItems"
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
        :items="neighborhoodItems"
        item-title="name"
        item-value="id"
        label="الحي"
        :disabled="!model.district_id"
        hide-details
        clearable
        class="dal-toolbar__filter"
      />
      <!-- الفلتر الفارغ "" لا null: Vuetify يعدّه قيمة فيرفع الوسم فوق حقل فارغ. -->
      <v-select
        :model-value="model.property_type || null"
        :items="PROPERTY_TYPES"
        label="النوع"
        hide-details
        clearable
        class="dal-toolbar__filter"
        @update:model-value="model.property_type = $event ?? ''"
      />
      <v-select
        :model-value="model.status || null"
        :items="STATUSES"
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
        :model-value="model.legal_type || null"
        :items="LEGAL_TYPES"
        label="الصفة القانونية"
        hide-details
        clearable
        @update:model-value="model.legal_type = $event ?? ''"
      />
      <v-select
        :model-value="model.pricing_method || null"
        :items="PRICING_METHODS"
        label="طريقة التسعير"
        hide-details
        clearable
        @update:model-value="model.pricing_method = $event ?? ''"
      />
      <v-select
        :model-value="model.area_unit || null"
        :items="AREA_UNITS"
        label="وحدة المساحة"
        hide-details
        clearable
        @update:model-value="model.area_unit = $event ?? ''"
      />
      <div class="dal-extra__pair">
        <NumberField
          v-model="model.price_min"
          :decimals="false"
          label="السعر من"
          hide-details
          clearable
        />
        <NumberField
          v-model="model.price_max"
          :decimals="false"
          label="السعر إلى"
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
        <v-text-field
          v-model="model.plot_number"
          label="رقم القطعة"
          hide-details
          clearable
        />
        <v-text-field
          v-model="model.plot_letter"
          label="حرف القطعة"
          hide-details
          clearable
        />
      </div>
      <v-text-field
        v-model="model.district"
        label="المنطقة (نص حر)"
        hide-details
        clearable
      />
    </template>
  </FilterBar>
</template>
