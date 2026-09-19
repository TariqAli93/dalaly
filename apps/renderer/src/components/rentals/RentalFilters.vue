<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useLocations } from "../../composables/useLocations";
import NumberField from "../app/NumberField.vue";
import type { RentalFilters } from "../../types";

const model = defineModel<RentalFilters>({ required: true });
const emit = defineEmits<{ apply: []; clear: [] }>();
const extraOpen = ref(false);
const searchRef = ref<{ $el?: HTMLElement } | null>(null);
const { activeGovernorates, districtsByGovernorate, neighborhoodsByDistrict, loadLocations } = useLocations();
const districts = computed(() => districtsByGovernorate(model.value.governorate_id));
const neighborhoods = computed(() => neighborhoodsByDistrict(model.value.district_id));

const propertyTypes = [
  { title: "بيت", value: "house" },
  { title: "شقة", value: "apartment" },
  { title: "محل", value: "shop" },
  { title: "مخزن", value: "warehouse" },
  { title: "أخرى", value: "other" },
];
const periods = [
  { title: "شهري", value: "monthly" },
  { title: "نصف سنوي", value: "semi_annual" },
  { title: "سنوي", value: "annual" },
];
const statuses = [
  { title: "متاح", value: "available" },
  { title: "محجوز", value: "reserved" },
  { title: "قيد التفاوض", value: "negotiating" },
  { title: "مؤجر", value: "rented" },
  { title: "مؤرشف", value: "archived" },
];
const negotiableOptions = [
  { title: "قابل للتفاوض", value: "true" },
  { title: "غير قابل للتفاوض", value: "false" },
];

let applyTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleApply(delay = 300) {
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(() => emit("apply"), delay);
}
watch(model, () => scheduleApply(), { deep: true });

function updateLocation(key: "governorate_id" | "district_id" | "neighborhood_id", value: number | null) {
  model.value[key] = value;
  if (key === "governorate_id") {
    model.value.district_id = null;
    model.value.neighborhood_id = null;
  } else if (key === "district_id") {
    model.value.neighborhood_id = null;
  }
}
function govName(id: number | null) { return activeGovernorates.value.find((item) => item.id === id)?.name ?? ""; }
function districtName(id: number | null) { return districts.value.find((item) => item.id === id)?.name ?? ""; }
function neighborhoodName(id: number | null) { return neighborhoods.value.find((item) => item.id === id)?.name ?? ""; }

const chips = computed(() => {
  const filter = model.value;
  const list: Array<{ key: string; label: string }> = [];
  if (filter.q) list.push({ key: "q", label: `بحث: ${filter.q}` });
  if (filter.governorate_id) list.push({ key: "governorate_id", label: govName(filter.governorate_id) });
  if (filter.district_id) list.push({ key: "district_id", label: districtName(filter.district_id) });
  if (filter.neighborhood_id) list.push({ key: "neighborhood_id", label: neighborhoodName(filter.neighborhood_id) });
  if (filter.property_type) list.push({ key: "property_type", label: propertyTypes.find((item) => item.value === filter.property_type)?.title ?? filter.property_type });
  if (filter.rent_period) list.push({ key: "rent_period", label: periods.find((item) => item.value === filter.rent_period)?.title ?? filter.rent_period });
  if (filter.status) list.push({ key: "status", label: statuses.find((item) => item.value === filter.status)?.title ?? filter.status });
  if (filter.negotiable) list.push({ key: "negotiable", label: filter.negotiable === "true" ? "قابل للتفاوض" : "غير قابل للتفاوض" });
  if (filter.area_min || filter.area_max) list.push({ key: "area", label: `مساحة ${filter.area_min || "…"}–${filter.area_max || "…"}` });
  if (filter.rent_price_min || filter.rent_price_max) list.push({ key: "price", label: `سعر ${filter.rent_price_min || "…"}–${filter.rent_price_max || "…"}` });
  return list;
});

function removeChip(key: string) {
  if (key === "area") { model.value.area_min = ""; model.value.area_max = ""; }
  else if (key === "price") { model.value.rent_price_min = ""; model.value.rent_price_max = ""; }
  else if (key.endsWith("_id")) (model.value as unknown as Record<string, number | null>)[key] = null;
  else (model.value as unknown as Record<string, string>)[key] = "";
}
function clearAll() { emit("clear"); }
function focusSearch() { searchRef.value?.$el?.querySelector("input")?.focus(); }
function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); focusSearch(); }
}
function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") { if (model.value.q) model.value.q = ""; else (event.target as HTMLElement).blur(); }
  else if (event.key === "Enter") { if (applyTimer) clearTimeout(applyTimer); emit("apply"); }
}
onMounted(() => { void loadLocations(); window.addEventListener("keydown", onGlobalKeydown); });
onBeforeUnmount(() => { window.removeEventListener("keydown", onGlobalKeydown); if (applyTimer) clearTimeout(applyTimer); });
</script>

