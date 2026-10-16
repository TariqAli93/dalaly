<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import PropertyLocationMap from "./PropertyLocationMap.vue";
import {
  buildMapLink,
  coordinateNumber,
  mapLinkUrl,
  parseMapLink,
  validCoordinates,
  type Coordinates,
} from "../../utils/mapLocation";
import { request, getErrorMessage } from "../../services/api.service";

const latitude = defineModel<number | string | null>("latitude", {
  required: true,
});
const longitude = defineModel<number | string | null>("longitude", {
  required: true,
});
const link = defineModel<string | null>("locationLink", { required: true });
const showMap = ref(false);
const resolving = ref(false);
const warning = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;
let revision = 0;

function coordinateRule(value: unknown, limit: number, other: unknown) {
  const number = coordinateNumber(value);
  if (number === null)
    return coordinateNumber(other) === null || "أدخل خط العرض وخط الطول معاً.";
  return (
    (Number.isFinite(number) && Math.abs(number) <= limit) ||
    `أدخل رقماً بين ${-limit} و${limit}.`
  );
}
function cancelResolution() {
  revision++;
  clearTimeout(timer);
  resolving.value = false;
  warning.value = "";
}
function select(point: Coordinates) {
  cancelResolution();
  latitude.value = point.lat;
  longitude.value = point.lng;
  link.value = buildMapLink(point);
}
function manual(value: string | number | null, axis: "latitude" | "longitude") {
  cancelResolution();
  if (axis === "latitude") latitude.value = value;
  else longitude.value = value;
  const point = validCoordinates(
    axis === "latitude" ? value : latitude.value,
    axis === "longitude" ? value : longitude.value,
  );
  link.value = point ? buildMapLink(point) : null;
}
function clear() {
  cancelResolution();
  latitude.value = null;
  longitude.value = null;
  link.value = null;
}
function inputLink(value: string | null) {
  cancelResolution();
  link.value = value;
  if (!value?.trim()) return;
  if (!mapLinkUrl(value)) {
    warning.value =
      "أدخل رابط HTTPS صالحاً من OpenStreetMap أو رابط Google سابقاً.";
    return;
  }
  const point = parseMapLink(value);
  if (point) {
    latitude.value = point.lat;
    longitude.value = point.lng;
    return;
  }
  const current = revision;
  timer = setTimeout(() => {
    void resolve(value, current);
  }, 500);
}
async function resolve(value: string, current: number) {
  resolving.value = true;
  try {
    const result = await request<{ latitude: number; longitude: number }>(
      "/locations/resolve-map-link",
      {
        method: "POST",
        body: JSON.stringify({ url: value }),
      },
    );
    if (current !== revision) return;
    latitude.value = result.latitude;
    longitude.value = result.longitude;
  } catch (cause) {
    if (current === revision) warning.value = getErrorMessage(cause);
  } finally {
    if (current === revision) resolving.value = false;
  }
}
onBeforeUnmount(cancelResolution);
</script>

<template>
  <v-card variant="flat" border rounded="lg" class="mt-4">
    <v-card-title class="text-subtitle-1">موقع العقار</v-card-title>
    <v-card-text>
      <v-row>
        <v-col cols="12" sm="6">
          <v-text-field
            :model-value="latitude"
            label="خط العرض"
            dir="ltr"
            inputmode="decimal"
            :rules="[(value: unknown) => coordinateRule(value, 90, longitude)]"
            @update:model-value="manual($event, 'latitude')"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            :model-value="longitude"
            label="خط الطول"
            dir="ltr"
            inputmode="decimal"
            :rules="[(value: unknown) => coordinateRule(value, 180, latitude)]"
            @update:model-value="manual($event, 'longitude')"
          />
        </v-col>
        <v-col cols="12">
          <v-text-field
            :model-value="link"
            label="رابط الموقع"
            dir="ltr"
            :loading="resolving"
            maxlength="2048"
            hint="الصق رابط OpenStreetMap أو Google Maps، أو أدخل الإحداثيات، أو حدد الموقع على الخريطة."
            persistent-hint
            :rules="[
              (value: string | null) =>
                !value ||
                !!mapLinkUrl(value) ||
                'أدخل رابط موقع صالحاً وآمناً.',
            ]"
            @update:model-value="inputLink"
          />
        </v-col>
      </v-row>
      <v-alert
        v-if="warning"
        type="warning"
        variant="tonal"
        class="my-3"
        aria-live="polite"
        >{{ warning }}</v-alert
      >
      <v-sheet class="d-flex flex-wrap ga-2 my-3">
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-map-marker"
          @click="showMap = !showMap"
        >
          {{ showMap ? "إخفاء الخريطة" : "تحديد الموقع على الخريطة" }}
        </v-btn>
        <v-btn
          variant="text"
          prepend-icon="mdi-map-marker-remove-outline"
          @click="clear"
          >مسح الموقع</v-btn
        >
      </v-sheet>
      <PropertyLocationMap
        v-if="showMap"
        v-model:latitude="latitude"
        v-model:longitude="longitude"
        @select="select"
      />
      <v-sheet v-if="showMap" class="text-caption text-medium-emphasis mt-2">
        انقر على الخريطة أو اسحب العلامة. مركز بغداد الافتراضي لا يُحفظ حتى
        تختار موقعاً.
      </v-sheet>
    </v-card-text>
  </v-card>
</template>
