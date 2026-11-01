<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import RentalFilters from "../components/rentals/RentalFilters.vue";
import RentalTable from "../components/rentals/RentalTable.vue";
import RentalSummary from "../components/rentals/RentalSummary.vue";
import MasterDetailLayout from "../components/shared/MasterDetailLayout.vue";
import RecordFollowupDialog from "../components/shared/RecordFollowupDialog.vue";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useRentals } from "../composables/useRentals";
import { useRentalActions } from "../composables/useRentalActions";
import { exportRentalFolder } from "../utils/listingExport";
import { isDialogOpen } from "../utils/dialog";
import { RENTAL_SORT_OPTIONS } from "../constants/domain";
import type { FollowupTarget, RentalRecord, RentalStatus } from "../types";

/**
 * قائمة العروض الإيجارية بنمط قائمة عروض البيع: لوح واحد فيه شريط الفلاتر
 * والجدول، ولوحة جانبية للصف المحدد، وصفحة سجل يفتحها Enter أو النقر المزدوج.
 */
const router = useRouter();
const route = useRoute();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const {
  rentals,
  total,
  loading,
  filters,
  list,
  favoriteIds,
  applyFilters,
  reloadRentals,
  clearFilters,
  showOnly,
  loadFavoriteIds,
  toggleFavorite,
} = useRentals();
const { page, pageSize, sortBy, favoritesOnly, onTableOptions, error } = list;

const table = useTemplateRef<{
  focusFirstRow: () => void;
  focusRow: (id: number) => void;
}>("table");
const selected = ref<RentalRecord | null>(null);
const paneOpen = ref(false);
const followupOpen = ref(false);
const followupTarget = ref<FollowupTarget | null>(null);

const sortValue = computed(() => list.currentSortValue(RENTAL_SORT_OPTIONS));
const sortTitle = computed(
  () =>
    RENTAL_SORT_OPTIONS.find((option) => option.value === sortValue.value)
      ?.title ?? "مخصّص",
);
function selectSort(value: string | null) {
  const option = RENTAL_SORT_OPTIONS.find((item) => item.value === value);
  if (option) void list.setSort(option);
}

const hasActiveFilters = computed(
  () =>
    Object.entries(filters.value).some(
      ([, value]) => value !== "" && value !== null,
    ) || favoritesOnly.value,
);

const availableOnly = computed(() => filters.value.status === "available");
function toggleAvailable() {
  filters.value.status = availableOnly.value ? "" : "available";
}
function resetAll() {
  favoritesOnly.value = false;
  clearFilters();
}

