<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useTheme } from "vuetify";
import {
  loadGoogleMaps,
  mapsConfig,
  onMapsAuthFailure,
} from "../../services/google-maps.service";
import { validCoordinates, type Coordinates } from "../../utils/googleMapsUrl";

const latitude = defineModel<number | string | null>("latitude", {
  default: null,
});
const longitude = defineModel<number | string | null>("longitude", {
  default: null,
});
const props = withDefaults(
  defineProps<{ readonly?: boolean; height?: string; active?: boolean }>(),
  {
    readonly: false,
    height: "350px",
    active: true,
  },
);
const emit = defineEmits<{ select: [Coordinates] }>();
const theme = useTheme();
const canvas = ref<{ $el: HTMLElement } | null>(null);
const host = computed(() => canvas.value?.$el ?? null);
const loading = ref(false);
const error = ref("");
const point = computed(() => validCoordinates(latitude.value, longitude.value));
const defaultCenter = { lat: 33.3152, lng: 44.3661 };
let map: google.maps.Map | null = null;
let marker: google.maps.marker.AdvancedMarkerElement | null = null;
let observer: ResizeObserver | null = null;
let listeners: google.maps.MapsEventListener[] = [];
let generation = 0;
let disposed = false;

function select(position: Coordinates) {
  if (props.readonly) return;
  const rounded = {
    lat: Number(position.lat.toFixed(8)),
    lng: Number(position.lng.toFixed(8)),
  };
  latitude.value = rounded.lat;
  longitude.value = rounded.lng;
  emit("select", rounded);
}

function updatePosition() {
  if (!map || !marker) return;
  marker.position = point.value;
  marker.map = point.value ? map : null;
  marker.gmpDraggable = !props.readonly;
  map.setCenter(point.value ?? defaultCenter);
  map.setZoom(point.value ? 16 : 12);
}

function cleanupMap() {
  for (const listener of listeners) listener.remove();
  listeners = [];
  observer?.disconnect();
  observer = null;
  if (marker) {
    marker.map = null;
    google.maps.event.clearInstanceListeners(marker);
  }
  if (map) google.maps.event.clearInstanceListeners(map);
  marker = null;
  map = null;
  host.value?.replaceChildren();
}

async function initialize() {
  console.log("Initializing Google Map Picker...");
  console.log("Active:", props.active, "Disposed:", disposed);
  if (!props.active || disposed) return;
  const current = ++generation;
  loading.value = true;
  error.value = "";
  cleanupMap();
  try {
    const { Map, AdvancedMarkerElement, ColorScheme } = await loadGoogleMaps();
    await nextTick();
    if (disposed || current !== generation || !host.value || !props.active)
      return;
    map = new Map(host.value, {
      center: point.value ?? defaultCenter,
      zoom: point.value ? 16 : 12,
      mapId: mapsConfig.mapId,
      colorScheme: theme.global.current.value.dark
        ? ColorScheme.DARK
        : ColorScheme.LIGHT,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "cooperative",
    });
    marker = new AdvancedMarkerElement({
      map: point.value ? map : null,
      position: point.value,
      gmpDraggable: !props.readonly,
      title: props.readonly
        ? "موقع العقار"
        : "موقع العقار؛ يمكن تحريك العلامة بلوحة المفاتيح",
    });
    listeners.push(
      map.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (event.latLng) select(event.latLng.toJSON());
      }),
    );
    listeners.push(
      marker.addListener("dragend", () => {
        const position = marker?.position;
        if (!position) return;
        select(
          position instanceof google.maps.LatLng
            ? position.toJSON()
            : { lat: position.lat, lng: position.lng },
        );
      }),
    );
    observer = new ResizeObserver(() => {
      if (map && props.active && host.value?.clientWidth) {
        google.maps.event.trigger(map, "resize");
        map.setCenter(point.value ?? defaultCenter);
      }
    });
    observer.observe(host.value);
  } catch (cause) {
    if (!disposed && current === generation)
      error.value =
        cause instanceof Error
          ? cause.message
          : "تعذر تحميل الخريطة. يمكنك إدخال الموقع يدوياً.";
  } finally {
    if (current === generation) loading.value = false;
  }
}

const unsubscribe = onMapsAuthFailure(() => {
  error.value =
    "تعذر التحقق من إعدادات خرائط Google. راجع مفتاح الخدمة وقيود الوصول.";
  cleanupMap();
});
watch([latitude, longitude, () => props.readonly], updatePosition);
watch(
  () => theme.global.current.value.dark,
  () => {
    if (map) void initialize();
  },
);
watch(
  () => props.active,
  async (active) => {
    if (!active) return;
    await nextTick();
    if (!map) void initialize();
    else {
      google.maps.event.trigger(map, "resize");
      map.setCenter(point.value ?? defaultCenter);
    }
  },
);
function offline() {
  error.value =
    "لا يوجد اتصال بالإنترنت. تبقى بيانات الموقع محفوظة ويمكن تعديلها يدوياً.";
}
function online() {
  if (map) error.value = "";
}
onMounted(() => {
  window.addEventListener("offline", offline);
  window.addEventListener("online", online);
  void initialize();
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  unsubscribe();
  cleanupMap();
  window.removeEventListener("offline", offline);
  window.removeEventListener("online", online);
});
</script>

<template>
  <v-sheet
    class="map-picker"
    border
    rounded="lg"
    :style="{ height }"
    :aria-busy="loading"
  >
    <v-sheet
      ref="canvas"
      class="map-canvas"
      role="region"
      aria-label="خريطة موقع العقار"
    />
    <v-sheet
      v-if="loading || error"
      class="map-status"
      color="surface"
      role="status"
      aria-live="polite"
    >
      <v-progress-circular
        v-if="loading"
        indeterminate
        color="primary"
        aria-label="تحميل الخريطة"
      />
      <v-alert v-else type="warning" variant="tonal" class="ma-4">
        {{ error }}
        <v-btn variant="text" class="mt-2" @click.prevent="initialize"
          >إعادة المحاولة</v-btn
        >
      </v-alert>
    </v-sheet>
  </v-sheet>
</template>

<style scoped>
.map-picker {
  position: relative;
  overflow: hidden;
  min-height: 250px;
}
.map-canvas {
  width: 100%;
  height: 100%;
}
.map-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
