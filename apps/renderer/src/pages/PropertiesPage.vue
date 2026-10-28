<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import PropertyFilters from "../components/properties/PropertyFilters.vue";
import PropertiesTable from "../components/properties/PropertiesTable.vue";
import ExcelImportDialog from "../components/properties/ExcelImportDialog.vue";
import MasterDetailLayout from "../components/shared/MasterDetailLayout.vue";
import PropertySummary from "../components/shared/PropertySummary.vue";
import RecordFollowupDialog from "../components/shared/RecordFollowupDialog.vue";
import { useProperties } from "../composables/useProperties";
import { usePropertyActions } from "../composables/usePropertyActions";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useFavorites } from "../composables/useFavorites";
import { usePermissions } from "../composables/usePermissions";
import { exportPropertyFolder } from "../utils/listingExport";
import { isDialogOpen } from "../utils/dialog";
import { PROPERTY_SORT_OPTIONS } from "../constants/domain";
import { getErrorMessage } from "../services/api.service";
import type { FollowupTarget, PropertyRecord } from "../types";

const router = useRouter();
const {
  properties,
  total,
  loading,
  filters,
  list,
  applyFilters,
  reloadProperties,
  clearFilters,
} = useProperties();
// الصفحة والحجم والترتيب والمفضلة: مربوطة بالجدول وتُرسل إلى الخادم.
const { page, pageSize, sortBy, favoritesOnly, onTableOptions, error } = list;

