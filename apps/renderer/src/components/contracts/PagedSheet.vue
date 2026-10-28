<script setup lang="ts">
import { computed, useTemplateRef, watch } from "vue";
import {
  bandText,
  documentCss,
  pageMetrics,
  type ContractDocument,
  type RenderContext,
} from "@contract-document/index";
import {
  mmToPx,
  newSheetScope,
  usePagination,
  useScopedCss,
} from "../../composables/usePagination";

/**
 * A4 pages on screen: the page frames with their margins, the header and
 * footer bands with page numbers, and the document flow laid over them by
 * usePagination. The slot is the flow (read-only HTML or the editor).
 */
const props = defineProps<{
  document: ContractDocument;
  ctx: RenderContext;
  zoom: number;
}>();
const emit = defineEmits<{ pages: [number]; oversized: [HTMLElement[]] }>();

const GAP = 24;
const scope = newSheetScope();
useScopedCss(
  computed(() => documentCss(props.document, { scope: `.${scope}` })),
);

const size = computed(() => {
  const metrics = pageMetrics(props.document);
  return {
    width: mmToPx(metrics.width),
    height: mmToPx(metrics.height),
    top: mmToPx(metrics.top),
    bottom: mmToPx(metrics.bottom),
    start: mmToPx(metrics.start),
    end: mmToPx(metrics.end),
  };
});
const geometry = computed(() => ({
  pageHeight: size.value.height,
  contentHeight: size.value.height - size.value.top - size.value.bottom,
  gap: GAP,
  scale: props.zoom,
}));

const flow = useTemplateRef<HTMLElement>("flow");
const { pageCount, oversized, relayout } = usePagination(flow, geometry);
watch(pageCount, (count) => emit("pages", count));
watch(oversized, (list, previous) => {
  for (const element of previous ?? [])
    element.classList.remove("dc-oversized");
  for (const element of list) element.classList.add("dc-oversized");
  emit("oversized", list);
});

const totalHeight = computed(
  () => pageCount.value * (size.value.height + GAP) - GAP,
);
const header = computed(() =>
  props.document.header.enabled
    ? bandText(props.document.header, props.ctx)
    : "",
);
const footer = computed(() =>
  props.document.footer.enabled
    ? bandText(props.document.footer, props.ctx)
    : "",
);
const bandFont = computed(() => ({
  fontFamily: `"${props.document.theme.font_family}", Tahoma, sans-serif`,
}));
const alignOf = (align: string) =>
  align === "center" ? "center" : align === "end" ? "left" : "right";

defineExpose({ relayout, pageCount });
</script>

<template>
  <div
    class="sheet-zoom"
    :style="{
      width: `${size.width * zoom}px`,
      height: `${totalHeight * zoom}px`,
    }"
  >
    <div
      class="sheet"
      :style="{
        width: `${size.width}px`,
        height: `${totalHeight}px`,
        transform: `scale(${zoom})`,
      }"
    >
      <div
        v-for="page in pageCount"
        :key="page"
        class="sheet-page"
        :style="{
          top: `${(page - 1) * (size.height + GAP)}px`,
          height: `${size.height}px`,
        }"
        :aria-label="`الصفحة ${page} من ${pageCount}`"
      >
        <div
          v-if="header"
          class="sheet-band sheet-band--top"
          :style="{
            ...bandFont,
            height: `${size.top}px`,
            right: `${size.start}px`,
            left: `${size.end}px`,
            fontSize: `${document.header.font_size}pt`,
            textAlign: alignOf(document.header.align),
          }"
        >
          {{ header }}
        </div>
        <div
          v-if="
            document.footer.enabled && (footer || document.footer.page_numbers)
          "
          class="sheet-band sheet-band--bottom"
          :style="{
            ...bandFont,
            height: `${size.bottom}px`,
            right: `${size.start}px`,
            left: `${size.end}px`,
            fontSize: `${document.footer.font_size}pt`,
            textAlign: alignOf(document.footer.align),
          }"
        >
          {{ footer
          }}<template v-if="footer && document.footer.page_numbers">
            &nbsp;&nbsp;—&nbsp;&nbsp;</template
          ><template v-if="document.footer.page_numbers"
            >صفحة {{ page }} من {{ pageCount }}</template
          >
        </div>
        <div v-if="ctx.watermark" class="sheet-watermark" aria-hidden="true">
          <span :style="bandFont">{{ ctx.watermark }}</span>
        </div>
      </div>
      <div
        ref="flow"
        class="sheet-flow"
        :class="scope"
        :style="{
          top: `${size.top}px`,
          right: `${size.start}px`,
          left: `${size.end}px`,
        }"
      >
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* LTR box: the unscaled sheet (wider than this box when zoomed out) must
   start at its left edge, where the top-left transform origin is. */
.sheet-zoom {
  direction: ltr;
  margin-inline: auto;
  flex: 0 0 auto;
}
.sheet {
  position: relative;
  direction: ltr;
  transform-origin: 0 0;
}
.sheet-page {
  position: absolute;
  inset-inline: 0;
  background: #fff;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.sheet-band {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  direction: rtl;
  color: #555;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
}
.sheet-band--top {
  top: 0;
  padding-bottom: 4mm;
}
.sheet-band--bottom {
  bottom: 0;
  justify-content: flex-start;
  padding-top: 4mm;
}
.sheet-watermark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.sheet-watermark span {
  transform: rotate(-30deg);
  font-size: 110pt;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.06);
}
.sheet-flow {
  position: absolute;
  min-height: 1px;
}
.sheet-flow :deep(.dc-oversized) {
  outline: 2px dashed rgb(var(--v-theme-warning));
  outline-offset: 2px;
}
</style>
