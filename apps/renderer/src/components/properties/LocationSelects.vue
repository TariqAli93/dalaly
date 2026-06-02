<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useLocations } from "../../composables/useLocations";

const governorateId = defineModel<number | null>("governorateId", {
  default: null,
});
const districtId = defineModel<number | null>("districtId", { default: null });
const governorateText = defineModel<string>("governorateText", { default: "" });
const districtText = defineModel<string>("districtText", { default: "" });

const { activeGovernorates, districtsByGovernorate, loadLocations } =
  useLocations();

const govManual = ref(Boolean(governorateText.value) && !governorateId.value);
const distManual = ref(Boolean(districtText.value) && !districtId.value);

const districtItems = computed(() =>
  districtsByGovernorate(governorateId.value),
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

// عند تغيير المحافظة من القائمة، صفّر المنطقة المختارة من القائمة.
watch(governorateId, () => {
  if (!govManual.value) districtId.value = null;
});
</script>

<template>
  <div class="location-grid">
    <div class="location-field">
      <v-select
        v-if="!govManual"
        v-model="governorateId"
        :items="activeGovernorates"
        item-title="name"
        item-value="id"
        label="المحافظة"
        clearable
        density="comfortable"
        class="w-100"
      />
      <v-text-field
        v-else
        v-model="governorateText"
        label="المحافظة (إدخال يدوي)"
        density="comfortable"
        class="w-100"
      />
      <v-btn
        size="small"
        variant="text"
        :prepend-icon="govManual ? 'mdi-format-list-bulleted' : 'mdi-pencil'"
        @click="toggleGovManual"
      >
        {{ govManual ? "اختيار من القائمة" : "إدخال يدوي" }}
      </v-btn>
    </div>

    <div class="location-field">
      <v-select
        v-if="!distManual"
        v-model="districtId"
        :items="districtItems"
        item-title="name"
        item-value="id"
        label="المنطقة"
        :disabled="!governorateId"
        :hint="
          !governorateId ? 'اختر المحافظة أولاً أو أدخل المنطقة يدوياً' : ''
        "
        persistent-hint
        clearable
        density="comfortable"
        class="w-100"
      />
      <v-text-field
        v-else
        v-model="districtText"
        label="المنطقة (إدخال يدوي)"
        density="comfortable"
        class="w-100"
      />
      <v-btn
        size="small"
        variant="text"
        :prepend-icon="distManual ? 'mdi-format-list-bulleted' : 'mdi-pencil'"
        @click="toggleDistManual"
      >
        {{ distManual ? "اختيار من القائمة" : "إدخال يدوي" }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.location-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.location-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
@media (max-width: 760px) {
  .location-grid {
    grid-template-columns: 1fr;
  }
}
</style>
