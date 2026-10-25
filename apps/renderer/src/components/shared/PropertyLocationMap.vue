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
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { validCoordinates, type Coordinates } from "../../utils/mapLocation";

const latitude = defineModel<number | string | null>("latitude", {
  default: null,
});
const longitude = defineModel<number | string | null>("longitude", {
  default: null,
});
const props = withDefaults(
  defineProps<{
    readonly?: boolean;
    zoom?: number;
    height?: string | number;
    active?: boolean;
    propertyName?: string;
    address?: string;
  }>(),
  { readonly: false, height: "350px", active: true },
);
const emit = defineEmits<{ select: [Coordinates] }>();
const theme = useTheme();
const dark = computed(() => theme.global.current.value.dark);
const host = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const error = ref("");
const offline = ref(!navigator.onLine);
const height = computed(() =>
  typeof props.height === "number" ? `${props.height}px` : props.height,
);
const point = computed(() => validCoordinates(latitude.value, longitude.value));
const baghdad: Coordinates = { lat: 33.3152, lng: 44.3661 };
let leaflet: typeof Leaflet | undefined;
let map: Leaflet.Map | undefined;
let marker: Leaflet.Marker | undefined;
let tiles: Leaflet.TileLayer | undefined;
let observer: ResizeObserver | undefined;
let initializing = false;
let disposed = false;
let frame = 0;
let tileErrors = 0;
let loadingTimer: ReturnType<typeof setTimeout> | undefined;

function zoomLevel() {
  return Math.max(1, Math.min(19, props.zoom ?? (point.value ? 16 : 12)));
}
function visible() {
  return (
    props.active &&
    host.value &&
    host.value.clientWidth > 0 &&
    host.value.clientHeight > 0
  );
}
function select(latlng: Leaflet.LatLng) {
  if (props.readonly) return;
  const wrapped = latlng.wrap();
  const selected = validCoordinates(
    Number(wrapped.lat.toFixed(8)),
    Number(wrapped.lng.toFixed(8)),
  );
  if (!selected) return;
  latitude.value = selected.lat;
  longitude.value = selected.lng;
  emit("select", selected);
}
function popup() {
  if (!marker) return;
  marker.unbindPopup();
  if (!props.propertyName && !props.address) return;
  const content = document.createElement("div");
  content.dir = "rtl";
  if (props.propertyName) {
    const name = document.createElement("strong");
    name.textContent = props.propertyName;
    content.append(name);
  }
  if (props.address) {
    const address = document.createElement("div");
    address.textContent = props.address;
    content.append(address);
  }
  marker.bindPopup(content); // Property text is never interpreted as HTML.
}
function syncMarker() {
  if (!map || !leaflet) return;
  if (!point.value) {
    marker?.off();
    marker?.remove();
    marker = undefined;
    return;
  }
  const position: Leaflet.LatLngExpression = [point.value.lat, point.value.lng];
  if (!marker) {
    marker = leaflet
      .marker(position, {
        draggable: !props.readonly,
        keyboard: true,
        title: "موقع العقار",
        alt: "علامة موقع العقار",
        icon: leaflet.icon({
          iconUrl: markerIconUrl,
          iconRetinaUrl: markerRetinaUrl,
          shadowUrl: markerShadowUrl,
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        }),
      })
      .addTo(map);
    marker.on("dragend", () => {
      if (marker) select(marker.getLatLng());
    });
    popup();
  } else marker.setLatLng(position);
  if (props.readonly) marker.dragging?.disable();
  else marker.dragging?.enable();
}
function loadingStarted() {
  tileErrors = 0;
  error.value = "";
  loading.value = true;
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    loading.value = false;
    error.value =
      "يستغرق تحميل الخريطة وقتاً طويلاً. يمكنك متابعة إدخال الإحداثيات أو إعادة المحاولة.";
  }, 15000);
}
function retry() {
  if (offline.value || !props.active) return;
  if (!map) {
    void initialize();
    return;
  }
  error.value = "";
  if (tiles && !map.hasLayer(tiles)) tiles.addTo(map);
  else tiles?.redraw();
}
function onlineChanged(event: Event) {
  offline.value = event.type === "offline";
  if (offline.value) {
    loading.value = false;
    clearTimeout(loadingTimer);
  } else retry();
}
async function initialize() {
  if (disposed || map || initializing || !visible()) return;
  initializing = true;
  loading.value = true;
  error.value = "";
  try {
    leaflet = await import("leaflet");
    if (disposed || map || !visible() || !host.value) return;
    const center = point.value ?? baghdad;
    map = leaflet.map(host.value, {
      zoomControl: false,
      worldCopyJump: true,
      minZoom: 1,
      maxZoom: 19,
    });
    map.setView([center.lat, center.lng], zoomLevel());
    leaflet.control
      .zoom({
        position: "topleft",
        zoomInTitle: "تكبير الخريطة",
        zoomOutTitle: "تصغير الخريطة",
      })
      .addTo(map);
    map.attributionControl.setPrefix(
      '<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>',
    );
    tiles = leaflet.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        // Load only the visible viewport. Chromium honours the provider's HTTP cache headers.
        keepBuffer: 0,
        updateWhenIdle: true,
        detectRetina: false,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      },
    );
    tiles.on("loading", loadingStarted);
    tiles.on("tileerror", () => {
      tileErrors++;
      error.value =
        "تعذر تحميل بعض أجزاء الخريطة. تحقق من الاتصال؛ الموقع والإحداثيات محفوظة.";
    });
    tiles.on("load", () => {
      loading.value = false;
      clearTimeout(loadingTimer);
      if (!tileErrors) error.value = "";
    });
    map.on("click", (event: Leaflet.LeafletMouseEvent) => select(event.latlng));
    syncMarker();
    if (!offline.value) tiles.addTo(map);
    else loading.value = false;
    host.value
      .querySelector(".leaflet-control-zoom-in")
      ?.setAttribute("aria-label", "تكبير الخريطة");
    host.value
      .querySelector(".leaflet-control-zoom-out")
      ?.setAttribute("aria-label", "تصغير الخريطة");
  } catch {
    map?.remove();
    map = undefined;
    marker = undefined;
    tiles = undefined;
    loading.value = false;
    error.value = "تعذر تهيئة الخريطة. يمكنك إدخال الإحداثيات وحفظها يدوياً.";
  } finally {
    initializing = false;
  }
}
function resize() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (!visible() || disposed) return;
    if (!map) void initialize();
    else map.invalidateSize({ pan: false, debounceMoveend: true });
  });
}
watch(
  [latitude, longitude],
  () => {
    syncMarker();
    if (map && visible()) {
      const center = point.value ?? baghdad;
      map.panTo([center.lat, center.lng], { animate: false });
    }
  },
  { flush: "post" },
);
watch(() => props.readonly, syncMarker);
watch(() => [props.propertyName, props.address], popup);
watch(
  () => props.zoom,
  () => {
    if (map && visible()) map.setZoom(zoomLevel());
  },
);
watch(
  () => props.active,
  async (active) => {
    if (!active) return;
    await nextTick();
    resize();
    if (map) {
      const center = point.value ?? baghdad;
      map.panTo([center.lat, center.lng], { animate: false });
      if (tiles && !map.hasLayer(tiles) && !offline.value) tiles.addTo(map);
    }
  },
);
onMounted(() => {
  observer = new ResizeObserver(resize);
  if (host.value) observer.observe(host.value);
  window.addEventListener("online", onlineChanged);
  window.addEventListener("offline", onlineChanged);
  void initialize();
});
onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(frame);
  clearTimeout(loadingTimer);
  observer?.disconnect();
  window.removeEventListener("online", onlineChanged);
  window.removeEventListener("offline", onlineChanged);
  marker?.off();
  tiles?.off();
  map?.off();
  map?.remove();
  marker = undefined;
  tiles = undefined;
  map = undefined;
});
</script>

