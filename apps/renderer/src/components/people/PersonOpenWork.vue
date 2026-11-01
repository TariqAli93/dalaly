<script setup lang="ts">
import { computed, ref, watch } from "vue";
import * as dealsService from "../../services/deals.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { dealStageLabel, dealTypeLabel } from "../../constants/deals";
import { formatNumber } from "../../utils/format";
import {
  requestPath,
  requestPropertyTypeLabel,
  type RequestMode,
  type RequestRecord,
} from "../../utils/requestForm";
import type { DealRecord } from "../../types";

/**
 * «مفتوح الآن مع الزبون» أعلى تبويب النشاط (UX-17): صفقاته المفتوحة وطلباته
 * المفتوحة، كل منها رابط إلى سجله، فيُعرف ما يُكلَّم فيه دون فتح التبويبات.
 * الطلبات مما حمّلته الصفحة؛ والصفقات طلب واحد صغير (أول ثلاث)، لمن يقرأ
 * الصفقات. القوائم الكاملة تبقى في تبويباتها.
 */
const props = defineProps<{
  personId: number;
  requests: Array<{ mode: RequestMode; item: RequestRecord }>;
}>();
const emit = defineEmits<{ tab: ["deals" | "requests"] }>();
const { can } = usePermissions();

const DEAL_ROWS = 3;
const deals = ref<DealRecord[] | null>(null);
const dealTotal = ref(0);
const error = ref<string | null>(null);
async function load() {
  if (!can("deals.read")) return;
  error.value = null;
  try {
    const page = await dealsService.listDealsPage(
      { person_id: props.personId, state: "open" },
      {
        page: 1,
        page_size: DEAL_ROWS,
        sort_by: "updated_at",
        sort_order: "desc",
      },
    );
    deals.value = page.items;
    dealTotal.value = page.total;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  }
}
watch(() => props.personId, load, { immediate: true });

const openRequests = computed(() =>
  props.requests.filter(({ item }) => item.status === "open"),
);
</script>

<template>
  <section class="open-work" aria-labelledby="open-work-title">
    <h2 id="open-work-title" class="open-work__title">مفتوح الآن مع الزبون</h2>
    <ul class="open-work__list">
      <li v-for="deal in deals ?? []" :key="`d${deal.id}`">
        <v-icon icon="mdi-handshake-outline" size="16" aria-hidden="true" />
        <router-link :to="`/deals/${deal.id}`"
          >صفقة <bdi>{{ deal.code }}</bdi></router-link
        >
        <span class="open-work__muted"
          >{{ dealTypeLabel(deal.deal_type) }} · في «{{
            dealStageLabel(deal.stage)
          }}»</span
        >
      </li>
      <li v-for="{ mode, item } in openRequests" :key="`${mode}${item.id}`">
        <v-icon icon="mdi-home-search-outline" size="16" aria-hidden="true" />
        <router-link :to="requestPath(mode, item.id)"
          >{{ mode === "purchase" ? "طلب شراء" : "طلب إيجار" }}
          <bdi>{{ item.code }}</bdi></router-link
        >
        <span class="open-work__muted">{{
          requestPropertyTypeLabel(mode, item.property_type)
        }}</span>
      </li>
      <li
        v-if="deals && !deals.length && !openRequests.length"
        class="open-work__muted"
      >
        لا صفقات ولا طلبات مفتوحة.
      </li>
      <li v-if="error" class="open-work__muted">
        تعذّر تحميل الصفقات: {{ error }}
        <v-btn size="x-small" variant="text" @click="load"
          >إعادة المحاولة</v-btn
        >
      </li>
    </ul>
    <div class="open-work__more">
      <v-btn
        v-if="dealTotal > DEAL_ROWS"
        size="small"
        variant="text"
        @click="emit('tab', 'deals')"
        >كل الصفقات المفتوحة ({{ formatNumber(dealTotal, 0) }})</v-btn
      >
    </div>
  </section>
</template>

<style scoped>
.open-work {
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
}
.open-work__title {
  margin: 0 0 4px;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 700;
}
.open-work__list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: calc(13px * var(--dal-font-scale));
}
.open-work__list li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.open-work__muted {
  color: var(--dal-muted);
}
.open-work__more:empty {
  display: none;
}
</style>
