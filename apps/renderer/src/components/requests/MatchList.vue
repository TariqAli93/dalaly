<script setup lang="ts">
import type { MatchResult } from "../../types";

/**
 * قائمة نتائج مطابقة طلب بالعروض أو عرض بالطلبات. المطابقة الكاملة تحقق كل
 * الشروط الأساسية (النوع والموقع والميزانية ونوع الإيجار)؛ الجزئية تبلغ درجة
 * 40 دونها. لا نسبة مئوية: الدرجة مجموع أوزان لا يُقسَم على شيء.
 */
defineProps<{
  matches: MatchResult[];
  emptyText?: string;
  /** Show "صفقة" on each match: a deal between the request and the listing. */
  canDeal?: boolean;
}>();
const emit = defineEmits<{ open: [MatchResult]; deal: [MatchResult] }>();

function recordOf(match: MatchResult) {
  return match.record as {
    id?: number;
    code?: string;
    name?: string;
    customer_name?: string | null;
    customer_code?: string | null;
  };
}
function titleOf(match: MatchResult) {
  const record = recordOf(match);
  return record.name || record.code || `السجل #${record.id ?? "-"}`;
}
function subtitleOf(match: MatchResult) {
  const record = recordOf(match);
  const customer = record.customer_name || record.customer_code;
  const preferences = match.preferences_total
    ? `التفضيلات ${match.preferences_met} من ${match.preferences_total}`
    : "بلا تفضيلات محددة";
  return [record.name ? record.code : null, customer, preferences]
    .filter(Boolean)
    .join(" · ");
}
function missedOf(match: MatchResult) {
  return match.reasons
    .filter((reason) => reason.required && !reason.matched)
    .map((reason) => reason.detail)
    .join(" · ");
}
function metOf(match: MatchResult) {
  return match.reasons
    .filter((reason) => reason.matched)
    .map((reason) => reason.detail)
    .join(" · ");
}
</script>

<template>
  <v-list v-if="matches.length" lines="three" class="match-list">
    <v-list-item
      v-for="match in matches"
      :key="String(recordOf(match).id)"
      :title="titleOf(match)"
      :subtitle="subtitleOf(match)"
      @click="emit('open', match)"
    >
      <template #append>
        <v-btn
          v-if="canDeal"
          size="small"
          variant="tonal"
          prepend-icon="mdi-handshake-outline"
          class="me-2"
          :aria-label="`صفقة على ${titleOf(match)}`"
          @click.stop="emit('deal', match)"
          >صفقة</v-btn
        >
        <v-chip
          size="small"
          :color="match.required_met ? 'success' : 'warning'"
          variant="tonal"
          label
        >
          {{ match.required_met ? "مطابقة كاملة" : "مطابقة جزئية" }}
        </v-chip>
      </template>
      <div v-if="!match.required_met" class="match-list__missed">
        لم يتحقق: {{ missedOf(match) }}
      </div>
      <div class="match-list__met">{{ metOf(match) }}</div>
    </v-list-item>
  </v-list>
  <p v-else class="match-list__empty">
    {{ emptyText ?? "لا توجد مطابقات." }}
  </p>
</template>

<style scoped>
.match-list {
  padding: 0;
}
.match-list :deep(.v-list-item) {
  border-bottom: 1px solid var(--dal-stroke);
}
.match-list__missed {
  color: rgb(var(--v-theme-warning));
  font-size: calc(12px * var(--dal-font-scale));
}
.match-list__met {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.match-list__empty {
  margin: 0;
  padding: 16px 0;
  color: var(--dal-muted);
  text-align: center;
}
</style>