<template>
  <v-sheet
    class="property-location-map"
    :class="{ 'map-dark': dark }"
    border
    rounded="lg"
    role="region"
    aria-label="خريطة موقع العقار"
    :style="{ height }"
  >
    <div
      ref="host"
      class="map-canvas"
      dir="ltr"
      aria-label="خريطة OpenStreetMap"
    />
    <v-sheet
      v-if="loading && !offline"
      class="map-loading pa-2 rounded-lg"
      role="status"
    >
      <v-progress-circular indeterminate size="18" width="2" class="me-2" />جارِ
      تحميل الخريطة…
    </v-sheet>
    <v-alert
      v-if="offline || error"
      class="map-message"
      type="warning"
      variant="elevated"
      density="compact"
      aria-live="polite"
    >
      {{
        offline
          ? "لا يوجد اتصال بالإنترنت. قد لا تظهر أجزاء الخريطة؛ يمكنك إدخال الإحداثيات وحفظها يدوياً."
          : error
      }}
      <v-btn v-if="!offline" size="small" variant="text" @click="retry"
        >إعادة المحاولة</v-btn
      >
    </v-alert>
  </v-sheet>
</template>

<style scoped>
.property-location-map {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  min-width: 0;
}
.map-canvas {
  width: 100%;
  height: 100%;
  z-index: 0;
  font: inherit;
}
.map-loading {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 450;
  display: flex;
  align-items: center;
  pointer-events: none;
}
.map-message {
  position: absolute;
  top: 58px;
  right: 12px;
  left: 58px;
  z-index: 450;
  max-height: calc(100% - 100px);
  overflow: auto;
}
.map-canvas :deep(.leaflet-control-attribution) {
  direction: ltr;
  font-size: 0.82rem;
}
.map-canvas :deep(.leaflet-popup-content) {
  direction: rtl;
  text-align: start;
  font-family: inherit;
  overflow-wrap: anywhere;
}
.map-dark :deep(.leaflet-tile-pane) {
  filter: brightness(0.78) saturate(0.85);
}
.map-dark :deep(.leaflet-container) {
  background: rgb(var(--v-theme-background));
}
.map-dark :deep(.leaflet-bar a),
.map-dark :deep(.leaflet-popup-content-wrapper),
.map-dark :deep(.leaflet-popup-tip),
.map-dark :deep(.leaflet-control-attribution) {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
.map-dark :deep(.leaflet-control-attribution a) {
  color: rgb(var(--v-theme-primary));
}
.map-dark :deep(.leaflet-bar a:hover) {
  background: rgb(var(--v-theme-surface-variant));
}
</style>
