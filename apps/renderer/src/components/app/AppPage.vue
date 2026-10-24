<script setup lang="ts">
import { watch } from "vue";
import PageHeader from "../shared/PageHeader.vue";
import { usePageTitle } from "../../composables/usePageTitle";

// إطار كل صفحة داخل AppLayout: ترويستها (العنوان والوصف وأزرارها) ثم محتواها،
// وتنقل عنوانها إلى الشريط العلوي. القائمة والشريط العلوي في AppLayout فلا
// يُعاد تركيبهما مع كل تنقّل.
const props = defineProps<{ title?: string; subtitle?: string }>();

const { setPageTitle } = usePageTitle();
watch(() => props.title, setPageTitle, { immediate: true });
</script>

<template>
  <PageHeader :title="title ?? 'دلالي'" :subtitle="subtitle">
    <template v-if="$slots['header-actions']" #default>
      <slot name="header-actions" />
    </template>
  </PageHeader>
  <slot />
</template>
