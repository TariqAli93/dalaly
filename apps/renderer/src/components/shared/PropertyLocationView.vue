<script setup lang="ts">
import { computed } from "vue";
import GoogleMapPicker from "./GoogleMapPicker.vue";
import {
  buildGoogleMapsUrl,
  googleMapsUrl,
  validCoordinates,
} from "../../utils/googleMapsUrl";
import { useSnackbar } from "../../composables/useSnackbar";
import { openGoogleMaps } from "../../services/external-links.service";

const props = withDefaults(
  defineProps<{
    latitude?: number | null;
    longitude?: number | null;
    locationLink?: string | null;
    address?: string;
    active?: boolean;
    canEdit?: boolean;
  }>(),
  { active: true, canEdit: false },
);
const emit = defineEmits<{ edit: [] }>();
const { notifySuccess, notifyError } = useSnackbar();
const point = computed(() => validCoordinates(props.latitude, props.longitude));
const url = computed(() =>
  point.value
    ? buildGoogleMapsUrl(point.value)
    : (googleMapsUrl(props.locationLink ?? "")?.href ?? ""),
);
async function open() {
  try {
    await openGoogleMaps(url.value);
  } catch {
    notifyError("تعذر فتح خرائط Google.");
  }
}
async function searchAddress() {
  try {
    await openGoogleMaps(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.address + " العراق")}`,
    );
  } catch {
    notifyError("تعذر فتح خرائط Google.");
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    notifySuccess("تم نسخ رابط الموقع.");
  } catch {
    notifyError("تعذر نسخ الرابط. يمكنك نسخه من الحقل أدناه.");
  }
}
</script>

<template>
  <v-card variant="flat" border rounded="lg">
    <v-card-title>الموقع على الخريطة</v-card-title>
    <v-card-text>
      <v-sheet v-if="address" class="text-body-2 mb-3">{{ address }}</v-sheet>
      <template v-if="point">
        <GoogleMapPicker
          :latitude="latitude"
          :longitude="longitude"
          readonly
          :active="active"
          height="400px"
        />
        <v-row class="mt-3">
          <v-col cols="12" sm="6"
            ><v-text-field
              :model-value="latitude"
              label="خط العرض"
              readonly
              dir="ltr"
          /></v-col>
          <v-col cols="12" sm="6"
            ><v-text-field
              :model-value="longitude"
              label="خط الطول"
              readonly
              dir="ltr"
          /></v-col>
        </v-row>
      </template>
      <v-sheet
        v-else
        class="d-flex flex-column align-center ga-3 py-8 text-medium-emphasis"
      >
        <v-icon icon="mdi-map-marker-off-outline" size="40" />
        <v-sheet>لم يتم تحديد موقع لهذا العقار بعد</v-sheet>
        <v-btn
          v-if="canEdit"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-map-marker-plus"
          @click="emit('edit')"
          >إضافة موقع العقار</v-btn
        >
        <v-btn
          v-if="address"
          variant="text"
          prepend-icon="mdi-open-in-new"
          @click="searchAddress"
          >البحث عن العنوان في خرائط Google</v-btn
        >
      </v-sheet>
      <template v-if="url">
        <v-text-field
          :model-value="url"
          label="رابط الموقع"
          readonly
          dir="ltr"
        />
        <v-sheet class="d-flex flex-wrap ga-2">
          <v-btn color="primary" prepend-icon="mdi-map-marker" @click="open"
            >فتح في خرائط Google</v-btn
          >
          <v-btn variant="tonal" prepend-icon="mdi-content-copy" @click="copy"
            >نسخ رابط الموقع</v-btn
          >
        </v-sheet>
      </template>
    </v-card-text>
  </v-card>
</template>
