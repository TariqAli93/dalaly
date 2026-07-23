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
  <v-empty-state :icon="icon" :title="title" :text="text">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </v-empty-state>
</template>
