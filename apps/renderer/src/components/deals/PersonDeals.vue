<script setup lang="ts">
import { ref, watch } from "vue";
import * as dealsService from "../../services/deals.service";
import { getErrorMessage } from "../../services/api.service";
import {
  dealPartyLabels,
  dealStageColor,
  dealStageLabel,
  dealTypeLabel,
} from "../../constants/deals";
import { formatAmount, formatDate } from "../../utils/format";
import type { DealRecord } from "../../types";

/**
 * A customer's deals, as client or as owner, newest first. Each row opens
 * the deal; its stage, price and the customer's side are shown.
 */
const props = defineProps<{ personId: number }>();
const deals = ref<DealRecord[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const page = await dealsService.listDealsPage(
      { person_id: props.personId },
      { page: 1, page_size: 50, sort_by: "updated_at", sort_order: "desc" },
    );
    deals.value = page.items;
    total.value = page.total;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
watch(() => props.personId, load, { immediate: true });
defineExpose({ reload: load, total });

const sideOf = (deal: DealRecord) => {
  const labels = dealPartyLabels(deal.deal_type);
  return deal.client_person_id === props.personId
    ? labels.client
    : labels.owner;
};
</script>

<template>
  <div>
    <v-progress-linear v-if="loading && !deals.length" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal" density="compact">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>
    <v-empty-state
      v-else-if="!deals.length"
      icon="mdi-handshake-outline"
      title="لا صفقات لهذا الزبون"
      text="أنشئ صفقة حين يهتم الزبون بعرض، من هنا أو من مطابقات طلبه."
    />
    <v-list v-else density="compact" lines="two">
      <v-list-item
        v-for="deal in deals"
        :key="deal.id"
        :to="`/deals/${deal.id}`"
      >
        <v-list-item-title>
          {{ deal.title || deal.listing_name || deal.code }}
        </v-list-item-title>
        <v-list-item-subtitle>
          <bdi>{{ deal.code }}</bdi> · {{ dealTypeLabel(deal.deal_type) }} ·
          {{ sideOf(deal) }} ·
          <bdi>{{
            formatAmount(deal.agreed_price ?? deal.asking_price, deal.currency)
          }}</bdi>
          · <span>{{ formatDate(deal.updated_at) }}</span>
        </v-list-item-subtitle>
        <template #append>
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="dealStageColor(deal.stage)"
            >{{ dealStageLabel(deal.stage) }}</v-chip
          >
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>
