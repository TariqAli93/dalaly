<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { cellText, type ReportFigure } from "../../utils/reportDocument";
import type { Currency } from "../../types";

/**
 * أرقام التقرير الإجمالية: لوح واحد بعرض جداوله، خلايا متساوية بخطوط رفيعة
 * بينها، في كل خلية وسمها فوق رقمها ورمز العملة أصغر بجانبه. الصفوف متوازنة
 * (ثمانية أرقام صفّان من أربعة لا ستة واثنان)، والأرقام في صف واحد على خط
 * واحد ولو التفّ وسم. اللون للحالة وحدها، والصفر باهت.
 */
const props = defineProps<{ figures: ReportFigure[]; currency: Currency }>();

/** Narrowest cell that keeps a nine-digit amount on one line. */
const MIN_CELL = 180;

const root = ref<HTMLElement | null>(null);
const columns = ref(props.figures.length);
let resize: ResizeObserver | null = null;

function layout() {
  const element = root.value;
  if (!element) return;
  const scale =
    parseFloat(
      getComputedStyle(element).getPropertyValue("--dal-font-scale"),
    ) || 1;
  const count = props.figures.length;
  const fit = Math.max(1, Math.floor(element.clientWidth / (MIN_CELL * scale)));
  const rows = Math.ceil(count / Math.min(fit, count));
  columns.value = Math.ceil(count / rows);
}

onMounted(() => {
  resize = new ResizeObserver(layout);
  if (root.value) resize.observe(root.value);
});
onBeforeUnmount(() => resize?.disconnect());

/** formatAmount ends «1,250 د.ع» / «1,250.50 $»: the unit is set apart. */
function parts(figure: ReportFigure) {
  const kind = figure.kind ?? "money";
  const text = cellText(figure.value, kind, props.currency) || "—";
  const at = kind === "money" ? text.lastIndexOf(" ") : -1;
  return at < 0
    ? { number: text, unit: "" }
    : { number: text.slice(0, at), unit: text.slice(at + 1) };
}

const isZero = (figure: ReportFigure) =>
  /^-?0+(\.0+)?$/.test(String(figure.value ?? "").trim());
</script>

<template>
  <div ref="root" class="dal-panel figures">
    <dl class="figures__grid" :style="{ '--figure-cols': columns }">
      <div
        v-for="figure in figures"
        :key="figure.label"
        class="figures__cell"
        :class="
          isZero(figure)
            ? 'figures__cell--zero'
            : figure.tone && `figures__cell--${figure.tone}`
        "
      >
        <dt class="figures__label">{{ figure.label }}</dt>
        <dd class="figures__value">
          <bdi class="figures__number">{{ parts(figure).number }}</bdi>
          <span v-if="parts(figure).unit" class="figures__unit">{{
            parts(figure).unit
          }}</span>
        </dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.figures {
  margin-bottom: 12px;
}
/* Every cell draws its start and top hairline; the grid sits 1px past the
   panel's start and top edge, so the panel clips the outer ones and only the
   lines between cells remain, however the rows wrap. */
.figures__grid {
  display: grid;
  grid-template-columns: repeat(var(--figure-cols), minmax(0, 1fr));
  margin: -1px 0 0;
  margin-inline-start: -1px;
}
.figures__cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 12px 16px;
  border-inline-start: 1px solid var(--dal-stroke);
  border-top: 1px solid var(--dal-stroke);
}
.figures__label {
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.4;
  color: var(--dal-muted);
}
/* Pushed to the cell's foot so a row's numbers share one line. */
.figures__value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: auto 0 0;
  white-space: nowrap;
  color: rgb(var(--v-theme-on-surface));
}
.figures__number {
  font-size: calc(20px * var(--dal-font-scale));
  font-weight: 700;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}
.figures__unit {
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  color: var(--dal-muted);
}
.figures__cell--good .figures__number {
  color: rgb(var(--v-theme-success));
}
.figures__cell--bad .figures__number {
  color: rgb(var(--v-theme-error));
}
.figures__cell--warn .figures__number {
  color: rgb(var(--v-theme-warning));
}
.figures__cell--zero .figures__value {
  color: var(--dal-muted);
}
</style>
