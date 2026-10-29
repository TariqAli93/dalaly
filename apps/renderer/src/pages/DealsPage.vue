<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import DealDialog from "../components/deals/DealDialog.vue";
import DealStageDialog from "../components/deals/DealStageDialog.vue";
import type { GridHeader, RowAction } from "../components/shared/grid";
import * as dealsService from "../services/deals.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useAssignees } from "../composables/useAssignees";
import { createPagedList } from "../composables/usePagedList";
import {
  DEAL_TYPES,
  OPEN_DEAL_STAGES,
  dealStageColor,
  dealStageLabel,
  dealTypeLabel,
} from "../constants/deals";
import { formatAmount, formatDate } from "../utils/format";
import type {
  DealFilters,
  DealPipeline,
  DealRecord,
  DealSortKey,
  DealStage,
  ListSortOption,
} from "../types";

/**
 * الصفقات: لوحة بمراحل الصفقات المفتوحة (عمود لكل مرحلة، وعدد كل مرحلة
 * ومجموع أسعارها بكل عملة على حدة)، أو جدول بكل الصفقات. الفلاتر واحدة
 * للعرضين. البطاقة تفتح الصفقة، و«نقل» ينقلها إلى مرحلة أخرى بقواعد الخادم.
 */
const router = useRouter();
const { can } = usePermissions();
const { notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { assignees, loadAssignees } = useAssignees();

const VIEW_KEY = "dalaly.deals.view";
function savedView(): "board" | "table" {
  try {
    return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "board";
  } catch {
    return "board";
  }
}
const view = ref<"board" | "table">(savedView());
watch(view, (value) => {
  try {
    localStorage.setItem(VIEW_KEY, value);
  } catch {
    // تذكّر العرض راحة فقط.
  }
  void reload();
});

const dealType = ref<DealFilters["deal_type"] | null>(null);
const assigned = ref<DealFilters["assigned"] | null>(null);
const state = ref<"open" | "closed" | null>("open");
const stalled = ref(false);
const q = ref("");
const assigneeFilters = computed(() => [
  { title: "صفقاتي", value: "me" },
  { title: "بلا مسؤول", value: "unassigned" },
  ...assignees.value.map((user) => ({
    title: user.display_name,
    value: user.id,
  })),
]);
const STATE_FILTERS = [
  { title: "المفتوحة", value: "open" },
  { title: "المغلقة", value: "closed" },
];
const STALLED_DAYS = 14;

function filters(): DealFilters {
  return {
    deal_type: dealType.value ?? undefined,
    assigned: assigned.value ?? undefined,
    state: view.value === "board" ? "open" : (state.value ?? undefined),
    stalled_days: stalled.value ? STALLED_DAYS : undefined,
    q: q.value.trim() || undefined,
  };
}
const hasFilters = computed(() =>
  Boolean(dealType.value || assigned.value || stalled.value || q.value),
);
function clearFilters() {
  dealType.value = null;
  assigned.value = null;
  stalled.value = false;
  q.value = "";
  state.value = "open";
}

// ─── الجدول ────────────────────────────────────────────────────────────
const DEFAULT_SORT: ListSortOption<DealSortKey> = {
  value: "updated",
  title: "آخر تحديث",
  key: "updated_at",
  order: "desc",
};
const list = createPagedList<DealRecord, DealSortKey>(
  (page, signal) => dealsService.listDealsPage(filters(), page, signal),
  DEFAULT_SORT,
);
const { items, total, loading, error, page, pageSize, sortBy, onTableOptions } =
  list;
const headers: GridHeader[] = [
  { key: "code", title: "الصفقة", sortable: true },
  { key: "stage", title: "المرحلة" },
  { key: "client_name", title: "الزبون" },
  { key: "listing_name", title: "العرض", priority: 2 },
  { key: "asking_price", title: "السعر", sortable: true },
  { key: "assigned_user_name", title: "المسؤول", priority: 2 },
  { key: "updated_at", title: "آخر تحديث", sortable: true, priority: 3 },
  { key: "actions", title: "", align: "end", width: 96 },
];

// ─── اللوحة ────────────────────────────────────────────────────────────
const board = ref<DealRecord[]>([]);
const pipeline = ref<DealPipeline | null>(null);
const boardLoading = ref(false);
const boardError = ref<string | null>(null);
const BOARD_LIMIT = 100;
const boardTotal = ref(0);

async function loadBoard() {
  boardLoading.value = true;
  boardError.value = null;
  try {
    const [page, summary] = await Promise.all([
      dealsService.listDealsPage(filters(), {
        page: 1,
        page_size: BOARD_LIMIT,
        sort_by: "stage_changed_at",
        sort_order: "asc",
      }),
      dealsService.getDealPipeline(filters()),
    ]);
    board.value = page.items;
    boardTotal.value = page.total;
    pipeline.value = summary;
  } catch (cause) {
    boardError.value = getErrorMessage(cause);
  } finally {
    boardLoading.value = false;
  }
}

const columns = computed(() =>
  OPEN_DEAL_STAGES.map((stage) => {
    const totals = (pipeline.value?.stages ?? []).filter(
      (row) => row.stage === stage.value,
    );
    return {
      ...stage,
      deals: board.value.filter((deal) => deal.stage === stage.value),
      count: totals.reduce((sum, row) => sum + row.count, 0),
      totals: totals.filter((row) => row.asking_total !== "0.00"),
    };
  }),
);

function reload() {
  return view.value === "board" ? loadBoard() : list.loadFirstPage();
}
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch([dealType, assigned, state, stalled], () => void reload());
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void reload(), 300);
});

