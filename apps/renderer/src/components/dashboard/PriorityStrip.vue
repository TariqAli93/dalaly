<script setup lang="ts">
import { computed } from "vue";
import type {
  DashboardSection,
  PriorityItem,
} from "../../utils/dashboardPriority";
import { formatShortDate, formatTime } from "../../utils/format";

/**
 * أهم عمل معلّق، وبعده ما يليه باختصار. الترتيب من priorityItems وقواعده
 * مكتوبة هناك. items = null أثناء التحميل الأول.
 */
const props = defineProps<{ items: PriorityItem[] | null }>();
const emit = defineEmits<{ select: [DashboardSection] }>();

const first = computed(() => props.items?.[0] ?? null);
const others = computed(() => props.items?.slice(1, 3) ?? []);
</script>

<template>
  <section class="priority" aria-label="الأولوية الآن" aria-live="polite">
    <v-skeleton-loader v-if="items === null" type="list-item-two-line" />
    <div v-else-if="!first" class="priority__calm">
      <v-icon icon="mdi-check-circle-outline" color="success" size="20" />
      <span
        >لا توجد أعمال معلّقة: لا مواعيد اليوم، ولا معاينات بلا متابعة، ولا
        طلبات مطابقة أو عالقة.</span
      >
    </div>
    <template v-else>
      <div class="priority__main" :class="`priority__main--${first.tone}`">
        <v-chip :color="first.tone" size="small" variant="flat" label>{{
          first.urgency
        }}</v-chip>
        <div class="priority__copy">
          <strong>{{ first.title }}</strong>
          <span>
            {{ first.detail }}
            <template v-if="first.due">
              أقربها {{ formatShortDate(first.due) }} الساعة
              <bdi>{{ formatTime(first.due) }}</bdi
              >.
            </template>
          </span>
        </div>
        <v-btn
          :color="first.tone"
          variant="flat"
          append-icon="mdi-arrow-left"
          @click="emit('select', first.target)"
          >{{ first.action }}</v-btn
        >
      </div>
      <div v-if="others.length" class="priority__next">
        <span class="priority__next-label">بعدها:</span>
        <v-btn
          v-for="item in others"
          :key="item.key"
          size="small"
          variant="text"
          :color="item.tone"
          @click="emit('select', item.target)"
          >{{ item.title }}</v-btn
        >
      </div>
    </template>
  </section>
</template>

<style scoped>
.priority {
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
}
.priority__calm {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font-size: calc(13px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.priority__main {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-inline-start: 4px solid var(--priority-tone);
}
.priority__main--error {
  --priority-tone: rgb(var(--v-theme-error));
}
.priority__main--warning {
  --priority-tone: rgb(var(--v-theme-warning));
}
.priority__main--primary {
  --priority-tone: rgb(var(--v-theme-primary));
}
.priority__copy {
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.priority__copy strong {
  font-size: calc(15px * var(--dal-font-scale));
}
.priority__copy span {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.priority__next {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 12px;
  border-top: 1px solid var(--dal-stroke);
  background: var(--dal-canvas);
}
.priority__next-label {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
  padding-inline: 4px;
}
@media (max-width: 760px) {
  .priority__main {
    flex-wrap: wrap;
  }
}
</style>
