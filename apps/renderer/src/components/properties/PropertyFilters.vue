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

/**
 * شريط أدوات قائمة العروض داخل لوحها: صف للبحث والفلاتر الأساسية، وصف
 * للعروض السريعة (#views) والشرائح والترتيب (#end). أي تغيّر يُطبَّق بعد توقّف
 * قصير؛ Enter فوراً، وEsc يمسح البحث، و↓ ينقل التركيز إلى أول صف.
 */
const model = defineModel<PropertyFilters>({ required: true });
const emit = defineEmits<{ apply: []; cleared: []; down: [] }>();

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

let applyTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleApply(delay = 300) {
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(() => emit("apply"), delay);
}
watch(model, () => scheduleApply(), { deep: true });

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

function focusSearch() {
  const el = searchRef.value?.$el?.querySelector("input");
  el?.focus();
  el?.select();
}
// Ctrl+F بـ code لا key: على لوحة المفاتيح العربية key هو «ب». لا يُعترض
// داخل حوار مفتوح.
function onGlobalKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyF") return;
  if (event.altKey || event.shiftKey) return;
  if (document.querySelector(".v-overlay--active .v-dialog")) return;
  event.preventDefault();
  focusSearch();
}
function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (model.value.q) model.value.q = "";
    else (event.target as HTMLElement).blur();
  } else if (event.key === "Enter") {
    if (applyTimer) clearTimeout(applyTimer);
    emit("apply");
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    emit("down");
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

defineExpose({ focusSearch });
</script>

<template>
  <div class="dal-toolbar">
    <div class="dal-toolbar__row">
      <v-text-field
        ref="searchRef"
        v-model="model.q"
        class="dal-toolbar__search"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        placeholder="بحث بالمالك أو الهاتف أو رقم القطعة أو الرمز (Ctrl+F)"
        aria-label="بحث في عروض البيع"
        aria-keyshortcuts="Control+F"
        @keydown="onSearchKeydown"
      />
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
    </div>

    <div class="dal-toolbar__row dal-toolbar__row--sub">
      <slot name="views" />
      <div v-if="chips.length" class="dal-toolbar__chips">
        <v-chip
          v-for="c in chips"
          :key="c.key"
          size="small"
          variant="tonal"
          label
          closable
          :close-label="`إزالة ${c.label}`"
          @click:close="removeChip(c.key)"
        >
          {{ c.label }}
        </v-chip>
        <v-btn size="small" variant="text" @click="clearAll">مسح الكل</v-btn>
      </div>
      <v-spacer />
      <v-btn
        variant="text"
        size="small"
        prepend-icon="mdi-tune-variant"
        :aria-label="
          extraCount ? `فلاتر إضافية، مفعّل منها ${extraCount}` : 'فلاتر إضافية'
        "
        @click="extraOpen = true"
      >
        فلاتر إضافية
        <span v-if="extraCount" class="dal-count ms-1">{{ extraCount }}</span>
      </v-btn>
      <slot name="end" />
    </div>

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
          aria-label="إغلاق الفلاتر الإضافية"
          @click="extraOpen = false"
        />
      </div>
      <v-divider />
      <div class="dal-extra__body">
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
      </div>
    </v-navigation-drawer>
  </div>
</template>

<style scoped>
.dal-toolbar {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--dal-stroke);
}
.dal-toolbar__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 4px;
}
.dal-toolbar__row--sub {
  min-height: 36px;
  padding-block: 0 4px;
}
/* الالتفاف يُقرَّر بالأساس لا بالعرض النهائي: أساس صغير يُبقي الصف واحداً حتى
   لوح بعرض 760px تقريباً (1366px بتكبير 125%)، ثم تكبر الحقول لتملأه. */
.dal-toolbar__search {
  flex: 2 1 180px;
  min-width: 180px;
}
.dal-toolbar__filter {
  flex: 1 1 100px;
  min-width: 100px;
  max-width: 180px;
}
.dal-toolbar__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.dal-extra__header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  min-height: 48px;
}
.dal-extra__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}
.dal-extra__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
