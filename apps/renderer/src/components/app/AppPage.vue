<script setup lang="ts">
import { watch } from "vue";
import { usePageTitle, type PageParent } from "../../composables/usePageTitle";

// إطار كل صفحة داخل AppLayout. العنوان وسياقه (رابط القائمة الأم وعدد
// النتائج) وأوامر الصفحة تذهب إلى شريط الأوامر الثابت، فلا ترويسة داخل
// المحتوى ولا عنوان مكرّر. subtitle لصفحات لم تُنقل بعد إلى النظام الجديد:
// سطر صغير فوق المحتوى بدل ترويسة.
const props = defineProps<{
  title?: string;
  subtitle?: string;
  parent?: PageParent | null;
  count?: number | null;
}>();

const { setPageTitle, setPageParent, setPageCount } = usePageTitle();
// تُكتب القيم الثلاث دائماً، فلا يرث شريط الأوامر رابطاً أو عدداً من صفحة سابقة.
watch(() => props.title, setPageTitle, { immediate: true });
watch(() => props.parent, setPageParent, { immediate: true });
watch(() => props.count, setPageCount, { immediate: true });
</script>

<template>
  <Teleport v-if="$slots['header-actions']" defer to="#dal-page-actions">
    <slot name="header-actions" />
  </Teleport>
  <Teleport v-if="$slots.status" defer to="#dal-page-status">
    <slot name="status" />
  </Teleport>
  <p v-if="subtitle" class="dal-page-note">{{ subtitle }}</p>
  <slot />
</template>
