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
const props = defineProps<{
  items: PriorityItem[] | null;
  /** الأقسام التي فُحصت فعلاً، وهل فشل تحميل أحدها. */
  scope: { appointments: boolean; matching: boolean; failed: boolean };
}>();
const emit = defineEmits<{ select: [DashboardSection] }>();

const first = computed(() => props.items?.[0] ?? null);
const others = computed(() => props.items?.slice(1, 3) ?? []);

// عبارة الهدوء تنفي ما فُحص فقط: قسم لم يُحمَّل أو لا تسمح به الصلاحيات لا
// يُقال عنه «لا شيء».
const calmText = computed(() => {
  const checked = [
    ...(props.scope.appointments
      ? ["لا مواعيد اليوم", "لا معاينات بلا متابعة"]
      : []),
    ...(props.scope.matching ? ["لا طلبات مطابقة أو عالقة"] : []),
  ];
  if (!checked.length) return "لا توجد أعمال معلّقة ضمن صلاحياتك.";
  return `لا توجد أعمال معلّقة: ${checked.map((part, i) => (i ? `و${part}` : part)).join("، ")}.`;
});
</script>

<template>
  <section
    class="dal-panel priority"
    aria-label="الأولوية الآن"
    aria-live="polite"
  >
    <v-skeleton-loader v-if="items === null" type="list-item-two-line" />
    <div v-else-if="!first && scope.failed" class="priority__calm">
      <v-icon icon="mdi-alert-outline" color="warning" size="20" />
      <span
        >تعذر تحميل بعض أقسام اللوحة، فلا يمكن تأكيد خلوّها من الأعمال المعلّقة.
        أعد المحاولة بزر التحديث.</span
      >
    </div>
    <div v-else-if="!first" class="priority__calm">
      <v-icon icon="mdi-check-circle-outline" color="success" size="20" />
      <span>{{ calmText }}</span>
    </div>
    <template v-else>
      <div class="priority__main">
        <span class="priority__label">ابدأ بـ</span>
        <v-chip :color="first.tone" size="small" variant="tonal" label>{{
          first.urgency
        }}</v-chip>
        <div class="priority__copy">
          <strong>{{ first.title }}</strong>
          <span>
            {{ first.detail }}
            <template v-if="first.due">
              أقربها {{ formatShortDate(first.due) }} الساعة
              <bdi dir="rtl">{{ formatTime(first.due) }}</bdi
              >.
            </template>
          </span>
        </div>
        <v-btn
          color="primary"
          variant="flat"
          append-icon="mdi-arrow-left"
          @click="emit('select', first.target)"
          >{{ first.action }}</v-btn
        >
      </div>
      <div v-if="others.length" class="priority__next">
        <span class="priority__label">بعدها:</span>
        <v-btn
          v-for="item in others"
          :key="item.key"
          size="small"
          variant="text"
          @click="emit('select', item.target)"
          >{{ item.title }}</v-btn
        >
      </div>
    </template>
  </section>
</template>

<style scoped>
.priority__calm {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  font-size: calc(13px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.priority__main {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
}
.priority__label {
  flex: 0 0 auto;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.priority__copy {
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.priority__copy strong {
  font-size: calc(14px * var(--dal-font-scale));
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
  padding: 2px 12px;
  border-top: 1px solid var(--dal-stroke);
}
@media (max-width: 760px) {
  .priority__main {
    flex-wrap: wrap;
  }
}
</style>
