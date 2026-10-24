<script setup lang="ts">
import type { MatchResult } from "../../types";

/**
 * نتائج مطابقة طلب بالعروض أو عرض بالطلبات. المطابقة الكاملة تحقق كل
 * الشروط الأساسية (النوع والموقع والميزانية ونوع الإيجار)؛ الجزئية تبلغ
 * درجة 40 دونها. لا نسبة مئوية: الدرجة مجموع أوزان لا يُقسَم على شيء.
 */
const open = defineModel<boolean>({ required: true });
defineProps<{
  matches: MatchResult[];
  title: string;
}>();
const emit = defineEmits<{ open: [MatchResult] }>();

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
  return customer ? `${customer} · ${preferences}` : preferences;
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
  <v-dialog v-model="open" max-width="760" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <span>{{ title }}: {{ matches.length }}</span>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          aria-label="إغلاق"
          @click="open = false"
        />
      </v-card-title>
      <v-card-text>
        <v-list v-if="matches.length" lines="three">
          <v-list-item
            v-for="match in matches"
            :key="String(recordOf(match).id)"
            :title="titleOf(match)"
            :subtitle="subtitleOf(match)"
            @click="emit('open', match)"
          >
            <template #append>
              <v-chip
                size="small"
                :color="match.required_met ? 'success' : 'warning'"
                variant="tonal"
                label
              >
                {{ match.required_met ? "مطابقة كاملة" : "مطابقة جزئية" }}
              </v-chip>
            </template>
            <div v-if="!match.required_met" class="text-caption text-warning">
              لم يتحقق: {{ missedOf(match) }}
            </div>
            <div class="text-caption">{{ metOf(match) }}</div>
          </v-list-item>
        </v-list>
        <v-empty-state
          v-else
          icon="mdi-home-search-outline"
          title="لا توجد مطابقات"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">إغلاق</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
