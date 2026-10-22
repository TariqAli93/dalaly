<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useTheme } from "vuetify";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type Plugin,
  type TooltipItem,
} from "chart.js";
import EmptyState from "./EmptyState.vue";
import { appearance, fontSizes } from "../../composables/useAppearance";
import { formatNumber } from "../../utils/format";
import { afterNextPaint } from "../../utils/schedule";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const props = defineProps<{
  points: Array<{ month: string; label: string; created: number }>;
  label: string;
}>();
const theme = useTheme();
const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart<"bar", number[], string> | null = null;

const points = computed(() =>
  props.points
    .filter((point) => Number.isFinite(point.created) && point.created >= 0)
    .sort((left, right) => left.month.localeCompare(right.month)),
);
const total = computed(() =>
  points.value.reduce((sum, point) => sum + point.created, 0),
);
const accessibleLabel = computed(
  () =>
    `${props.label}: ${points.value
      .map((point) => `${point.month}: ${formatNumber(point.created, 0)}`)
      .join("، ")}`,
);
const chartFont = computed(() => ({
  family: `"${appearance.font}", "Segoe UI", Tahoma, sans-serif`,
  size:
    12 *
    (fontSizes.find((size) => size.value === appearance.fontSize)?.scale ?? 1),
}));
const chartData = computed<ChartData<"bar", number[], string>>(() => ({
  labels: points.value.map((point) => point.label),
  datasets: [
    {
      label: props.label,
      data: points.value.map((point) => point.created),
      backgroundColor: theme.current.value.colors.primary,
      borderRadius: 5,
      maxBarThickness: 32,
      categoryPercentage: 0.65,
      barPercentage: 0.8,
    },
  ],
}));
const chartOptions = computed<ChartOptions<"bar">>(() => {
  const colors = theme.current.value.colors;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    locale: "ar-IQ-u-nu-latn",
    layout: { padding: { top: 18 } },
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        grid: { display: false },
        border: { color: colors.border },
        ticks: {
          color: colors.muted,
          font: chartFont.value,
          maxRotation: 0,
          minRotation: 0,
        },
      },
      y: {
        beginAtZero: true,
        suggestedMax: 1,
        grace: "20%",
        border: { display: false },
        grid: { color: colors.border },
        ticks: {
          precision: 0,
          maxTicksLimit: 5,
          color: colors.muted,
          font: chartFont.value,
          callback: (value) => formatNumber(value, 0),
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: true,
        textDirection: "rtl",
        titleAlign: "right",
        bodyAlign: "right",
        titleFont: chartFont.value,
        bodyFont: chartFont.value,
        backgroundColor: colors.surface,
        titleColor: colors["on-surface"],
        bodyColor: colors["on-surface"],
        borderColor: colors.border,
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          title: (items: TooltipItem<"bar">[]) => {
            const point = points.value[items[0]?.dataIndex ?? -1];
            return point
              ? new Date(`${point.month}-01T00:00:00Z`).toLocaleDateString(
                  "ar-IQ",
                  {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                    numberingSystem: "latn",
                  },
                )
              : "";
          },
          label: (context: TooltipItem<"bar">) =>
            `${props.label}: ${formatNumber(context.parsed.y, 0)}`,
        },
      },
    },
  };
});
const valueLabels: Plugin<"bar"> = {
  id: "offerTrendValues",
  afterDatasetsDraw(instance) {
    const context = instance.ctx;
    context.save();
    context.font = `${chartFont.value.size}px ${chartFont.value.family}`;
    context.fillStyle = theme.current.value.colors.muted;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    instance.getDatasetMeta(0).data.forEach((element, index) => {
      context.fillText(
        formatNumber(instance.data.datasets[0].data[index], 0),
        element.x,
        element.y - 5,
      );
    });
    context.restore();
  },
};

function renderChart() {
  if (!canvas.value) {
    chart?.destroy();
    chart = null;
    return;
  }
  if (!chart) {
    chart = new Chart(canvas.value, {
      type: "bar",
      data: chartData.value,
      options: chartOptions.value,
      plugins: [valueLabels],
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
  <v-sheet v-if="points.length" class="offer-trend" color="transparent">
    <v-sheet class="offer-trend__plot" color="transparent">
      <canvas ref="canvas" role="img" :aria-label="accessibleLabel">
        {{ accessibleLabel }}
      </canvas>
    </v-sheet>
    <v-sheet
      v-if="total === 0"
      tag="p"
      class="offer-trend__empty"
      color="transparent"
      dir="rtl"
    >
      لا توجد عروض جديدة خلال هذه الفترة.
    </v-sheet>
  </v-sheet>
  <EmptyState
    v-else
    icon="mdi-chart-bar"
    title="لا توجد بيانات للعروض الجديدة"
    text="ستظهر الأعداد الشهرية عند إضافة عروض."
  />
</template>

<style scoped>
.offer-trend {
  direction: ltr;
  padding-top: 12px;
}
.offer-trend__plot {
  height: 210px;
  position: relative;
}
.offer-trend__plot canvas {
  display: block;
}
.offer-trend__empty {
  margin: 8px 0 0;
  text-align: center;
  font-size: calc(11px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>