function view(item: RentalRecord) {
  void router.push(`/rentals/${item.id}`);
}
function edit(item: RentalRecord) {
  void router.push(`/rentals/${item.id}/edit`);
}
function createRental() {
  void router.push("/rentals/new");
}
async function favorite(item: RentalRecord) {
  try {
    await toggleFavorite(item.id);
    if (favoritesOnly.value) void reloadRentals();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
const { askArchive, askRestore, askDelete } = useRentalActions(
  async (action, rental) => {
    if (action === "delete" && selected.value?.id === rental.id) {
      selected.value = null;
      paneOpen.value = false;
    }
    await reloadRentals();
  },
);
async function exportRental(item: RentalRecord) {
  try {
    const result = await exportRentalFolder(item);
    if (result.canceled) return;
    if (!result.ok) throw new Error(result.message ?? "تعذر تصدير الإيجار.");
    notifySuccess(
      `تم تصدير الإيجار مع صوره إلى: ${result.path ?? "المجلد المحدد"}`,
    );
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}

function selectRow(item: RentalRecord) {
  selected.value = item;
  paneOpen.value = true;
}
function closePane() {
  paneOpen.value = false;
  if (selected.value) table.value?.focusRow(selected.value.id);
}
function logFollowup() {
  const rental = selected.value;
  if (!rental) return;
  followupTarget.value = {
    kind: "rental",
    listingId: rental.id,
    listingLabel: rental.name || `إيجار ${rental.code}`,
  };
  followupOpen.value = true;
}

function onShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyN") return;
  if (event.altKey || event.shiftKey || !can("rentals.create")) return;
  if (isDialogOpen()) return;
  event.preventDefault();
  createRental();
}

// ?status=<حالة> من لوحة التحكم: القائمة تبدأ بها وحدها.
const LINKED: RentalStatus[] = [
  "available",
  "reserved",
  "negotiating",
  "rented",
  "archived",
];
const linkedStatus = LINKED.find((status) => status === route.query.status);
if (linkedStatus) {
  showOnly({ status: linkedStatus });
  void router.replace({ query: {} });
}
// ?view=favorites (رابط «مفضلة الإيجارات» القديم): القائمة تبدأ بالمفضلة.
// يبقى في العنوان: استبدال العنوان أثناء تحويل الرابط القديم يلغي التحويل.
if (route.query.view === "favorites") favoritesOnly.value = true;
// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void reloadRentals();
onMounted(() => {
  setRefreshHandler(() =>
    Promise.all([reloadRentals(), loadFavoriteIds()]).then(() => undefined),
  );
  void loadFavoriteIds();
  window.addEventListener("keydown", onShortcut);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onShortcut));
</script>

<template>
  <AppPage title="عروض الإيجار" :count="loading && !total ? null : total">
    <template #header-actions>
      <v-btn
        v-if="can('rentals.create')"
        color="primary"
        prepend-icon="mdi-plus"
        title="إضافة عرض إيجار (Ctrl+N)"
        aria-keyshortcuts="Control+N"
        @click="createRental"
        >إضافة عرض إيجار</v-btn
      >
    </template>

    <MasterDetailLayout
      fill
      :open="paneOpen && !!selected"
      detail-label="ملخّص العرض الإيجاري المحدد"
      @close="closePane"
    >
      <template #main>
        <section class="dal-panel dal-listpanel" aria-label="عروض الإيجار">
          <RentalFilters
            v-model="filters"
            @apply="applyFilters"
            @clear="resetAll"
            @down="table?.focusFirstRow()"
          >
            <template #views>
              <div class="dal-views" role="group" aria-label="عرض سريع">
                <v-btn
                  size="small"
                  :variant="availableOnly ? 'tonal' : 'text'"
                  :color="availableOnly ? 'primary' : undefined"
                  :aria-pressed="availableOnly"
                  @click="toggleAvailable"
                  >المتاحة</v-btn
                >
                <v-btn
                  size="small"
                  :variant="favoritesOnly ? 'tonal' : 'text'"
                  :color="favoritesOnly ? 'primary' : undefined"
                  :prepend-icon="
                    favoritesOnly ? 'mdi-heart' : 'mdi-heart-outline'
                  "
                  :aria-pressed="favoritesOnly"
                  @click="list.setFavoritesOnly(!favoritesOnly)"
                  >المفضلة</v-btn
                >
              </div>
            </template>
            <template #end>
              <v-menu location="bottom end">
                <template #activator="{ props: menu }">
                  <v-btn
                    v-bind="menu"
                    size="small"
                    variant="text"
                    append-icon="mdi-chevron-down"
                    :aria-label="`ترتيب القائمة: ${sortTitle}`"
                    >ترتيب: {{ sortTitle }}</v-btn
                  >
                </template>
                <v-list density="compact" min-width="190">
                  <v-list-item
                    v-for="option in RENTAL_SORT_OPTIONS"
                    :key="option.value"
                    :title="option.title"
                    :active="option.value === sortValue"
                    @click="selectSort(option.value)"
                  />
                </v-list>
              </v-menu>
            </template>
          </RentalFilters>

          <RentalTable
            ref="table"
            v-model:page="page"
            v-model:items-per-page="pageSize"
            v-model:sort-by="sortBy"
            :rentals="rentals"
            :total="total"
            :favorite-ids="favoriteIds"
            :loading="loading"
            :error="error"
            :selected-id="selected?.id ?? null"
            :has-filters="hasActiveFilters"
            @view="view"
            @edit="edit"
            @archive="askArchive"
            @restore="askRestore"
            @delete="askDelete"
            @favorite="favorite"
            @export="exportRental"
            @create="createRental"
            @select="selectRow"
            @clear-filters="resetAll"
            @retry="reloadRentals"
            @options="onTableOptions"
          />
        </section>
      </template>
      <template #detail>
        <RentalSummary
          v-if="selected"
          :rental="selected"
          :favorite="favoriteIds.has(selected.id)"
          @open="view(selected)"
          @edit="edit(selected)"
          @archive="askArchive(selected)"
          @restore="askRestore(selected)"
          @delete="askDelete(selected)"
          @favorite="favorite(selected)"
          @followup="logFollowup"
          @close="closePane"
        />
      </template>
    </MasterDetailLayout>

    <RecordFollowupDialog v-model="followupOpen" :target="followupTarget" />
  </AppPage>
</template>
