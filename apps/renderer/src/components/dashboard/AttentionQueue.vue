<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ATTENTION_TIERS,
  type AttentionItem,
  type AttentionTier,
} from "../../utils/attentionQueue";
import { formatAmount, formatNumber } from "../../utils/format";

/**
 * «يحتاج متابعتك»: قائمة واحدة لما ينتظر المكتب من المهام والمواعيد والأقساط
 * والعمولات والزبائن والإيجارات والصفقات (utils/attentionQueue.ts). لكل سطر
 * مرتبته وسببه وتاريخه وزر واحد للخطوة التالية؛ الأب ينفّذ الزر (يفتح السجل أو
 * سند القبض المملوء أو ملف الزبون). مصدر تعذّر تحميله يظهر تنبيهاً بإعادة
 * المحاولة، فلا يبدو «لا شيء ينتظرك» وبعض المصادر لم يُفحص.
 */
const props = defineProps<{
  /** null حتى يصل المصدر الأول. */
  items: AttentionItem[] | null;
  totals: Record<AttentionTier, number>;
  failures: Array<{ key: string; label: string; retry: () => void }>;
  /** ما فُحص فعلاً، يُذكر مع «لا شيء ينتظرك». */
  checked: string[];
}>();
const emit = defineEmits<{ act: [AttentionItem] }>();

// «الكل» يبدأ بأول ثلاثة من كل مرتبة، فتظهر مواعيد اليوم والتحصيل والتواصل
// في الشاشة الأولى حتى لو تراكم المتأخر؛ مرتبة واحدة تبدأ بثمانية.
const PER_TIER = 3;
const SHOWN = 8;
const tier = ref<AttentionTier | null>(null);
const expanded = ref(false);
watch(tier, () => (expanded.value = false));

const tiers = computed(() =>
  ATTENTION_TIERS.filter((item) => props.totals[item.value] > 0),
);
const total = computed(() =>
  Object.values(props.totals).reduce((sum, count) => sum + count, 0),
);
const filtered = computed(() =>
  (props.items ?? []).filter((item) => !tier.value || item.tier === tier.value),
);
const visible = computed(() => {
  if (expanded.value) return filtered.value;
  if (tier.value) return filtered.value.slice(0, SHOWN);
  const taken = new Map<AttentionTier, number>();
  return filtered.value.filter((item) => {
    const count = taken.get(item.tier) ?? 0;
    taken.set(item.tier, count + 1);
    return count < PER_TIER;
  });
});
const hidden = computed(() => filtered.value.length - visible.value.length);
const tierTitle = (value: AttentionTier) =>
  ATTENTION_TIERS.find((item) => item.value === value)!.title;
</script>

