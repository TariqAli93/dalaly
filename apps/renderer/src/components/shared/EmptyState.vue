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
    size="40"
    class="workspace-empty"
  >
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </v-empty-state>
</template>

<style scoped>
.workspace-empty {
  min-height: 0;
  padding: 28px 20px;
}
.workspace-empty :deep(.v-empty-state__media .v-icon) {
  font-size: calc(40px * var(--dal-font-scale));
}
.workspace-empty :deep(.v-empty-state__title) {
  font-size: calc(15px * var(--dal-font-scale));
  font-weight: 600;
}
.workspace-empty :deep(.v-empty-state__text) {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>
