<script setup lang="ts">
import { computed, ref } from "vue";
import {
  bodyHtml,
  type ContractDocument,
  type RenderContext,
} from "@contract-document/index";
import PagedSheet from "./PagedSheet.vue";

/**
 * The contract exactly as it prints, read-only, on paginated A4 pages. The
 * HTML comes from the shared renderer, which escapes every value, so v-html
 * carries no markup from user input.
 */
const props = withDefaults(
  defineProps<{
    document: ContractDocument;
    ctx: RenderContext;
    zoom?: number;
  }>(),
  { zoom: 1 },
);
const emit = defineEmits<{ pages: [number] }>();
const html = computed(() => bodyHtml(props.document, props.ctx));
const pages = ref(1);
function onPages(count: number) {
  pages.value = count;
  emit("pages", count);
}
defineExpose({ pages });
</script>

<template>
  <PagedSheet
    :document="document"
    :ctx="ctx"
    :zoom="zoom"
    class="contract-preview"
    @pages="onPages"
  >
    <!-- eslint-disable-next-line vue/no-v-html -- escaped by the shared renderer -->
    <div v-html="html" />
  </PagedSheet>
</template>
