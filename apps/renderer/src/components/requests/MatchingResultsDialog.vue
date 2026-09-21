<script setup lang="ts">
import type { MatchResult } from "../../types";

const open = defineModel<boolean>({ required: true });
const props = defineProps<{
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
  return customer ? `${customer} · نسبة المطابقة ${match.score}%` : `نسبة المطابقة ${match.score}%`;
}

function reasonsOf(match: MatchResult) {
  return match.reasons
    .filter((reason) => reason.matched)
    .map((reason) => reason.detail)
    .join(" · ");
}
</script>

<template>
  <v-dialog v-model="open" max-width="760">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <span>{{ title }}: {{ matches.length }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" aria-label="إغلاق" @click="open = false" />
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
              <v-chip size="small" color="success" variant="tonal">
                {{ match.score }}%
              </v-chip>
            </template>
            <div class="text-caption">{{ reasonsOf(match) || "مطابقة جزئية" }}</div>
          </v-list-item>
        </v-list>
        <v-empty-state v-else icon="mdi-home-search-outline" title="لا توجد مطابقات" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">إغلاق</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
