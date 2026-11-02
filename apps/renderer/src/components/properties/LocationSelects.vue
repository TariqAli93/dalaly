<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useLocations } from "../../composables/useLocations";

const governorateId = defineModel<number | null>("governorateId", {
  default: null,
});
const districtId = defineModel<number | null>("districtId", { default: null });
const neighborhoodId = defineModel<number | null>("neighborhoodId", {
  default: null,
});
const governorateText = defineModel<string>("governorateText", { default: "" });
const districtText = defineModel<string>("districtText", { default: "" });
const neighborhoodText = defineModel<string>("neighborhoodText", {
  default: "",
});

const {
  activeGovernorates,
  districtsByGovernorate,
  neighborhoodsByDistrict,
  loadLocations,
} = useLocations();

const govManual = ref(Boolean(governorateText.value) && !governorateId.value);
const distManual = ref(Boolean(districtText.value) && !districtId.value);
const neighManual = ref(
  Boolean(neighborhoodText.value) && !neighborhoodId.value,
);

const districtItems = computed(() =>
  districtsByGovernorate(governorateId.value),
);
const neighborhoodItems = computed(() =>
  neighborhoodsByDistrict(districtId.value),
);

onMounted(() => void loadLocations());

function toggleGovManual() {
  govManual.value = !govManual.value;
  if (govManual.value) {
    governorateId.value = null;
  } else {
    governorateText.value = "";
  }
}

function toggleDistManual() {
  distManual.value = !distManual.value;
  if (distManual.value) {
    districtId.value = null;
  } else {
    districtText.value = "";
  }
}

function toggleNeighManual() {
  neighManual.value = !neighManual.value;
  if (neighManual.value) {
    neighborhoodId.value = null;
  } else {
    neighborhoodText.value = "";
  }
}

// التصفير عند اختيار المستخدم فقط: النموذج يصل من الأب بعد التركيب عند فتح
// عرض للتعديل، ومراقبة القيم كانت تصفّر المنطقة والحي المحفوظين عندها.
function selectGovernorate(value: number | null) {
  if (value === governorateId.value) return;
  governorateId.value = value;
  districtId.value = null;
  if (!neighManual.value) neighborhoodId.value = null;
}

function selectDistrict(value: number | null) {
  if (value === districtId.value) return;
  districtId.value = value;
  if (!neighManual.value) neighborhoodId.value = null;
}

// نص محمَّل بلا معرّف يعني إدخالاً يدوياً محفوظاً، فيُعرض في حقله. يُراقب النص
// وحده: مسح القائمة يصفّر المعرّف ويُبقي اسم الموقع القديم، فلا يدلّ على إدخال يدوي.
watch(governorateText, (text) => {
  if (text && !governorateId.value) govManual.value = true;
});
watch(districtText, (text) => {
  if (text && !districtId.value) distManual.value = true;
});
watch(neighborhoodText, (text) => {
  if (text && !neighborhoodId.value) neighManual.value = true;
});
</script>

<template>
  <!-- مبدّل الإدخال اليدوي في سطر تفاصيل الحقل (مع تلميحه)، لا زرّاً تحت كل
       حقل: صف الأزرار الثلاثة (36px) كان يفصل الموقع عن بقية النموذج. -->
  <div class="location-grid">
    <div class="location-field">
      <v-select
        v-if="!govManual"
        :model-value="governorateId"
        :items="activeGovernorates"
        item-title="name"
        item-value="id"
        label="المحافظة"
        clearable
        class="w-100"
        @update:model-value="selectGovernorate"
      >
        <template #details>
          <button
            type="button"
            class="location-field__toggle"
            @click="toggleGovManual"
          >
            إدخال يدوي
          </button>
        </template>
      </v-select>
      <v-text-field
        v-else
        v-model="governorateText"
        label="المحافظة (إدخال يدوي)"
        class="w-100"
      >
        <template #details>
          <button
            type="button"
            class="location-field__toggle"
            @click="toggleGovManual"
          >
            اختيار من القائمة
          </button>
        </template>
      </v-text-field>
    </div>

    <div class="location-field">
      <v-select
        v-if="!distManual"
        :model-value="districtId"
        :items="districtItems"
        item-title="name"
        item-value="id"
        label="المنطقة"
        :disabled="!governorateId"
        :hint="!governorateId ? 'اختر المحافظة أولاً، أو' : ''"
        persistent-hint
        clearable
        class="w-100"
        @update:model-value="selectDistrict"
      >
        <template #details>
          <button
            type="button"
            class="location-field__toggle"
            @click="toggleDistManual"
          >
            إدخال يدوي
          </button>
        </template>
      </v-select>
      <v-text-field
        v-else
        v-model="districtText"
        label="المنطقة (إدخال يدوي)"
        class="w-100"
      >
        <template #details>
          <button
            type="button"
            class="location-field__toggle"
            @click="toggleDistManual"
          >
            اختيار من القائمة
          </button>
        </template>
      </v-text-field>
    </div>

    <div class="location-field">
      <v-select
        v-if="!neighManual"
        v-model="neighborhoodId"
        :items="neighborhoodItems"
        item-title="name"
        item-value="id"
        label="الحي"
        :disabled="!districtId"
        :hint="!districtId ? 'اختر المنطقة أولاً، أو' : ''"
        persistent-hint
        clearable
        class="w-100"
      >
        <template #details>
          <button
            type="button"
            class="location-field__toggle"
            @click="toggleNeighManual"
          >
            إدخال يدوي
          </button>
        </template>
      </v-select>
      <v-text-field
        v-else
        v-model="neighborhoodText"
        label="الحي (إدخال يدوي)"
        class="w-100"
      >
        <template #details>
          <button
            type="button"
            class="location-field__toggle"
            @click="toggleNeighManual"
          >
            اختيار من القائمة
          </button>
        </template>
      </v-text-field>
    </div>
  </div>
</template>

<style scoped>
.location-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.location-field {
  min-width: 0;
}
/* الحقل المعطّل يبهت كله، لكن مبدّله هو المخرج منه فيبقى بتباين كامل. */
.location-field :deep(.v-input--disabled .v-input__details) {
  pointer-events: auto;
}
.location-field :deep(.v-input__details) {
  align-items: baseline;
  gap: 4px;
}
.location-field__toggle {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.5;
  color: rgb(var(--v-theme-primary-text));
  cursor: pointer;
  white-space: nowrap;
}
.location-field__toggle:hover {
  text-decoration: underline;
}
@media (max-width: 960px) {
  .location-grid {
    grid-template-columns: 1fr;
  }
}
</style>
