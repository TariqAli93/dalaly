<script setup lang="ts">
import { computed } from "vue";
import type { DetailSection } from "./record";

/**
 * تفاصيل السجل مجموعاتٍ بعناوين، كل حقل وسم فوق قيمة في شبكة مضغوطة. الحقل
 * الفارغ لا يُعرض، فلا صفوف «-» تملأ الشاشة؛ والمجموعة بلا حقول تُحذف.
 */
const props = defineProps<{ sections: DetailSection[] }>();

const visible = computed(() =>
  props.sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.value !== null && item.value !== undefined && item.value !== "",
      ),
    }))
    .filter((section) => section.items.length),
);
</script>

<template>
  <div class="detail-list">
    <section
      v-for="section in visible"
      :key="section.title"
      class="detail-list__section"
    >
      <h2 class="detail-list__title">{{ section.title }}</h2>
      <dl class="detail-list__grid">
        <div
          v-for="item in section.items"
          :key="item.label"
          class="detail-list__item"
        >
          <dt>{{ item.label }}</dt>
          <dd :dir="item.ltr ? 'ltr' : 'auto'">{{ item.value }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.detail-list__section + .detail-list__section {
  margin-top: 16px;
}
.detail-list__title {
  margin: 0 0 6px;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
}
.detail-list__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0 16px;
  margin: 0;
}
.detail-list__item {
  padding: 6px 0;
  border-bottom: 1px solid var(--dal-stroke);
  min-width: 0;
}
.detail-list__item dt {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
  line-height: 1.5;
}
.detail-list__item dd {
  margin: 0;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
  unicode-bidi: isolate;
  white-space: pre-line;
}
</style>