// ─── الأوامر ───────────────────────────────────────────────────────────
const dealDialog = ref(false);
const stageDialog = ref(false);
const moving = ref<DealRecord | null>(null);
const movingTo = ref<DealStage | null>(null);
function openMove(deal: DealRecord, to: DealStage | null = null) {
  moving.value = deal;
  movingTo.value = to;
  stageDialog.value = true;
}
function onSaved(deal: DealRecord) {
  notifySuccess(`أُنشئت الصفقة ${deal.code}.`);
  void router.push(`/deals/${deal.id}`);
}
function onMoved() {
  notifySuccess("نُقلت الصفقة.");
  void reload();
}
/** The next open stage, for the card's one-step move. */
function nextStage(deal: DealRecord) {
  const index = OPEN_DEAL_STAGES.findIndex(
    (stage) => stage.value === deal.stage,
  );
  return OPEN_DEAL_STAGES[index + 1]?.value ?? null;
}
function actionsOf(deal: DealRecord): RowAction[] {
  const actions: RowAction[] = [
    {
      key: "open",
      label: "فتح الصفقة",
      icon: "mdi-open-in-app",
      inline: true,
      run: () => void router.push(`/deals/${deal.id}`),
    },
  ];
  if (can("deals.update"))
    actions.push({
      key: "move",
      label: "نقل إلى مرحلة",
      icon: "mdi-arrow-left-bold-box-outline",
      inline: true,
      run: () => openMove(deal),
    });
  return actions;
}
const ageDays = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const dealLabel = (deal: DealRecord) =>
  deal.title ||
  `${deal.client_name}${deal.listing_name ? ` · ${deal.listing_name}` : ""}`;

void reload();
onMounted(() => {
  setRefreshHandler(reload);
  void loadAssignees();
});
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  list.cancel();
});
</script>

