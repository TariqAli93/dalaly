<script setup lang="ts">
import { computed } from "vue";
import { useLocations } from "../../composables/useLocations";
import type { RentalFilters } from "../../types";
const model = defineModel<RentalFilters>({ required: true });
const emit = defineEmits<{ apply: []; clear: [] }>();
const { activeGovernorates, districtsByGovernorate, neighborhoodsByDistrict } = useLocations();
const districts = computed(() => districtsByGovernorate(model.value.governorate_id));
const neighborhoods = computed(() => neighborhoodsByDistrict(model.value.district_id));
const propertyTypes = [{ title: "بيت", value: "house" }, { title: "شقة", value: "apartment" }, { title: "محل", value: "shop" }, { title: "مخزن", value: "warehouse" }, { title: "أخرى", value: "other" }];
const periods = [{ title: "شهري", value: "monthly" }, { title: "نصف سنوي", value: "semi_annual" }, { title: "سنوي", value: "annual" }];
const statuses = [{ title: "متاح", value: "available" }, { title: "محجوز", value: "reserved" }, { title: "قيد التفاوض", value: "negotiating" }, { title: "مؤجر", value: "rented" }, { title: "مؤرشف", value: "archived" }];
function updateLocation(key: "governorate_id" | "district_id" | "neighborhood_id", value: number | null) { model.value[key] = value; if (key === "governorate_id") { model.value.district_id = null; model.value.neighborhood_id = null; } if (key === "district_id") model.value.neighborhood_id = null; }
</script>
<template>
  <v-card variant="flat" border class="mb-3">
    <v-card-title class="d-flex align-center"><v-icon icon="mdi-filter-outline" class="me-2" />بحث الإيجارات</v-card-title>
    <v-card-text>
      <div class="rental-filter-grid">
        <v-text-field v-model="model.q" label="بحث عام" prepend-inner-icon="mdi-magnify" clearable hide-details />
        <v-select v-model="model.property_type" :items="propertyTypes" label="نوع العقار" clearable hide-details />
        <v-select v-model="model.rent_period" :items="periods" label="نوع الإيجار" clearable hide-details />
        <v-select v-model="model.status" :items="statuses" label="الحالة" clearable hide-details />
        <v-text-field v-model="model.rent_price_min" label="أقل سعر" type="number" hide-details />
        <v-text-field v-model="model.rent_price_max" label="أعلى سعر" type="number" hide-details />
        <v-text-field v-model="model.area_min" label="أقل مساحة" type="number" hide-details />
        <v-text-field v-model="model.area_max" label="أعلى مساحة" type="number" hide-details />
        <v-text-field v-model="model.rooms_count" label="الغرف فأكثر" type="number" hide-details />
        <v-text-field v-model="model.bathrooms_count" label="الحمامات فأكثر" type="number" hide-details />
        <v-text-field v-model="model.floors_count" label="الطوابق فأكثر" type="number" hide-details />
        <v-select v-model="model.negotiable" :items="[{ title: 'قابل للتفاوض', value: 'true' }, { title: 'غير قابل للتفاوض', value: 'false' }]" label="التفاوض" clearable hide-details />
        <v-select :model-value="model.governorate_id" :items="activeGovernorates" item-title="name" item-value="id" label="المحافظة" clearable hide-details @update:model-value="updateLocation('governorate_id', $event)" />
        <v-select :model-value="model.district_id" :items="districts" item-title="name" item-value="id" label="المنطقة" clearable hide-details @update:model-value="updateLocation('district_id', $event)" />
        <v-select :model-value="model.neighborhood_id" :items="neighborhoods" item-title="name" item-value="id" label="الحي" clearable hide-details @update:model-value="updateLocation('neighborhood_id', $event)" />
      </div>
      <div class="d-flex justify-end ga-2 mt-3"><v-btn variant="text" @click="emit('clear')">مسح</v-btn><v-btn color="primary" prepend-icon="mdi-magnify" @click="emit('apply')">بحث</v-btn></div>
    </v-card-text>
  </v-card>
</template>
<style scoped>.rental-filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }</style>
