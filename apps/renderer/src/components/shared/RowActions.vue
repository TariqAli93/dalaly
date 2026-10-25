<script setup lang="ts">
import { computed } from "vue";
import type { RowAction } from "./grid";

/**
 * أوامر صف: الأوامر inline أيقونات بأسماء مقروءة، والبقية خلف «المزيد» الذي
 * يفتح قائمة الجدول الواحدة (DataGrid). الأزرار خارج ترتيب Tab: الصف نفسه
 * وحدة لوحة المفاتيح، وShift+F10 عليه يفتح القائمة بكل الأوامر مكتوبةً.
 * التلميح title أصلي لا v-tooltip: مكوّنا تلميح لكل صف كانا يبطئان رسم 100
 * صف بنحو الربع على جهاز بطيء، ولوحة المفاتيح لا تصل إلى هذه الأزرار أصلاً.
 */
const props = defineProps<{ actions: RowAction[]; label: string }>();
const emit = defineEmits<{ more: [HTMLElement] }>();

const inline = computed(() =>
  props.actions.filter((action) => action.inline && !action.danger),
);
const hasMore = computed(() =>
  props.actions.some((action) => !action.inline || action.danger),
);
</script>

<template>
  <div class="row-actions">
    <v-btn
      v-for="action in inline"
      :key="action.key"
      :icon="action.icon"
      :color="action.color"
      :title="action.label"
      :aria-label="`${action.label}: ${label}`"
      :aria-pressed="action.pressed"
      variant="text"
      size="small"
      tabindex="-1"
      @click.stop="action.run()"
    />
    <v-btn
      v-if="hasMore"
      icon="mdi-dots-horizontal"
      variant="text"
      size="small"
      title="أوامر أخرى"
      :aria-label="`أوامر أخرى: ${label}`"
      aria-haspopup="menu"
      data-row-menu
      tabindex="-1"
      @click.stop="emit('more', $event.currentTarget as HTMLElement)"
    />
  </div>
</template>

<style scoped>
.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
</style>
