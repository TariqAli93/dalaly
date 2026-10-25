<script setup lang="ts">
/**
 * مجموعة حقول بعنوان داخل نموذج صفحة: fieldset وlegend حقيقيان (يقرؤهما قارئ
 * الشاشة مع كل حقل)، وشبكة 3 أعمدة تصير 2 ثم 1 حين يضيق العرض. لا بطاقة.
 */
withDefaults(defineProps<{ title: string; columns?: 1 | 2 | 3 }>(), {
  columns: 3,
});
</script>

<template>
  <fieldset class="form-section">
    <legend class="form-section__title">{{ title }}</legend>
    <div class="form-section__grid" :class="`form-section__grid--${columns}`">
      <slot />
    </div>
    <slot name="after" />
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
.form-section__title {
  padding: 0;
  margin-bottom: 10px;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
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
