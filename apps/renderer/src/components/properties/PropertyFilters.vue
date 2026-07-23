<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
import { formatMoney } from "../../utils/format";
import type { PropertyFilters } from "../../types";

const model = defineModel<PropertyFilters>({ required: true });
// نفس العقد السابق: apply يُشغّل نفس loadProperties في الصفحة. لم يتغيّر أي
// منطق بحث أو فلترة — تغيّر تنظيم الواجهة وتوقيت التطبيق فقط.
const emit = defineEmits<{ apply: []; clear: [] }>();

const extraOpen = ref(false);
const searchRef = ref<{ $el?: HTMLElement } | null>(null);

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

// بحث/فلترة فورية مع debounce: أي تغيّر في الفلاتر يعيد التحميل بعد توقّف
// قصير، فيختفي زر "تطبيق". نفس الطلب ونفس القيم المرسلة إلى الـ API.
let applyTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleApply(delay = 300) {
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(() => emit("apply"), delay);
}
watch(model, () => scheduleApply(), { deep: true });

// حلّ أسماء المواقع للشرائح (من نفس قوائم الفلاتر الحالية).
function govName(id: number | null) {
  return activeGovernorates.value.find((g) => g.id === id)?.name ?? "";
}
function distName(id: number | null) {
  return districtItems.value.find((d) => d.id === id)?.name ?? "";
}
function neighName(id: number | null) {
  return neighborhoodItems.value.find((n) => n.id === id)?.name ?? "";
}

type Chip = { key: string; label: string };
const chips = computed<Chip[]>(() => {
  const m = model.value;
  const list: Chip[] = [];
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

function removeChip(key: string) {
  const m = model.value;
  if (key === "area") {
    m.area_min = "";
    m.area_max = "";
  } else if (key === "price") {
    m.price_min = "";
    m.price_max = "";
  } else if (key.endsWith("_id")) {
    (m as unknown as Record<string, number | null>)[key] = null;
  } else {
    (m as unknown as Record<string, string>)[key] = "";
  }
  // التغيير يلتقطه الـ watch ويُعيد التحميل.
}

// مسح الكل: نصفّر الحقول محلياً (نفس مفعول clearFilters) ويطبّق الـ watch مرة.
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
}

// اختصارات لوحة المفاتيح: Ctrl+F للتركيز على البحث، Escape لمسحه/إلغاء التركيز.
function focusSearch() {
  const el = searchRef.value?.$el?.querySelector("input");
  el?.focus();
  el?.select();
}
function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    focusSearch();
  }
}
function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (model.value.q) model.value.q = "";
    else (event.target as HTMLElement).blur();
  } else if (event.key === "Enter") {
    if (applyTimer) clearTimeout(applyTimer);
    emit("apply");
  }
}

onMounted(() => {
  void loadLocations();
  window.addEventListener("keydown", onGlobalKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
  if (applyTimer) clearTimeout(applyTimer);
});
</script>

<template>
  <div class="dal-filters bg-surface pa-3 border">
    <!-- شريط البحث + الفلاتر الأساسية (≤6، فورية) -->
    <div class="dal-filters__primary">
      <v-text-field
        ref="searchRef"
        v-model="model.q"
        class="dal-search"
        density="compact"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        placeholder="ابحث باسم المالك، الهاتف، رقم القطعة، المنطقة أو أي وصف"
        aria-label="بحث في العروض"
        @keydown="onSearchKeydown"
      />
      <v-select
        v-model="model.governorate_id"
        :items="activeGovernorates"
        item-title="name"
        item-value="id"
        label="المحافظة"
        density="compact"
        hide-details
        clearable
        class="dal-filter-sel"
      />
      <v-select
        v-model="model.district_id"
        :items="districtItems"
        item-title="name"
        item-value="id"
        label="المنطقة"
        :disabled="!model.governorate_id"
        density="compact"
        hide-details
        clearable
        class="dal-filter-sel"
      />
      <v-select
        v-model="model.neighborhood_id"
        :items="neighborhoodItems"
        item-title="name"
        item-value="id"
        label="الحي"
        :disabled="!model.district_id"
        density="compact"
        hide-details
        clearable
        class="dal-filter-sel"
      />
      <v-select
        v-model="model.property_type"
        :items="PROPERTY_TYPES"
        label="النوع"
        density="compact"
        hide-details
        clearable
        class="dal-filter-sel"
      />
      <v-select
        v-model="model.status"
        :items="STATUSES"
        label="الحالة"
        density="compact"
        hide-details
        clearable
        class="dal-filter-sel"
      />
      <v-btn
        variant="text"
        prepend-icon="mdi-tune-variant"
        @click="extraOpen = true"
      >
        فلاتر إضافية
      </v-btn>
    </div>

    <!-- ملخّص الفلاتر المطبّقة: شرائح صغيرة قابلة للإزالة فردياً -->
    <div v-if="chips.length" class="dal-filters__chips">
      <v-chip
        v-for="c in chips"
        :key="c.key"
        size="small"
        variant="tonal"
        label
        closable
        @click:close="removeChip(c.key)"
      >
        {{ c.label }}
      </v-chip>
      <v-btn
        v-if="chips.length > 1"
        size="small"
        variant="text"
        @click="clearAll"
      >
        مسح الكل
      </v-btn>
    </div>

    <!-- فلاتر إضافية داخل Panel جانبي (لا صفحة كاملة) -->
    <v-navigation-drawer
      v-model="extraOpen"
      temporary
      location="end"
      width="340"
    >
      <div class="dal-extra__header">
        <span class="dal-section-title">فلاتر إضافية</span>
        <v-spacer />
        <v-btn variant="text" size="small" @click="clearAll">مسح</v-btn>
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          aria-label="إغلاق"
          @click="extraOpen = false"
        />
      </div>
      <v-divider />
      <div class="dal-extra__body">
        <v-select
          v-model="model.legal_type"
          :items="LEGAL_TYPES"
          label="الصفة القانونية"
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
        <v-select
          v-model="model.area_unit"
          :items="AREA_UNITS"
          label="وحدة المساحة"
          density="compact"
          hide-details
          clearable
        />
        <div class="dal-extra__pair">
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
        <div class="dal-extra__pair">
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
        </div>
        <div class="dal-extra__pair">
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
        </div>
        <v-text-field
          v-model="model.district"
          label="المنطقة (نص حر)"
          density="compact"
          hide-details
          clearable
        />
      </div>
    </v-navigation-drawer>
  </div>
</template>

<style scoped>
.dal-filters {
  margin-bottom: 8px;
}
.dal-filters__primary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.dal-search {
  flex: 2 1 300px;
  min-width: 240px;
}
.dal-filter-sel {
  flex: 1 1 150px;
  min-width: 132px;
  max-width: 200px;
}
.dal-filters__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.dal-extra__header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  min-height: 44px;
}
.dal-extra__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
.dal-extra__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
