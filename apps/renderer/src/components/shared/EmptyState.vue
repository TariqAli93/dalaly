<script setup lang="ts">
/**
 * حالة فارغة موحّدة — مكوّن عرض بحت يغلّف v-empty-state.
 * يفرض وجود عنوان ونصّ إرشادي، ويمرّر فتحة actions للإجراء المقترح،
 * حتى تُعلّم الحالةُ الفارغة المستخدمَ الخطوة التالية بدل "لا يوجد" فقط.
 */
defineProps<{
  icon?: string;
  title: string;
  text?: string;
}>();
</script>

<template>
  <v-empty-state
    :icon="icon"
    :title="title"
    :text="text"
    size="24"
    class="workspace-empty"
  >
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </v-empty-state>
</template>

<style scoped>
/* أيقونة صغيرة على مربع هادئ بدل أيقونة 40px عائمة: الحالة تُقرأ من عنوانها
   وخطوتها التالية، والأيقونة إشارة لا زينة. */
.workspace-empty {
  min-height: 0;
  padding: 28px 20px;
}
.workspace-empty :deep(.v-empty-state__media) {
  display: grid;
  place-items: center;
  width: calc(48px * var(--dal-font-scale));
  height: calc(48px * var(--dal-font-scale));
  margin-bottom: 12px;
  border-radius: var(--dal-radius-card);
  background: var(--dal-hover);
  color: var(--dal-muted);
}
.workspace-empty :deep(.v-empty-state__media .v-icon) {
  font-size: calc(24px * var(--dal-font-scale));
}
.workspace-empty :deep(.v-empty-state__title) {
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
  line-height: 1.5;
}
.workspace-empty :deep(.v-empty-state__text) {
  max-width: 44ch;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
  text-wrap: pretty;
}
.workspace-empty :deep(.v-empty-state__actions) {
  margin-top: 12px;
  gap: 8px;
}
</style>
