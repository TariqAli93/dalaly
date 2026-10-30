<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import * as dashboardService from "../../services/dashboard.service";
import { usePermissions } from "../../composables/usePermissions";
import { ALERTS } from "../../constants/alerts";
import { formatNumber } from "../../utils/format";
import type { BusinessAlerts } from "../../types";

/**
 * مركز التنبيهات في شريط الأوامر: ما يحتاج انتباهاً (مهام فات موعدها، أقساط
 * متأخرة، صفقات متوقفة، إيجارات تنتهي، زبائن بلا تواصل)، كل بند بعدده يفتح
 * سجلاته. يُحدَّث عند التنقل بين الصفحات وكل دقيقتين؛ الشارة تعدّ العاجل
 * والتحذيري، والمعلومات وحدها تُظهر نقطة.
 */
const router = useRouter();
const route = useRoute();
const { can } = usePermissions();

const data = ref<BusinessAlerts | null>(null);
const failed = ref(false);
let controller: AbortController | null = null;
let lastLoad = 0;

async function load() {
  controller?.abort();
  controller = new AbortController();
  lastLoad = Date.now();
  try {
    data.value = await dashboardService.fetchAlerts(controller.signal);
    failed.value = false;
  } catch (cause) {
    if ((cause as { name?: string }).name !== "AbortError") failed.value = true;
  }
}

const REFRESH_MS = 120_000;
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  timer = setInterval(() => void load(), REFRESH_MS);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  controller?.abort();
});
// Moving between pages may have settled something: refresh, not too often.
watch(
  () => route.path,
  () => {
    if (Date.now() - lastLoad > 15_000) void load();
  },
);

const alerts = computed(() => data.value?.alerts ?? []);
const urgent = computed(() =>
  alerts.value
    .filter((alert) => alert.severity !== "info")
    .reduce((sum, alert) => sum + alert.count, 0),
);
const label = computed(() =>
  urgent.value
    ? `التنبيهات: ${urgent.value} تحتاج انتباهاً`
    : alerts.value.length
      ? "التنبيهات: للعلم"
      : "التنبيهات: لا شيء",
);
const color = (severity: string) =>
  severity === "error" ? "error" : severity === "warning" ? "warning" : "info";

function open(key: keyof typeof ALERTS) {
  void router.push(ALERTS[key].to(can));
}
</script>

<template>
  <v-menu
    location="bottom end"
    @update:model-value="(isOpen) => isOpen && load()"
  >
    <template #activator="{ props: menu }">
      <v-btn v-bind="menu" icon variant="text" size="small" :aria-label="label">
        <v-badge
          v-if="urgent"
          :content="urgent > 99 ? '99+' : urgent"
          color="error"
          floating
        >
          <v-icon icon="mdi-bell-outline" />
        </v-badge>
        <v-badge v-else-if="alerts.length" dot color="info" floating>
          <v-icon icon="mdi-bell-outline" />
        </v-badge>
        <v-icon v-else icon="mdi-bell-outline" />
      </v-btn>
    </template>
    <v-card min-width="300" max-width="360">
      <v-card-title class="dal-bell__title">التنبيهات</v-card-title>
      <v-divider />
      <p v-if="failed && !data" class="dal-bell__empty">
        تعذّر تحميل التنبيهات.
      </p>
      <p v-else-if="!alerts.length" class="dal-bell__empty">
        لا شيء يحتاج انتباهاً الآن.
      </p>
      <v-list v-else density="compact" aria-label="التنبيهات">
        <v-list-item
          v-for="alert in alerts"
          :key="alert.key"
          :prepend-icon="ALERTS[alert.key].icon"
          :base-color="color(alert.severity)"
          @click="open(alert.key)"
        >
          <v-list-item-title class="dal-bell__item">{{
            ALERTS[alert.key].title
          }}</v-list-item-title>
          <template #append>
            <span class="dal-bell__count">{{
              formatNumber(alert.count, 0)
            }}</span>
          </template>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>

<style scoped>
.dal-bell__title {
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
  padding-block: 10px;
}
.dal-bell__empty {
  margin: 0;
  padding: 16px;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
.dal-bell__item {
  color: rgb(var(--v-theme-on-surface));
}
.dal-bell__count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
