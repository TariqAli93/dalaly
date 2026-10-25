<script setup lang="ts">
import type { RecordFact } from "./record";

/**
 * شريط هوية السجل تحت شريط الأوامر: ما يحتاجه الوسيط على الهاتف (السعر،
 * القطعة، الموقع، المالك) في صفّ واحد مفصول بخطوط رفيعة، ظاهر دون تمرير.
 * لكل حقيقة فتحة باسم مفتاحها لمحتوى خاص (هاتف بأزرار مثلاً).
 */

defineProps<{ facts: RecordFact[]; label: string }>();
</script>

<template>
  <section class="dal-panel record-facts" :aria-label="label">
    <dl class="record-facts__list">
      <div
        v-for="fact in facts"
        :key="fact.key"
        class="record-facts__item"
        :class="{ 'record-facts__item--emphasis': fact.emphasis }"
      >
        <dt>{{ fact.label }}</dt>
        <dd>
          <slot :name="fact.key" :fact="fact">
            <span
              :dir="fact.ltr ? 'ltr' : 'auto'"
              class="record-facts__value"
              >{{ fact.value || "—" }}</span
            >
          </slot>
          <small v-if="fact.hint" class="record-facts__hint">{{
            fact.hint
          }}</small>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.record-facts__list {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
}
.record-facts__item {
  flex: 1 1 180px;
  min-width: 0;
  padding: 8px 16px;
  border-inline-start: 1px solid var(--dal-stroke);
}
.record-facts__item:first-child {
  border-inline-start: none;
}
.record-facts__item dt {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
  line-height: 1.5;
}
.record-facts__item dd {
  display: flex;
  flex-direction: column;
  margin: 0;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.record-facts__value {
  unicode-bidi: isolate;
}
.record-facts__item--emphasis dd {
  white-space: nowrap;
  font-size: calc(20px * var(--dal-font-scale));
  font-weight: 700;
  color: rgb(var(--v-theme-primary-text));
  line-height: 1.3;
}
.record-facts__hint {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 400;
}
</style>
