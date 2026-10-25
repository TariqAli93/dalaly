<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from "vue";

/**
 * تخطيط Master–Detail مكتبي — مكوّن عرض بحت.
 * القائمة/الجدول في الفتحة main، وتفاصيل العنصر المحدد في الفتحة detail.
 * على سطح المكتب: عمودان جنباً إلى جنب. على النوافذ الضيقة (≤1100px، ومنها
 * 1366px بتكبير 125%): يطفو جزء التفاصيل فوق المحتوى مع خلفية معتمة، ويأخذ
 * التركيز، وEsc يغلقه.
 * fill: يملأ ارتفاع مساحة العمل، فيتمرّر الجدول واللوحة كلٌّ في مكانه.
 * لا يحمل أي حالة أعمال؛ فتح/إغلاق الـ pane يتحكّم به الأب.
 */
const props = defineProps<{
  open?: boolean;
  fill?: boolean;
  detailLabel?: string;
}>();
const emit = defineEmits<{ close: [] }>();

const detail = useTemplateRef<HTMLElement>("detail");
const overlayQuery = window.matchMedia?.("(max-width: 1100px)");

// طافياً يأخذ التركيز فوراً، وإلا بقي خلف الجدول في ترتيب Tab.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen || !overlayQuery?.matches) return;
    void nextTick(() =>
      detail.value
        ?.querySelector<HTMLElement>(
          "button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        )
        ?.focus(),
    );
  },
);
</script>

<template>
  <div class="dal-md" :class="{ 'dal-md--open': open, 'dal-md--fill': fill }">
    <div class="dal-md__main">
      <slot name="main" />
    </div>
    <div v-if="open" class="dal-md__scrim" @click="emit('close')" />
    <aside
      v-if="open"
      ref="detail"
      class="dal-md__detail"
      :aria-label="detailLabel"
      @keydown.esc.stop="emit('close')"
    >
      <slot name="detail" />
    </aside>
  </div>
</template>

<style scoped>
.dal-md {
  display: flex;
  align-items: flex-start;
  gap: var(--dal-gutter);
}
.dal-md__main {
  flex: 1 1 auto;
  min-width: 0;
}
.dal-md__detail {
  flex: 0 0 340px;
  width: 340px;
  align-self: flex-start;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
  background: rgb(var(--v-theme-surface));
  position: sticky;
  top: calc(var(--dal-bar-height) + var(--dal-gutter));
  max-height: calc(100dvh - var(--dal-bar-height) - 2 * var(--dal-gutter));
  overflow: auto;
}
/* يملأ مساحة العمل: لا تمرير للصفحة كلها، بل للجدول واللوحة كلٍّ وحده. */
.dal-md--fill {
  align-items: stretch;
  height: calc(100dvh - var(--dal-bar-height) - 2 * var(--dal-gutter));
  min-height: 360px;
}
.dal-md--fill > .dal-md__main {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.dal-md--fill > .dal-md__detail {
  position: static;
  align-self: stretch;
  max-height: none;
}
.dal-md__scrim {
  display: none;
}
@media (max-width: 1100px) {
  .dal-md__detail,
  .dal-md--fill > .dal-md__detail {
    position: fixed;
    inset-block: var(--dal-bar-height) 0;
    /* من الحافة الأخرى: على inline-start (يمين RTL) يختفي تحت لوحة التنقّل. */
    inset-inline-end: 0;
    width: min(360px, 100%);
    max-height: none;
    z-index: 40;
    border-radius: 0;
    box-shadow: var(--dal-shadow-pop);
  }
  .dal-md__scrim {
    display: block;
    position: fixed;
    inset: var(--dal-bar-height) 0 0 0;
    z-index: 39;
    background: var(--dal-scrim);
  }
}
</style>
