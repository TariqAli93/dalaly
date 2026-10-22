<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useTheme } from "vuetify";
import {
  ArcElement,
  Chart,
  DoughnutController,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import EmptyState from "./EmptyState.vue";
import { appearance, fontSizes } from "../../composables/useAppearance";
import { formatNumber } from "../../utils/format";
import { afterNextPaint } from "../../utils/schedule";

Chart.register(DoughnutController, ArcElement, Tooltip);

const props = withDefaults(
  defineProps<{
    items: Array<{ name: string; count: number }>;
    label: string;
    totalLabel?: string;
  }>(),
  { totalLabel: "عرض غير مؤرشف" },
);

const theme = useTheme();
const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart<"doughnut", number[], string> | null = null;

const validItems = computed(() =>
  props.items.filter((item) => Number.isFinite(item.count) && item.count > 0),
);
const total = computed(() =>
  validItems.value.reduce((sum, item) => sum + item.count, 0),
);
const palette = computed(() => {
  const colors = theme.current.value.colors;
  return [
    colors.primary,
    colors.success,
    colors.accent,
    colors.info,
    colors.warning,
    colors.muted,
  ];
});
const segments = computed(() =>
  validItems.value.map((item, index) => ({
    ...item,
    share: (item.count / total.value) * 100,
    color: palette.value[index % palette.value.length],
  })),
);
const accessibleLabel = computed(
  () => `${props.label}: ${formatNumber(total.value, 0)} ${props.totalLabel}`,
);
const chartData = computed<ChartData<"doughnut", number[], string>>(() => ({
  labels: segments.value.map((item) => item.name),
  datasets: [
    {
      label: props.label,
      data: segments.value.map((item) => item.count),
      backgroundColor: segments.value.map((item) => item.color),
      borderColor: theme.current.value.colors.surface,
      borderWidth: 3,
      borderRadius: 3,
      hoverOffset: 4,
      spacing: 2,
    },
  ],
}));
const chartOptions = computed<ChartOptions<"doughnut">>(() => {
  const colors = theme.current.value.colors;
  const scale =
    fontSizes.find((size) => size.value === appearance.fontSize)?.scale ?? 1;
  const font = {
    family: `"${appearance.font}", "Segoe UI", Tahoma, sans-serif`,
    size: 12 * scale,
  };

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    cutout: "74%",
    layout: { padding: 6 },
    locale: "ar-IQ-u-nu-latn",
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: true,
        textDirection: "rtl",
        titleAlign: "right",
        bodyAlign: "right",
        titleFont: font,
        bodyFont: font,
        backgroundColor: colors.surface,
        titleColor: colors["on-surface"],
        bodyColor: colors["on-surface"],
        borderColor: colors.border,
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: (context: TooltipItem<"doughnut">) => {
            const share = (context.parsed / total.value) * 100;
            return `${formatNumber(context.parsed, 0)} عرض (${formatNumber(share, 1)}%)`;
          },
        },
      },
    },
  };
});

function renderChart() {
  if (!canvas.value) {
    chart?.destroy();
    chart = null;
    return;
  }

  if (!chart) {
    chart = new Chart(canvas.value, {
      type: "doughnut",
      data: chartData.value,
      options: chartOptions.value,
    });
    performance.mark("dalaly:chart-drawn");
    return;
  }

  chart.data = chartData.value;
  chart.options = chartOptions.value;
  chart.update("none");
}

// Creating a chart reads the canvas's computed size, which forces a style
// recalculation of the page Vue has just rendered. Draw it after that page has
// painted, so the dashboard's figures appear first; later updates are direct.
let cancelFirstDraw: (() => void) | null = null;
function scheduleRender() {
  if (chart) return renderChart();
  cancelFirstDraw ??= afterNextPaint(() => {
    cancelFirstDraw = null;
    renderChart();
  });
}

onMounted(scheduleRender);
watch([canvas, chartData, chartOptions], scheduleRender, { flush: "post" });
onBeforeUnmount(() => {
  cancelFirstDraw?.();
  chart?.destroy();
});
</script>

<template>
  <v-sheet v-if="total > 0" class="distribution" color="transparent">
    <v-sheet class="distribution__ring" color="transparent">
      <canvas ref="canvas" role="img" :aria-label="accessibleLabel">
        {{ accessibleLabel }}
      </canvas>
      <v-sheet
        class="distribution__total"
        color="transparent"
        aria-hidden="true"
      >
        <strong>{{ formatNumber(total, 0) }}</strong>
        <span>{{ totalLabel }}</span>
      </v-sheet>
    </v-sheet>
    <v-sheet tag="ul" class="distribution__legend" color="transparent">
      <v-sheet
        v-for="(item, index) in segments"
        :key="`${item.name}-${index}`"
        tag="li"
        color="transparent"
      >
        <i :style="{ backgroundColor: item.color }" aria-hidden="true" />
        <span>{{ item.name }}</span>
        <b dir="ltr">{{ formatNumber(item.share, 1) }}%</b>
        <small dir="ltr">{{ formatNumber(item.count, 0) }}</small>
      </v-sheet>
    </v-sheet>
  </v-sheet>
  <EmptyState
    v-else
    icon="mdi-chart-donut"
    title="لا توجد بيانات للتوزيع"
    text="ستظهر أنواع العقارات عند إضافة عروض غير مؤرشفة."
  />
</template>

<style scoped>
.distribution {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(130px, 1fr);
  align-items: center;
  gap: 16px;
  min-height: 205px;
}
.distribution__ring {
  position: relative;
  max-width: 190px;
  width: 100%;
  height: 190px;
  margin: auto;
}
.distribution__ring canvas {
  display: block;
}
.distribution__total {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  pointer-events: none;
}
.distribution__total strong {
  font-size: calc(28px * var(--dal-font-scale));
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.distribution__total span {
  font-size: calc(10px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.distribution__legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.distribution__legend li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: calc(12px * var(--dal-font-scale));
}
.distribution__legend i {
  height: 7px;
  width: 7px;
  border-radius: 50%;
  flex: none;
}
.distribution__legend li > span {
  flex: 1;
}
.distribution__legend b,
.distribution__legend small {
  font-variant-numeric: tabular-nums;
}
.distribution__legend small {
  color: var(--dal-muted);
  min-width: 18px;
  text-align: end;
}
@media (max-width: 650px) {
  .distribution {
    grid-template-columns: 1fr;
  }
}
</style>
