<script setup lang="ts">
import { useId } from "vue";

/**
 * مجموعة حقول بعنوان داخل نموذج صفحة: fieldset وlegend حقيقيان (يقرؤهما قارئ
 * الشاشة مع كل حقل)، وشبكة 3 أعمدة تصير 2 ثم 1 حين يضيق العرض. لا بطاقة.
 *
 * `collapsible`: قسم اختياري يُطوى خلف زر في العنوان (aria-expanded)، ويذكر
 * وهو مطوي ما فيه (`summary`). الحقول تبقى مركّبة (v-show)، فلا تضيع قيمها ولا
 * تخرج من تحقق النموذج؛ `section` يسمّي القسم ليفتحه النموذج قبل التركيز على
 * حقل خاطئ فيه (useFormSections).
 */
withDefaults(
  defineProps<{
    title: string;
    columns?: 1 | 2 | 3;
    collapsible?: boolean;
    summary?: string;
    section?: string;
  }>(),
  { columns: 3, collapsible: false, summary: "", section: undefined },
);
const open = defineModel<boolean>("open", { default: true });
const bodyId = useId();
</script>

<template>
  <fieldset
    class="form-section"
    :class="{ 'form-section--closed': collapsible && !open }"
    :data-section="section"
  >
    <legend class="form-section__title">
      <button
        v-if="collapsible"
        type="button"
        class="form-section__toggle"
        :aria-expanded="open"
        :aria-controls="bodyId"
        @click="open = !open"
      >
        <v-icon
          :icon="open ? 'mdi-chevron-down' : 'mdi-chevron-left'"
          size="20"
          aria-hidden="true"
        />
        <span>{{ title }}</span>
        <span v-if="summary" class="form-section__summary">{{ summary }}</span>
      </button>
      <template v-else>{{ title }}</template>
    </legend>
    <div v-show="!collapsible || open" :id="bodyId">
      <div class="form-section__grid" :class="`form-section__grid--${columns}`">
        <slot />
      </div>
      <slot name="after" />
    </div>
  </fieldset>
</template>

<style scoped>
.form-section {
  margin: 0;
  padding: 12px 0 16px;
  border: 0;
  border-bottom: 1px solid var(--dal-stroke);
  min-width: 0;
}
.form-section:last-of-type {
  border-bottom: 0;
}
.form-section--closed {
  padding-bottom: 8px;
}
.form-section__title {
  padding: 0;
  margin-bottom: 10px;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
}
.form-section--closed .form-section__title {
  margin-bottom: 0;
}
.form-section__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 2px 6px 2px 10px;
  margin-inline-start: -6px;
  border-radius: var(--dal-radius-control);
  font: inherit;
  color: inherit;
  transition: background-color 150ms ease;
}
.form-section__toggle:hover {
  background: var(--dal-hover);
}
.form-section__summary {
  margin-inline-start: 6px;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 400;
  color: var(--dal-muted);
}
.form-section__grid {
  display: grid;
  gap: 12px 16px;
  align-items: start;
}
.form-section__grid--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.form-section__grid--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.form-section__grid--1 {
  grid-template-columns: minmax(0, 1fr);
}
.form-section__grid :deep(.form-section__wide) {
  grid-column: 1 / -1;
}
@media (max-width: 1100px) {
  .form-section__grid--3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .form-section__grid--3,
  .form-section__grid--2 {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
