<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import * as requests from "../../services/requests.service";
import { getErrorMessage } from "../../services/api.service";
import type { MatchResult, OperationsKind } from "../../types";
import { formatNumber } from "../../utils/format";
import {
  locationText,
  priceText,
  propertyTypeText,
} from "../../utils/listingText";

/**
 * كل العروض المتاحة لطلب واحد، من خدمة المطابقة نفسها التي تستخدمها صفحة
 * الطلبات: المطابقات الكاملة أولاً، ثم الجزئية (درجة 40 فأكثر دون كل
 * الشروط الأساسية) مفصولة عنها.
 */
const props = defineProps<{ kind: OperationsKind; requestId: number }>();
const emit = defineEmits<{ open: [{ kind: OperationsKind; id: number }] }>();

type Offer = {
  id: number;
  code: string;
  name: string;
  property_type: string;
  total_price?: number | string;
  rent_price?: number | string;
  rent_period?: string | null;
  governorate?: string | null;
  district?: string | null;
};

const matches = ref<MatchResult[] | null>(null);
const error = ref<string | null>(null);
let generation = 0;

async function load() {
  const current = ++generation;
  matches.value = null;
  error.value = null;
  try {
    const result =
      props.kind === "sale"
        ? await requests.purchaseOfferMatches(props.requestId)
        : await requests.rentalOfferMatches(props.requestId);
    if (current === generation) matches.value = result.matches;
  } catch (cause) {
    if (current === generation) error.value = getErrorMessage(cause);
  }
}
watch(() => [props.kind, props.requestId], load, { immediate: true });
onBeforeUnmount(() => {
  generation += 1;
});

const full = computed(
  () => matches.value?.filter((match) => match.required_met) ?? [],
);
const partial = computed(
  () => matches.value?.filter((match) => !match.required_met) ?? [],
);
function offerOf(match: MatchResult) {
  return match.record as Offer;
}
function price(match: MatchResult) {
  const offer = offerOf(match);
  return priceText(
    props.kind,
    Number(props.kind === "sale" ? offer.total_price : offer.rent_price),
    offer.rent_period,
  );
}
</script>

<template>
  <div class="request-matches">
    <v-skeleton-loader v-if="!matches && !error" type="list-item-two-line" />
    <v-alert v-else-if="error" type="error" variant="tonal" density="compact">
      {{ error }}
      <template #append>
        <v-btn size="small" variant="text" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>
    <template v-else>
      <div class="request-matches__label">
        مطابقات كاملة: {{ formatNumber(full.length, 0) }}
      </div>
      <p v-if="!full.length" class="request-matches__empty">
        لا يوجد عرض متاح يحقق الشروط الأساسية لهذا الطلب.
      </p>
      <button
        v-for="match in full"
        :key="offerOf(match).id"
        type="button"
        class="request-matches__row"
        @click="emit('open', { kind, id: offerOf(match).id })"
      >
        <span class="request-matches__main">
          <bdi>{{ offerOf(match).code }}</bdi> · {{ offerOf(match).name }}
        </span>
        <span class="request-matches__sub">
          {{ propertyTypeText(kind, offerOf(match).property_type) }} ·
          {{ price(match) }}
          <template
            v-if="
              locationText(offerOf(match).governorate, offerOf(match).district)
            "
          >
            ·
            {{
              locationText(offerOf(match).governorate, offerOf(match).district)
            }}
          </template>
          <template v-if="match.preferences_total">
            · التفضيلات {{ match.preferences_met }} من
            {{ match.preferences_total }}
          </template>
        </span>
      </button>
      <details v-if="partial.length" class="request-matches__partial">
        <summary>
          مطابقات جزئية لا تحقق كل الشروط الأساسية: {{ partial.length }}
        </summary>
        <button
          v-for="match in partial"
          :key="offerOf(match).id"
          type="button"
          class="request-matches__row"
          @click="emit('open', { kind, id: offerOf(match).id })"
        >
          <span class="request-matches__main">
            <bdi>{{ offerOf(match).code }}</bdi> · {{ offerOf(match).name }}
          </span>
          <span class="request-matches__sub">
            لم يتحقق:
            {{
              match.reasons
                .filter((reason) => reason.required && !reason.matched)
                .map((reason) => reason.label)
                .join("، ")
            }}
          </span>
        </button>
      </details>
    </template>
  </div>
</template>

<style scoped>
.request-matches {
  display: grid;
  gap: 2px;
}
.request-matches__label {
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  margin-bottom: 4px;
}
.request-matches__empty {
  margin: 0;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.request-matches__row {
  display: grid;
  gap: 1px;
  width: 100%;
  padding: 6px 8px;
  text-align: start;
  border-radius: 6px;
}
.request-matches__row:hover {
  background: var(--dal-hover);
}
.request-matches__main {
  font-size: calc(12.5px * var(--dal-font-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.request-matches__sub {
  font-size: calc(11.5px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.request-matches__partial {
  margin-top: 6px;
  font-size: calc(12px * var(--dal-font-scale));
}
.request-matches__partial summary {
  cursor: pointer;
  color: var(--dal-muted);
  padding: 4px 0;
}
</style>