<template>
  <AppPage
    title="الصفقات"
    :count="view === 'board' ? boardTotal : loading && !total ? null : total"
  >
    <template #header-actions>
      <v-btn-toggle
        v-model="view"
        mandatory
        density="comfortable"
        variant="outlined"
        divided
        aria-label="طريقة العرض"
      >
        <v-btn value="board" prepend-icon="mdi-view-column-outline"
          >اللوحة</v-btn
        >
        <v-btn value="table" prepend-icon="mdi-table">الجدول</v-btn>
      </v-btn-toggle>
      <v-btn
        v-if="can('deals.create')"
        color="primary"
        prepend-icon="mdi-handshake-outline"
        @click="dealDialog = true"
        >صفقة جديدة</v-btn
      >
    </template>

    <section class="dal-panel dal-listpanel dal-fill" aria-label="الصفقات">
      <div class="dal-toolbar">
        <div class="dal-toolbar__row dal-toolbar__row--single">
          <v-text-field
            v-model="q"
            class="dal-toolbar__search"
            label="بحث برمز الصفقة أو الزبون أو العرض"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
          />
          <v-select
            v-model="dealType"
            :items="DEAL_TYPES"
            label="النوع"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-select
            v-if="view === 'table'"
            v-model="state"
            :items="STATE_FILTERS"
            label="الحالة"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-select
            v-model="assigned"
            :items="assigneeFilters"
            label="المسؤول"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-checkbox
            v-model="stalled"
            :label="`راكدة ${STALLED_DAYS} يوماً`"
            hide-details
            density="compact"
          />
          <v-btn
            v-if="hasFilters"
            size="small"
            variant="text"
            @click="clearFilters"
            >مسح الفلاتر</v-btn
          >
        </div>
      </div>

      <template v-if="view === 'board'">
        <v-progress-linear v-if="boardLoading" indeterminate />
        <v-alert v-if="boardError" type="error" variant="tonal" class="ma-3">
          {{ boardError }}
          <template #append>
            <v-btn variant="text" @click="loadBoard">إعادة المحاولة</v-btn>
          </template>
        </v-alert>
        <p v-if="boardTotal > BOARD_LIMIT" class="deals-board__note">
          تعرض اللوحة أقدم {{ BOARD_LIMIT }} صفقة في مراحلها من
          {{ boardTotal }}؛ استخدم الجدول أو الفلاتر للبقية.
        </p>
        <div
          class="deals-board"
          role="list"
          aria-label="مراحل الصفقات المفتوحة"
        >
          <section
            v-for="column in columns"
            :key="column.value"
            class="deals-board__column"
            role="listitem"
            :aria-label="`${column.title}: ${column.count}`"
          >
            <header class="deals-board__head">
              <v-chip
                size="small"
                variant="tonal"
                label
                :color="column.color"
                >{{ column.title }}</v-chip
              >
              <span class="deals-board__count">{{ column.count }}</span>
              <div
                v-for="row in column.totals"
                :key="row.currency"
                class="deals-board__total"
              >
                <bdi>{{ formatAmount(row.asking_total, row.currency) }}</bdi>
              </div>
            </header>
            <article
              v-for="deal in column.deals"
              :key="deal.id"
              class="deals-card"
            >
              <router-link :to="`/deals/${deal.id}`" class="deals-card__link">
                <strong>{{ dealLabel(deal) }}</strong>
                <span class="deals-card__meta">
                  <bdi>{{ deal.code }}</bdi> ·
                  {{ dealTypeLabel(deal.deal_type) }}
                </span>
                <span
                  v-if="deal.agreed_price || deal.asking_price"
                  class="deals-card__amount"
                >
                  <bdi>{{
                    formatAmount(
                      deal.agreed_price ?? deal.asking_price,
                      deal.currency,
                    )
                  }}</bdi>
                </span>
                <span class="deals-card__meta">
                  منذ {{ ageDays(deal.stage_changed_at) }} يوماً في المرحلة
                  <template v-if="deal.assigned_user_name">
                    · {{ deal.assigned_user_name }}</template
                  >
                </span>
              </router-link>
              <v-btn
                v-if="can('deals.update') && nextStage(deal)"
                size="x-small"
                variant="text"
                append-icon="mdi-arrow-left"
                :aria-label="`نقل ${deal.code} إلى ${dealStageLabel(nextStage(deal)!)}`"
                @click="openMove(deal, nextStage(deal))"
                >{{ dealStageLabel(nextStage(deal)!) }}</v-btn
              >
            </article>
            <p v-if="!column.deals.length" class="deals-board__empty">
              لا صفقات
            </p>
          </section>
        </div>
      </template>

      <DataGrid
        v-else
        v-model:page="page"
        v-model:items-per-page="pageSize"
        v-model:sort-by="sortBy"
        grid-key="deals"
        table-label="جدول الصفقات"
        :items="items"
        :headers="headers"
        :total="total"
        :loading="loading"
        :error="error"
        :has-filters="hasFilters"
        :actions="actionsOf"
        :row-label="(deal) => `${deal.code} · ${dealLabel(deal)}`"
        :empty="{
          icon: 'mdi-handshake-outline',
          title: 'لا توجد صفقات بعد',
          text: 'أنشئ صفقة من زبون مهتم بعرض، أو من صفحة الزبون أو العرض.',
        }"
        :no-match="{ title: 'لا توجد صفقات مطابقة للفلاتر الحالية' }"
        @open="(deal) => router.push(`/deals/${deal.id}`)"
        @retry="list.reload"
        @clear-filters="clearFilters"
        @options="onTableOptions"
      >
        <template #item.code="{ item }">
          <div class="dal-cell-name">
            <strong class="dal-clip">{{ dealLabel(item) }}</strong>
            <bdi>{{ item.code }} · {{ dealTypeLabel(item.deal_type) }}</bdi>
          </div>
        </template>
        <template #item.stage="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="dealStageColor(item.stage)"
            >{{ dealStageLabel(item.stage) }}</v-chip
          >
        </template>
        <template #item.client_name="{ item }">
          <span class="dal-clip">{{ item.client_name }}</span>
        </template>
        <template #item.listing_name="{ item }">
          <span class="dal-clip">{{ item.listing_name ?? "—" }}</span>
        </template>
        <template #item.asking_price="{ item }">
          <bdi>{{
            formatAmount(item.agreed_price ?? item.asking_price, item.currency)
          }}</bdi>
        </template>
        <template #item.assigned_user_name="{ item }">{{
          item.assigned_user_name ?? "—"
        }}</template>
        <template #item.updated_at="{ item }">
          <bdi>{{ formatDate(item.updated_at) }}</bdi>
        </template>
      </DataGrid>
    </section>

    <DealDialog v-model="dealDialog" @saved="onSaved" />
    <DealStageDialog
      v-model="stageDialog"
      :deal="moving"
      :target="movingTo"
      @moved="onMoved"
    />
  </AppPage>
</template>

<style scoped>
.deals-board {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 12px;
  flex: 1;
  align-items: flex-start;
}
.deals-board__column {
  flex: 0 0 240px;
  background: rgb(var(--v-theme-surface-variant), 0.35);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 100%;
  overflow-y: auto;
}
.deals-board__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.deals-board__count {
  font-weight: 700;
}
.deals-board__total {
  width: 100%;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface-variant));
}
.deals-board__empty,
.deals-board__note {
  margin: 0;
  font-size: 0.8rem;
  color: rgb(var(--v-theme-on-surface-variant));
}
.deals-board__note {
  padding: 8px 12px 0;
}
.deals-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgb(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.deals-card__link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: inherit;
  text-decoration: none;
}
.deals-card__link:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.deals-card__meta {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface-variant));
}
.deals-card__amount {
  font-weight: 600;
}
</style>
