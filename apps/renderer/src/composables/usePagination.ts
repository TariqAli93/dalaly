import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

/** CSS pixels at 96 dpi, as Chromium lays out and prints. */
export const mmToPx = (mm: number) => (mm * 96) / 25.4;

export type PageGeometry = {
  /** page height, px */
  pageHeight: number;
  /** text area height (page minus top and bottom margins), px */
  contentHeight: number;
  /** space between pages on screen, px */
  gap: number;
  /** current zoom; measurements are divided by it */
  scale: number;
};

/**
 * Lays a contract's flow out on A4 pages the way printing does. Every
 * `[data-unit]` stays whole: one that would cross the bottom of the text area
 * moves to the next page (CSS `break-inside: avoid` when printing), a
 * `[data-keep]` unit moves with the one after it, and `[data-break]` starts a
 * new page. The move is a `--dc-gap` margin on the unit, so units are never
 * re-parented and an editor keeps its caret.
 *
 * Re-runs (once per frame at most) when a unit's size changes or units are
 * added or removed. A unit taller than a page is reported in `oversized`.
 */
export function usePagination(
  flow: Ref<HTMLElement | null>,
  geometry: Ref<PageGeometry>,
) {
  const pageCount = ref(1);
  const oversized = ref<HTMLElement[]>([]);
  let frame = 0;
  const observed = new Set<Element>();
  let resize: ResizeObserver | null = null;
  let mutations: MutationObserver | null = null;

  function schedule() {
    if (!frame) frame = requestAnimationFrame(layout);
  }

  function units(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLElement>("[data-unit], [data-break]")];
  }

  function syncObserved(list: HTMLElement[]) {
    if (!resize) return;
    const current = new Set<Element>(list);
    for (const element of observed)
      if (!current.has(element)) {
        resize.unobserve(element);
        observed.delete(element);
      }
    for (const element of list)
      if (!observed.has(element)) {
        resize.observe(element);
        observed.add(element);
      }
  }

  function layout() {
    frame = 0;
    const root = flow.value;
    if (!root) return;
    const { pageHeight, contentHeight, gap, scale } = geometry.value;
    const stride = pageHeight + gap;
    const list = units(root);
    syncObserved(list);
    for (const unit of list) unit.style.removeProperty("--dc-gap");

    const top = root.getBoundingClientRect().top;
    const boxes = list.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        element,
        top: (rect.top - top) / scale,
        height: rect.height / scale,
        keep: element.hasAttribute("data-keep"),
        brk: element.hasAttribute("data-break"),
      };
    });

    const gaps: Array<{ element: HTMLElement; page: number; size: number }> =
      [];
    const tall: HTMLElement[] = [];
    let offset = 0;
    let page = 0;
    let forced = false;
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index]!;
      if (box.brk) {
        forced = true;
        continue;
      }
      let start = box.top + offset;
      while (start >= (page + 1) * stride - 0.5) page++;
      const pageTop = page * stride;
      let move = forced && start > pageTop + 0.5;
      forced = false;
      if (!move && start > pageTop + 0.5) {
        let end = start + box.height;
        const next = boxes[index + 1];
        if (box.keep && next && !next.brk)
          end = Math.max(
            end,
            next.top + offset + Math.min(next.height, contentHeight / 3),
          );
        if (end > pageTop + contentHeight + 0.5) move = true;
      }
      if (move) {
        const size = (page + 1) * stride - start;
        page++;
        gaps.push({ element: box.element, page, size });
        offset += size;
        start += size;
      }
      if (box.height > contentHeight + 0.5) {
        tall.push(box.element);
        page += Math.floor((start - page * stride + box.height) / stride);
      }
    }

    // Apply in order, correcting for collapsed margins as each one lands.
    for (const item of gaps) {
      item.element.style.setProperty("--dc-gap", `${item.size}px`);
      const landed = (item.element.getBoundingClientRect().top - top) / scale;
      const delta = item.page * stride - landed;
      if (Math.abs(delta) > 0.5)
        item.element.style.setProperty("--dc-gap", `${item.size + delta}px`);
    }

    const height = root.scrollHeight;
    pageCount.value = Math.max(1, page + 1, Math.ceil((height + 1) / stride));
    oversized.value = tall;
  }

  onMounted(() => {
    resize = new ResizeObserver(schedule);
    mutations = new MutationObserver(schedule);
    if (flow.value)
      mutations.observe(flow.value, { childList: true, subtree: true });
    schedule();
    // Web fonts change line heights once they load.
    void document.fonts?.ready.then(schedule);
  });

  watch(flow, (element) => {
    mutations?.disconnect();
    if (element)
      mutations?.observe(element, { childList: true, subtree: true });
    schedule();
  });
  watch(geometry, schedule, { deep: true });

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    resize?.disconnect();
    mutations?.disconnect();
    observed.clear();
  });

  return { pageCount, oversized, relayout: schedule };
}

let scopeCounter = 0;
/** A unique class to scope one sheet's document CSS. */
export function newSheetScope() {
  scopeCounter += 1;
  return `dcs-${scopeCounter}`;
}

/** A <style> element in <head> that follows `css` and goes away with the component. */
export function useScopedCss(css: Ref<string>) {
  const element = document.createElement("style");
  element.dataset.contractSheet = "";
  document.head.append(element);
  watch(css, (value) => (element.textContent = value), { immediate: true });
  onBeforeUnmount(() => element.remove());
}
