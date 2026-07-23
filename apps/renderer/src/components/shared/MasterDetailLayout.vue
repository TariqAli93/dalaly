<script setup lang="ts">
/**
 * تخطيط Master–Detail مكتبي — مكوّن عرض بحت.
 * القائمة/الجدول في الفتحة main، وتفاصيل العنصر المحدد في الفتحة detail.
 * على سطح المكتب: عمودان جنباً إلى جنب. على النوافذ الضيقة (≤1100px):
 * يتحوّل جزء التفاصيل إلى Drawer معلّق فوق المحتوى مع خلفية معتمة.
 * لا يحمل أي حالة أعمال؛ فتح/إغلاق الـ pane يتحكّم به الأب.
 */
defineProps<{ open?: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div class="dal-md" :class="{ 'dal-md--open': open }">
    <div class="dal-md__main">
      <slot name="main" />
    </div>
    <div v-if="open" class="dal-md__scrim" @click="emit('close')" />
    <aside v-if="open" class="dal-md__detail">
      <slot name="detail" />
    </aside>
  </div>
</template>

<style scoped>
.dal-md {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}
.dal-md__main {
  flex: 1 1 auto;
  min-width: 0;
}
.dal-md__detail {
  flex: 0 0 340px;
  width: 340px;
  align-self: stretch;
  border-inline-start: 1px solid var(--dal-stroke);
  background: rgb(var(--v-theme-surface));
  position: sticky;
  top: 8px;
  max-height: calc(100vh - 60px);
  overflow: auto;
}
.dal-md__scrim {
  display: none;
}
@media (max-width: 1100px) {
  .dal-md__detail {
    position: fixed;
    inset-block: 44px 0;
    inset-inline-start: 0;
    width: min(360px, 100%);
    max-height: none;
    top: auto;
    z-index: 40;
    box-shadow: var(--dal-shadow-pop);
  }
  .dal-md__scrim {
    display: block;
    position: fixed;
    inset: 44px 0 0 0;
    z-index: 39;
    background: rgba(0, 0, 0, 0.32);
  }
}
</style>
