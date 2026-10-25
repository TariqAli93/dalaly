<script setup lang="ts">
/**
 * لوح جانبي للسياق (زبون، مطابقة) فوق الصفحة دون مغادرتها. مبني على
 * v-dialog ليحصل على حبس التركيز والإغلاق بـ Esc وإرجاع التركيز عند
 * الإغلاق؛ يُثبَّت على الحافة اليسرى (نهاية السطر في RTL) بعرض محدود.
 */
import { watch } from "vue";

defineProps<{ title: string; subtitle?: string; width?: number }>();
const open = defineModel<boolean>({ required: true });

// v-dialog بلا activator لا يعيد التركيز عند الإغلاق؛ نعيده إلى ما فتح اللوح.
let opener: HTMLElement | null = null;
watch(open, (value) => {
  if (value) opener = document.activeElement as HTMLElement | null;
});
function restoreFocus() {
  if (opener?.isConnected) opener.focus();
  opener = null;
}
</script>

<template>
  <v-dialog
    v-model="open"
    :width="width ?? 440"
    content-class="dal-side-sheet"
    transition="slide-x-transition"
    scrollable
    @after-leave="restoreFocus"
  >
    <v-card class="dal-side-sheet__card" :aria-label="title">
      <header class="dal-side-sheet__header">
        <div class="dal-side-sheet__titles">
          <h2>{{ title }}</h2>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          aria-label="إغلاق"
          @click="open = false"
        />
      </header>
      <v-card-text class="dal-side-sheet__body">
        <slot />
      </v-card-text>
      <footer v-if="$slots.actions" class="dal-side-sheet__actions">
        <slot name="actions" />
      </footer>
    </v-card>
  </v-dialog>
</template>

<style>
/* خارج scoped: محتوى v-dialog يُنقل إلى طبقة التراكب. */
.v-overlay__content.dal-side-sheet {
  margin: 0;
  position: fixed;
  inset-block: 0;
  left: 0;
  max-height: 100dvh !important;
  height: 100dvh;
  max-width: 100vw;
}
.dal-side-sheet__card {
  height: 100%;
  border-radius: 0 !important;
  display: flex;
  flex-direction: column;
}
.dal-side-sheet__header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--dal-stroke);
}
.dal-side-sheet__titles {
  flex: 1;
  min-width: 0;
}
.dal-side-sheet__titles h2 {
  margin: 0;
  font-size: calc(16px * var(--dal-font-scale));
  font-weight: 700;
}
.dal-side-sheet__titles p {
  margin: 2px 0 0;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.dal-side-sheet__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px !important;
}
.dal-side-sheet__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--dal-stroke);
}
</style>