<template>
  <section class="dal-panel queue" aria-labelledby="queue-title">
    <header class="dal-panel__header queue__head">
      <h2 id="queue-title" class="dal-section-title">
        يحتاج متابعتك
        <span v-if="items && total" class="dal-count ms-1">{{
          formatNumber(total, 0)
        }}</span>
      </h2>
    </header>

    <div
      v-if="tiers.length > 1"
      class="queue__tiers"
      role="toolbar"
      aria-label="تصفية حسب المرتبة"
    >
      <v-chip-group v-model="tier" selected-class="queue__tier--on">
        <v-chip
          v-for="item in tiers"
          :key="item.value"
          :value="item.value"
          size="small"
          variant="outlined"
          label
          filter
          >{{ item.title }} {{ formatNumber(totals[item.value], 0) }}</v-chip
        >
      </v-chip-group>
    </div>

    <v-alert
      v-for="failure in failures"
      :key="failure.key"
      type="warning"
      variant="tonal"
      density="compact"
      class="queue__failure"
      role="status"
    >
      تعذّر تحميل {{ failure.label }}، فقد لا تظهر هنا كل الأمور.
      <template #append>
        <v-btn size="small" variant="text" @click="failure.retry()"
          >إعادة المحاولة</v-btn
        >
      </template>
    </v-alert>

    <div v-if="!items" aria-busy="true" class="queue__loading">
      <v-skeleton-loader type="list-item-two-line@4" />
    </div>
    <p v-else-if="!filtered.length && !failures.length" class="queue__empty">
      <v-icon
        icon="mdi-check-circle-outline"
        size="18"
        color="success"
        aria-hidden="true"
      />
      لا شيء ينتظرك الآن.
      <span v-if="checked.length" class="queue__checked"
        >فُحص: {{ checked.join("، ") }}.</span
      >
    </p>
    <ul v-else class="queue__rows">
      <li v-for="item in visible" :key="item.key" class="queue__row">
        <v-icon
          :icon="item.icon"
          size="20"
          class="queue__icon"
          :class="`queue__icon--${item.tier}`"
          aria-hidden="true"
        />
        <div class="queue__text">
          <div class="queue__title">
            <router-link v-if="item.link" :to="item.link">{{
              item.title
            }}</router-link>
            <span v-else>{{ item.title }}</span>
            <span class="queue__tier" :class="`queue__tier--${item.tier}`">{{
              tierTitle(item.tier)
            }}</span>
          </div>
          <div class="queue__reason" :title="item.reason">
            {{ item.reason }}
          </div>
        </div>
        <div class="queue__meta">
          <bdi v-if="item.amount" class="queue__amount">{{
            formatAmount(item.amount.value, item.amount.currency)
          }}</bdi>
          <span
            v-if="item.when"
            class="queue__when"
            :class="{ 'queue__when--bad': item.tier === 'overdue' }"
            ><bdi dir="rtl">{{ item.when }}</bdi></span
          >
        </div>
        <v-btn
          size="small"
          :variant="item.tier === 'overdue' ? 'flat' : 'tonal'"
          :color="item.tier === 'overdue' ? 'primary' : undefined"
          class="queue__action"
          :aria-label="`${item.actionLabel}: ${item.title}`"
          @click="emit('act', item)"
          >{{ item.actionLabel }}</v-btn
        >
      </li>
    </ul>
    <div v-if="hidden > 0 || expanded" class="queue__more">
      <v-btn
        variant="text"
        size="small"
        :append-icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        @click="expanded = !expanded"
        >{{
          expanded
            ? "عرض أقل"
            : `عرض كل الأسطر (${formatNumber(filtered.length, 0)})`
        }}</v-btn
      >
    </div>
  </section>
</template>

<style scoped>
.queue__head {
  min-height: 44px;
}
.queue__tiers {
  padding: 0 12px;
  border-bottom: 1px solid var(--dal-stroke);
}
.queue__tiers :deep(.v-chip-group) {
  padding: 6px 0;
}
.queue__failure {
  margin: 8px 12px 0;
}
.queue__loading {
  padding: 4px 0;
}
.queue__empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 16px;
  font-size: calc(14px * var(--dal-font-scale));
}
.queue__checked {
  width: 100%;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.queue__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.queue__row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 4px 10px;
  min-height: 52px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--dal-stroke);
}
.queue__row:last-child {
  border-bottom: none;
}
.queue__icon {
  color: var(--dal-muted);
}
.queue__icon--overdue {
  color: rgb(var(--v-theme-error));
}
.queue__icon--today,
.queue__icon--collect {
  color: rgb(var(--v-theme-primary));
}
.queue__text {
  min-width: 0;
}
.queue__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.4;
}
.queue__title a,
.queue__title > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: inherit;
  text-decoration: none;
}
.queue__title a:hover {
  text-decoration: underline;
}
.queue__tier {
  flex: none;
  padding: 0 6px;
  border-radius: 4px;
  font-size: calc(11px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 18px;
  color: var(--dal-muted);
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.queue__tier--overdue {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.1);
}
.queue__tier--today {
  color: rgb(var(--v-theme-primary-text));
  background: rgba(var(--v-theme-primary), 0.1);
}
.queue__reason {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(12.5px * var(--dal-font-scale));
  line-height: 1.5;
  color: var(--dal-muted);
}
.queue__meta {
  display: grid;
  justify-items: end;
  font-size: calc(12.5px * var(--dal-font-scale));
  line-height: 1.4;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.queue__amount {
  font-weight: 600;
}
.queue__when {
  color: var(--dal-muted);
}
.queue__when--bad {
  color: rgb(var(--v-theme-error));
}
.queue__action {
  min-width: 0;
}
.queue__more {
  display: flex;
  justify-content: center;
  padding: 4px;
  border-top: 1px solid var(--dal-stroke);
}
</style>
