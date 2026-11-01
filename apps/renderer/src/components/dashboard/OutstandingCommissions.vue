<script setup lang="ts">
import { onMounted, ref } from "vue";
import * as commissionsService from "../../services/commissions.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { formatAmount, formatDate } from "../../utils/format";
import type { CommissionRecord } from "../../types";

/**
 * العمولات غير المستلمة: أقدم ما لم يُقبض كله، بالمتبقي منه، و«تحصيل» في كل
 * صف يفتح سند القبض مملوءاً عند الأب. القائمة كاملة في «الحسابات». من
 * /commissions/paged بحالة open، أقدمها أولاً؛ لا حساب هنا.
 */
const emit = defineEmits<{ collect: [CommissionRecord] }>();
const { can } = usePermissions();

const LIMIT = 5;
const items = ref<CommissionRecord[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const page = await commissionsService.listCommissionsPage(
      { state: "open" },
      {
        page: 1,
        page_size: LIMIT,
        sort_by: "commission_date",
        sort_order: "asc",
      },
    );
    items.value = page.items;
    total.value = page.total;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

defineExpose({ reload: load });
</script>

<template>
  <section class="dal-panel owed" aria-labelledby="owed-title">
    <header class="dal-panel__header">
      <h2 id="owed-title" class="dal-section-title">العمولات غير المستلمة</h2>
      <router-link
        v-if="total"
        to="/accounting?view=commissions&state=open"
        class="owed__all"
        >الكل ({{ total }})</router-link
      >
    </header>
    <v-progress-linear v-if="loading && !items.length" indeterminate />
    <p v-else-if="error" class="owed__empty">
      {{ error }}
      <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
    </p>
    <p v-else-if="!items.length" class="owed__empty">
      كل العمولات المسجّلة مقبوضة.
    </p>
    <ul v-else class="owed__list">
      <li v-for="item in items" :key="item.id" class="owed__row">
        <router-link
          :to="`/accounting/commissions/${item.id}`"
          class="owed__what"
        >
          <span class="owed__name">{{ item.payer_name ?? "—" }}</span>
          <span class="owed__sub">
            <bdi>{{ item.code }}</bdi>
            <template v-if="item.deal_code">
              · <bdi>{{ item.deal_code }}</bdi></template
            >
            · <bdi dir="rtl">{{ formatDate(item.commission_date) }}</bdi>
          </span>
        </router-link>
        <bdi class="owed__amount">{{
          formatAmount(item.outstanding, item.currency)
        }}</bdi>
        <v-btn
          v-if="can('vouchers.receipt')"
          size="small"
          variant="tonal"
          color="primary"
          :aria-label="`تحصيل العمولة ${item.code}`"
          @click="emit('collect', item)"
          >تحصيل</v-btn
        >
      </li>
    </ul>
  </section>
</template>

<style scoped>
.owed__all {
  margin-inline-start: auto;
  font-size: calc(12px * var(--dal-font-scale));
}
.owed__empty {
  margin: 0;
  padding: 12px 16px;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
.owed__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.owed__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dal-stroke);
}
.owed__row:last-child {
  border-bottom: 0;
}
.owed__what {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}
.owed__what:hover .owed__name {
  text-decoration: underline;
}
.owed__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
}
.owed__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.owed__amount {
  flex: none;
  color: rgb(var(--v-theme-warning));
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
