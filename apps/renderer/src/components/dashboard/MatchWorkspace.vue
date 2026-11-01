<script setup lang="ts">
import { computed } from "vue";
import MatchRow from "./MatchRow.vue";
import EmptyState from "../shared/EmptyState.vue";
import type {
  DashboardMatch,
  DashboardMatching,
  OperationsKind,
} from "../../types";
import { formatNumber } from "../../utils/format";

/**
 * مساحة المطابقة: الطلبات المفتوحة التي لها عرض متاح واحد على الأقل يحقق
 * شروطها الأساسية، صفّاً لكل طلب. التصفية (الكل/بيع/إيجار) والبحث والصفحة
 * يملكها الأب ويعيد الطلب من الخادم.
 */
const props = defineProps<{
  data: DashboardMatching | null;
  loading: boolean;
  error: string | null;
  canFollowup: (kind: OperationsKind) => boolean;
}>();
const kind = defineModel<"all" | OperationsKind>("kind", { required: true });
const q = defineModel<string>("q", { required: true });
const page = defineModel<number>("page", { required: true });
const emit = defineEmits<{
  retry: [];
  details: [DashboardMatch];
  customer: [number];
  listing: [DashboardMatch["offer"]];
  followup: [DashboardMatch];
}>();

const pages = computed(() =>
  props.data
    ? Math.max(1, Math.ceil(props.data.total / props.data.page_size))
    : 1,
);
const filters = computed(() => {
  const counts = props.data?.counts;
  const visible = props.data?.kinds ?? [];
  const sale = counts?.sale?.with_matches ?? 0;
  const rental = counts?.rental?.with_matches ?? 0;
  return [
    {
      value: "all",
      title: "الكل",
      count: sale + rental,
      show: visible.length > 1,
    },
    {
      value: "sale",
      title: "بيع",
      count: sale,
      show: visible.includes("sale"),
    },
    {
      value: "rental",
      title: "إيجار",
      count: rental,
      show: visible.includes("rental"),
    },
  ].filter((item) => item.show);
});
</script>

<template>
  <section class="dal-panel workspace" aria-labelledby="match-workspace-title">
    <header class="dal-panel__header workspace__header">
      <div class="workspace__heading">
        <h2
          id="match-workspace-title"
          class="dal-section-title"
          elementtiming="dashboard-content"
        >
          مطابقة العروض بطلبات الزبائن
        </h2>
        <p>
          عروض متاحة تحقق نوع العقار والموقع والميزانية (ونوع الإيجار) المطلوبة؛
          التفضيلات ترتّبها فقط.
        </p>
      </div>
      <!-- الأداتان معاً: تلتفّان كوحدة واحدة تحت العنوان حين يضيق اللوح. -->
      <div class="workspace__tools">
        <v-btn-toggle
          v-if="filters.length"
          v-model="kind"
          mandatory
          density="compact"
          variant="outlined"
          divided
          color="primary"
          aria-label="نوع المطابقات"
        >
          <v-btn
            v-for="item in filters"
            :key="item.value"
            :value="item.value"
            size="small"
          >
            {{ item.title }}
            <span class="workspace__count">{{
              formatNumber(item.count, 0)
            }}</span>
          </v-btn>
        </v-btn-toggle>
        <v-text-field
          v-model="q"
          class="workspace__search"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          placeholder="اسم الزبون أو هاتفه أو رمز الطلب"
          aria-label="بحث في المطابقات والزبائن"
        />
      </div>
    </header>
    <v-progress-linear
      v-if="loading && data"
      indeterminate
      color="primary"
      height="2"
    />

    <div v-if="error && !data" class="workspace__state">
      <EmptyState
        icon="mdi-lan-disconnect"
        title="تعذّر تحميل المطابقات"
        :text="error"
      >
        <template #actions>
          <v-btn color="primary" :loading="loading" @click="emit('retry')"
            >إعادة المحاولة</v-btn
          >
        </template>
      </EmptyState>
    </div>
    <div v-else-if="!data" class="workspace__loading" aria-busy="true">
      <div v-for="n in 3" :key="n" class="workspace__ghost">
        <v-skeleton-loader type="list-item-three-line" />
        <v-skeleton-loader type="list-item-three-line" />
      </div>
    </div>
    <div v-else-if="!data.kinds.length" class="workspace__state">
      <EmptyState
        icon="mdi-lock-outline"
        title="المطابقة غير متاحة لحسابك"
        text="تحتاج صلاحية قراءة الطلبات ومعها قراءة العروض أو الإيجارات."
      />
    </div>
    <template v-else>
      <v-alert
        v-if="error"
        type="warning"
        variant="tonal"
        density="compact"
        class="ma-3"
      >
        تعذّر التحديث؛ المعروض آخر تحميل ناجح.
        <template #append>
          <v-btn size="small" variant="text" @click="emit('retry')"
            >إعادة المحاولة</v-btn
          >
        </template>
      </v-alert>
      <div v-if="!data.items.length" class="workspace__state">
        <EmptyState
          v-if="q"
          icon="mdi-account-search-outline"
          title="لا مطابقات لهذا البحث"
          text="جرّب اسماً آخر أو امسح البحث."
        />
        <EmptyState
          v-else
          icon="mdi-home-search-outline"
          title="لا يوجد طلب مفتوح له عرض مطابق الآن"
          text="ستظهر هنا الطلبات حين يُضاف عرض متاح يحقق شروطها الأساسية."
        />
      </div>
      <div v-else class="workspace__list">
        <MatchRow
          v-for="item in data.items"
          :key="`${item.request.kind}-${item.request.id}`"
          :item="item"
          :can-followup="canFollowup(item.offer.kind)"
          @details="emit('details', $event)"
          @customer="emit('customer', $event)"
          @listing="emit('listing', $event)"
          @followup="emit('followup', $event)"
        />
      </div>
      <!-- العدد في شريط الملخّص؛ هنا الصفحات وحدها حين تزيد على صفحة. -->
      <footer v-if="pages > 1" class="workspace__footer">
        <span
          >الصفحة {{ formatNumber(page, 0) }} من
          {{ formatNumber(pages, 0) }}</span
        >
        <v-pagination
          v-model="page"
          :length="pages"
          :total-visible="5"
          density="compact"
          size="small"
        />
      </footer>
    </template>
  </section>
</template>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  container-type: inline-size;
}
.workspace__header {
  flex-wrap: wrap;
  gap: 8px 16px;
  padding-block: 10px;
}
.workspace__heading {
  flex: 1 1 260px;
  min-width: 0;
}
.workspace__heading p {
  margin: 2px 0 0;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
  text-wrap: pretty;
}
.workspace__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
}
.workspace__count {
  margin-inline-start: 6px;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}
/* عرض ثابت لا أساس flex: حاوية الأدوات تُقاس بمحتواها، والأساس الأكبر من
   العرض الطبيعي للحقل كان يدفعه إلى سطر تحت أزرار النوع حتى في 1920px. */
.workspace__search {
  flex: none;
  width: 220px;
}
.workspace__state {
  padding: 8px;
}
/* هيكل التحميل بشكل الصف نفسه: طلب بجانب عرض، فلا يقفز التخطيط حين يصل. */
.workspace__ghost {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 40px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--dal-stroke);
}
.workspace__ghost:last-child {
  border-bottom: 0;
}
.workspace__ghost :deep(.v-skeleton-loader) {
  background: transparent;
}
.workspace__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid var(--dal-stroke);
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>
