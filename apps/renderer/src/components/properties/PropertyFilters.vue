<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  AREA_UNITS,
  LEGAL_TYPES,
  PRICING_METHODS,
  PROPERTY_TYPES,
  STATUSES,
} from "../../constants/domain";
import { useLocations } from "../../composables/useLocations";
import NumberField from "../app/NumberField.vue";
import type { PropertyFilters } from "../../types";

const model = defineModel<PropertyFilters>({ required: true });

const emit = defineEmits<{ apply: []; clear: [] }>();

const advancedOpen = ref(false);
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

onMounted(() => void loadLocations());
</script>

<template>
  <v-sheet class="filter-panel" border>
    <div class="list-toolbar">
      <v-text-field
        v-model="model.q"
        label="بحث شامل"
        placeholder="ابحث بالمالك، الهاتف، العنوان، رقم القطعة، الملاحظات..."
        density="compact"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        @keyup.enter="emit('apply')"
      />
      <v-select
        v-model="model.status"
        :items="STATUSES"
        label="الحالة"
        density="compact"
        hide-details
        clearable
      />
      <v-btn color="primary" prepend-icon="mdi-filter" @click="emit('apply')">
        تطبيق
      </v-btn>
      <v-btn
        variant="tonal"
        prepend-icon="mdi-tune"
        @click="advancedOpen = !advancedOpen"
      >
        فلاتر
      </v-btn>
      <v-btn
        variant="text"
        prepend-icon="mdi-filter-remove"
        @click="emit('clear')"
      >
        مسح
      </v-btn>
    </div>
    <v-expand-transition>
      <div v-if="advancedOpen" class="advanced-grid">
        <v-select
          v-model="model.governorate_id"
          :items="activeGovernorates"
          item-title="name"
          item-value="id"
          label="المحافظة"
          density="compact"
          hide-details
          clearable
        />
        <v-select
          v-model="model.district_id"
          :items="districtItems"
          item-title="name"
          item-value="id"
          label="المنطقة (من القائمة)"
          :disabled="!model.governorate_id"
          density="compact"
          hide-details
          clearable
        />
        <v-select
          v-model="model.neighborhood_id"
          :items="neighborhoodItems"
          item-title="name"
          item-value="id"
          label="الحي (من القائمة)"
          :disabled="!model.district_id"
          density="compact"
          hide-details
          clearable
        />
        <v-select
          v-model="model.property_type"
          :items="PROPERTY_TYPES"
          label="نوع العقار"
          density="compact"
          hide-details
          clearable
        />
        <v-select
          v-model="model.legal_type"
          :items="LEGAL_TYPES"
          label="الصفة القانونية"
          density="compact"
          hide-details
          clearable
        />
        <v-select
          v-model="model.area_unit"
          :items="AREA_UNITS"
          label="وحدة المساحة"
          density="compact"
          hide-details
          clearable
        />
        <v-select
          v-model="model.pricing_method"
          :items="PRICING_METHODS"
          label="طريقة التسعير"
          density="compact"
          hide-details
          clearable
        />
        <v-text-field
          v-model="model.district"
          label="المنطقة"
          density="compact"
          hide-details
          clearable
        />
        <v-text-field
          v-model="model.plot_number"
          label="رقم القطعة"
          density="compact"
          hide-details
          clearable
        />
        <v-text-field
          v-model="model.plot_letter"
          label="حرف القطعة"
          density="compact"
          hide-details
          clearable
        />
        <NumberField
          v-model="model.area_min"
          label="المساحة من"
          density="compact"
          hide-details
          clearable
        />
        <NumberField
          v-model="model.area_max"
          label="المساحة إلى"
          density="compact"
          hide-details
          clearable
        />
        <NumberField
          v-model="model.price_min"
          :decimals="false"
          label="السعر من"
          density="compact"
          hide-details
          clearable
        />
        <NumberField
          v-model="model.price_max"
          :decimals="false"
          label="السعر إلى"
          density="compact"
          hide-details
          clearable
        />
      </div>
    </v-expand-transition>
  </v-sheet>
</template>
