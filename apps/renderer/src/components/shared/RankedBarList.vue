<script setup lang="ts">
/**
 * قائمة مرتّبة بأشرطة نسبية — مكوّن عرض بحت (بلا مكتبة رسوم).
 * يعرض الاسم والعدد وشريطاً بعرض نسبي إلى أعلى قيمة. يُصدِر select عند
 * النقر ليعيد الأب استخدام معالجه الحالي (openProperty). لا منطق أعمال.
 */
import { computed } from "vue";

const props = defineProps<{
  items: Array<{ name: string | null; count: number }>;
}>();
defineEmits<{ select: [string] }>();

const max = computed(() =>
  Math.max(1, ...props.items.map((i) => i.count || 0)),
);
</script>

<template>
  <div class="rbl">
    <button
      v-for="item in items"
      :key="item.name || ''"
      type="button"
      class="rbl__row"
      @click="$emit('select', item.name || '')"
    >
      <span class="rbl__name">{{ item.name || "—" }}</span>
      <span class="rbl__track">
        <span
          class="rbl__fill"
          :style="{ inlineSize: `${Math.round(((item.count || 0) / max) * 100)}%` }"
        />
      </span>
      <span class="rbl__count money">{{ item.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.rbl {
  display: flex;
  flex-direction: column;
}
.rbl__row {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) 2fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 4px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: start;
  border-radius: 4px;
  transition: background 150ms cubic-bezier(0.22, 1, 0.36, 1);
}
.rbl__row:hover {
  background: var(--dal-hover);
}
.rbl__row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
.rbl__name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rbl__track {
  block-size: 6px;
  border-radius: 3px;
  background: var(--dal-hover);
  overflow: hidden;
}
.rbl__fill {
  display: block;
  block-size: 100%;
  border-radius: 3px;
  background: rgb(var(--v-theme-primary));
  opacity: 0.55;
}
.rbl__count {
  font-size: 12.5px;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.7);
  min-width: 20px;
  text-align: end;
}
@media (prefers-reduced-motion: reduce) {
  .rbl__row {
    transition: none;
  }
}
</style>