const { notifyError, notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { favoriteIds, loadFavoriteIds } = useFavorites();
const { can } = usePermissions();

const table = useTemplateRef<{
  focusFirstRow: () => void;
  focusRow: (id: number) => void;
}>("table");
const selectedProperty = ref<PropertyRecord | null>(null);
const importOpen = ref(false);
// Details pane: ملخّص الصف المحدد من بيانات القائمة نفسها.
const paneOpen = ref(false);
const followupOpen = ref(false);
const followupTarget = ref<FollowupTarget | null>(null);

// الترتيب على الخادم (صفحة واحدة فقط محمّلة). قائمة «ترتيب» ورؤوس الأعمدة
// تكتبان نفس sortBy.
const sortValue = computed(() => list.currentSortValue(PROPERTY_SORT_OPTIONS));
// ترتيب من رؤوس الأعمدة بلا خيار مقابل يُعرض «مخصّص».
const sortTitle = computed(
  () =>
    PROPERTY_SORT_OPTIONS.find((option) => option.value === sortValue.value)
      ?.title ?? "مخصّص",
);
function selectSort(value: string | null) {
  const option = PROPERTY_SORT_OPTIONS.find((item) => item.value === value);
  if (option) void list.setSort(option);
}

// هل توجد فلاتر فعّالة؟ (لتمييز «لا نتائج» من «لا عروض بعد»)
const hasActiveFilters = computed(() => {
  const f = filters.value;
  return (
    Boolean(
      f.q ||
      f.status ||
      f.property_type ||
      f.governorate_id ||
      f.district_id ||
      f.neighborhood_id ||
      f.legal_type ||
      f.area_unit ||
      f.pricing_method ||
      f.district ||
      f.plot_number ||
      f.plot_letter ||
      f.area_min ||
      f.area_max ||
      f.price_min ||
      f.price_max,
    ) || favoritesOnly.value
  );
});

// عرضان سريعان مستقلّان عن الترتيب: المتاحة (status=available) والمفضلة.
const availableOnly = computed(() => filters.value.status === "available");
function toggleAvailable() {
  filters.value.status = availableOnly.value ? "" : "available";
}
// مسح كل شيء بما فيه المفضلة.
function resetAll() {
  favoritesOnly.value = false;
  clearFilters();
}

// إزالة عقار من المفضلة أثناء عرض المفضلة فقط: أعد تحميل الصفحة.
watch(favoriteIds, () => {
  if (favoritesOnly.value) void reloadProperties();
});

function viewDetails(property: PropertyRecord) {
  void router.push(`/properties/${property.id}`);
}
function editProperty(property: PropertyRecord) {
  void router.push(`/properties/${property.id}/edit`);
}
function createProperty() {
  void router.push("/properties/new");
}

const { askArchive, askRestore, askDelete } = usePropertyActions(
  async (action, property) => {
    if (action === "delete" && selectedProperty.value?.id === property.id) {
      selectedProperty.value = null;
      paneOpen.value = false;
    }
    await reloadProperties();
  },
);

async function exportProperty(property: PropertyRecord) {
  try {
    const result = await exportPropertyFolder(property);
    if (result.canceled) return;
    if (!result.ok) throw new Error(result.message ?? "تعذر تصدير العرض.");
    notifySuccess(
      `تم تصدير العقار مع صوره إلى: ${result.path ?? "المجلد المحدد"}`,
    );
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}

// تحديد صف (نقرة أو Space) يفتح اللوحة الجانبية؛ Enter أو النقر المزدوج يفتح
// صفحة السجل.
function selectRow(property: PropertyRecord) {
  selectedProperty.value = property;
  paneOpen.value = true;
}
// إغلاق اللوحة يعيد التركيز إلى صفها.
function closePane() {
  paneOpen.value = false;
  if (selectedProperty.value) table.value?.focusRow(selectedProperty.value.id);
}
function logFollowup() {
  const property = selectedProperty.value;
  if (!property) return;
  followupTarget.value = {
    kind: "sale",
    listingId: property.id,
    listingLabel: property.name || `عقار ${property.code}`,
  };
  followupOpen.value = true;
}

// Ctrl+N: عرض جديد من القائمة. code لا key، فيعمل مع العربية؛ لا يُعترض في حوار.
function onShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyN") return;
  if (event.altKey || event.shiftKey || !can("properties.create")) return;
  if (isDialogOpen()) return;
  event.preventDefault();
  createProperty();
}

// نفس الصفحة والفلاتر من الزيارة السابقة، قبل أن يُظهر الجدول خياراته الأولى
// فلا يطلب الصفحة نفسها مرتين.
void reloadProperties();
onMounted(() => {
  setRefreshHandler(reloadProperties);
  void loadFavoriteIds();
  window.addEventListener("keydown", onShortcut);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onShortcut));
</script>

<template>
  <AppPage title="عروض البيع" :count="loading && !total ? null : total">
    <template #header-actions>
      <v-btn
        v-if="can('properties.create')"
        color="primary"
        prepend-icon="mdi-plus"
        title="إضافة عرض (Ctrl+N)"
        aria-keyshortcuts="Control+N"
        @click="createProperty"
      >
        إضافة عرض
      </v-btn>
      <v-btn
        v-if="can('properties.create')"
        variant="text"
        prepend-icon="mdi-file-import-outline"
        @click="importOpen = true"
      >
        استيراد من إكسل
      </v-btn>
    </template>

    <MasterDetailLayout
      fill
      :open="paneOpen && !!selectedProperty"
      detail-label="ملخّص العرض المحدد"
      @close="closePane"
    >
      <template #main>
        <section class="dal-panel dal-listpanel" aria-label="عروض البيع">
          <PropertyFilters
            v-model="filters"
            @apply="applyFilters"
            @cleared="favoritesOnly = false"
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
              <!-- ترتيب في زر وقائمة لا حقل: يبقى الصف الثاني بارتفاع زر. -->
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
                    v-for="option in PROPERTY_SORT_OPTIONS"
                    :key="option.value"
                    :title="option.title"
                    :active="option.value === sortValue"
                    @click="selectSort(option.value)"
                  />
                </v-list>
              </v-menu>
            </template>
          </PropertyFilters>

          <PropertiesTable
            ref="table"
            v-model:page="page"
            v-model:items-per-page="pageSize"
            v-model:sort-by="sortBy"
            :properties="properties"
            :total="total"
            :loading="loading"
            :error="error"
            :selected-id="selectedProperty?.id ?? null"
            :has-filters="hasActiveFilters"
            can-export
            @view="viewDetails"
            @edit="editProperty"
            @archive="askArchive"
            @restore="askRestore"
            @delete="askDelete"
            @export="exportProperty"
            @create="createProperty"
            @select="selectRow"
            @clear-filters="resetAll"
            @retry="reloadProperties"
            @options="onTableOptions"
          />
        </section>
      </template>
      <template #detail>
        <PropertySummary
          v-if="selectedProperty"
          :property="selectedProperty"
          @open="viewDetails(selectedProperty)"
          @edit="editProperty(selectedProperty)"
          @archive="askArchive(selectedProperty)"
          @restore="askRestore(selectedProperty)"
          @delete="askDelete(selectedProperty)"
          @followup="logFollowup"
          @close="closePane"
        />
      </template>
    </MasterDetailLayout>

    <ExcelImportDialog v-model="importOpen" @imported="reloadProperties" />
    <RecordFollowupDialog v-model="followupOpen" :target="followupTarget" />
  </AppPage>
</template>