<template>
  <div class="dal-filters bg-surface pa-3 border">
    <div class="dal-filters__primary">
      <v-text-field ref="searchRef" v-model="model.q" class="dal-search" density="compact" hide-details clearable prepend-inner-icon="mdi-magnify" placeholder="ابحث بالكود، المالك، الهاتف، المنطقة أو أي وصف" aria-label="بحث في الإيجارات" @keydown="onSearchKeydown" />
      <v-select :model-value="model.governorate_id" :items="activeGovernorates" item-title="name" item-value="id" label="المحافظة" density="compact" hide-details clearable class="dal-filter-sel" @update:model-value="updateLocation('governorate_id', $event)" />
      <v-select :model-value="model.district_id" :items="districts" item-title="name" item-value="id" label="المنطقة" :disabled="!model.governorate_id" density="compact" hide-details clearable class="dal-filter-sel" @update:model-value="updateLocation('district_id', $event)" />
      <v-select :model-value="model.neighborhood_id" :items="neighborhoods" item-title="name" item-value="id" label="الحي" :disabled="!model.district_id" density="compact" hide-details clearable class="dal-filter-sel" @update:model-value="updateLocation('neighborhood_id', $event)" />
      <v-select v-model="model.property_type" :items="propertyTypes" label="النوع" density="compact" hide-details clearable class="dal-filter-sel" />
      <v-select v-model="model.status" :items="statuses" label="الحالة" density="compact" hide-details clearable class="dal-filter-sel" />
      <v-btn variant="text" prepend-icon="mdi-tune-variant" @click="extraOpen = true">فلاتر إضافية</v-btn>
    </div>
    <div v-if="chips.length" class="dal-filters__chips">
      <v-chip v-for="chip in chips" :key="chip.key" size="small" variant="tonal" label closable @click:close="removeChip(chip.key)">{{ chip.label }}</v-chip>
      <v-btn v-if="chips.length > 1" size="small" variant="text" @click="clearAll">مسح الكل</v-btn>
    </div>
    <v-navigation-drawer v-model="extraOpen" temporary location="end" width="340">
      <div class="dal-extra__header"><span class="dal-section-title">فلاتر إضافية</span><v-spacer /><v-btn variant="text" size="small" @click="clearAll">مسح</v-btn><v-btn icon="mdi-close" size="small" variant="text" aria-label="إغلاق" @click="extraOpen = false" /></div>
      <v-divider />
      <div class="dal-extra__body">
        <v-select v-model="model.rent_period" :items="periods" label="نوع الإيجار" density="compact" hide-details clearable />
        <v-select v-model="model.negotiable" :items="negotiableOptions" label="التفاوض" density="compact" hide-details clearable />
        <v-text-field v-model="model.amenities" label="الملحقات / المميزات" density="compact" hide-details clearable />
        <div class="dal-extra__pair"><NumberField v-model="model.rent_price_min" :decimals="false" label="السعر من" density="compact" hide-details clearable /><NumberField v-model="model.rent_price_max" :decimals="false" label="السعر إلى" density="compact" hide-details clearable /></div>
        <div class="dal-extra__pair"><NumberField v-model="model.area_min" label="المساحة من" density="compact" hide-details clearable /><NumberField v-model="model.area_max" label="المساحة إلى" density="compact" hide-details clearable /></div>
        <div class="dal-extra__pair"><NumberField v-model="model.rooms_count" :decimals="false" label="الغرف فأكثر" density="compact" hide-details clearable /><NumberField v-model="model.bathrooms_count" :decimals="false" label="الحمامات فأكثر" density="compact" hide-details clearable /></div>
        <NumberField v-model="model.floors_count" :decimals="false" label="الطوابق فأكثر" density="compact" hide-details clearable />
      </div>
    </v-navigation-drawer>
  </div>
</template>

<style scoped>
.dal-filters { margin-bottom: 8px; }
.dal-filters__primary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dal-search { flex: 2 1 300px; min-width: 240px; }
.dal-filter-sel { flex: 1 1 150px; min-width: 132px; max-width: 200px; }
.dal-filters__chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
.dal-extra__header { display: flex; align-items: center; gap: 4px; padding: 6px 10px; min-height: 44px; }
.dal-extra__body { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.dal-extra__pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
