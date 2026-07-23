<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import PropertyFilters from "../components/properties/PropertyFilters.vue";
import PropertiesTable from "../components/properties/PropertiesTable.vue";
import PropertyDetailsDialog from "../components/properties/PropertyDetailsDialog.vue";
import ExcelImportDialog from "../components/properties/ExcelImportDialog.vue";
import MasterDetailLayout from "../components/shared/MasterDetailLayout.vue";
import PropertySummary from "../components/shared/PropertySummary.vue";
import { useProperties } from "../composables/useProperties";
import { useStats } from "../composables/useStats";
import { useConfirm } from "../composables/useConfirm";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useFavorites } from "../composables/useFavorites";
import { usePermissions } from "../composables/usePermissions";
import { exportPropertiesToXlsx } from "../utils/excel";
import type { PropertyRecord } from "../types";

const router = useRouter();
const { properties, loading, filters, filteredCountLabel, loadProperties, clearFilters, service } =
  useProperties();
const { loadStats } = useStats();
const { openConfirm } = useConfirm();
const { notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { isFavorite, loadFavoriteIds } = useFavorites();
const { can } = usePermissions();

const detailsDialog = ref(false);
const selectedProperty = ref<PropertyRecord | null>(null);
const favOnly = ref(false);
const importOpen = ref(false);
// Details pane (Master–Detail): يعرض ملخّص الصف المحدد من بيانات القائمة نفسها.
const paneOpen = ref(false);

const displayed = computed(() =>
  favOnly.value ? properties.value.filter((p) => isFavorite(p.id)) : properties.value,
);

async function refreshData() {
  await Promise.all([loadProperties(), loadStats()]);
}

function viewDetails(property: PropertyRecord) {
  selectedProperty.value = property;
  detailsDialog.value = true;
}

function editProperty(property: PropertyRecord) {
  detailsDialog.value = false;
  void router.push(`/properties/${property.id}/edit`);
}

function askArchive(property: PropertyRecord) {
  openConfirm({
    title: `أرشفة ${property.code}`,
    body: "سيبقى العرض محفوظاً لكنه لن يظهر في القائمة الافتراضية.",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: async () => {
      await service.archiveProperty(property.id);
      detailsDialog.value = false;
      await refreshData();
      notifySuccess("تمت أرشفة العرض بنجاح.");
    },
  });
}

function askRestore(property: PropertyRecord) {
  openConfirm({
    title: `إرجاع ${property.code}`,
    body: "هل تريد إرجاع هذا العرض إلى حالة متاح؟",
    confirmText: "إرجاع",
    color: "success",
    onConfirm: async () => {
      await service.restoreProperty(property.id);
      detailsDialog.value = false;
      await refreshData();
      notifySuccess("تم إرجاع العرض إلى المتاح بنجاح.");
    },
  });
}

function askDelete(property: PropertyRecord) {
  openConfirm({
    title: `حذف ${property.code}`,
    body: "سيتم حذف العرض نهائياً من قاعدة البيانات. لا يمكن التراجع عن هذه العملية.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await service.deleteProperty(property.id);
      if (selectedProperty.value?.id === property.id) selectedProperty.value = null;
      detailsDialog.value = false;
      await refreshData();
      notifySuccess("تم حذف العرض بنجاح.");
    },
  });
}

function exportExcel() {
  exportPropertiesToXlsx(displayed.value);
  notifySuccess("تم تصدير العروض إلى Excel.");
}

// تحديد صف يفتح الـ Details pane (لا يفتح الحوار). الحوار الكامل يبقى عبر
// نفس حدث العرض الحالي (زر العين / زر "فتح التفاصيل" داخل الـ pane).
function selectRow(property: PropertyRecord) {
  selectedProperty.value = property;
  paneOpen.value = true;
}
function paneOpenDetails() {
  if (selectedProperty.value) viewDetails(selectedProperty.value);
}
function paneEdit() {
  if (selectedProperty.value) editProperty(selectedProperty.value);
}
function paneArchive() {
  if (selectedProperty.value) askArchive(selectedProperty.value);
}
function paneRestore() {
  if (selectedProperty.value) askRestore(selectedProperty.value);
}
function paneDelete() {
  if (selectedProperty.value) askDelete(selectedProperty.value);
}

onMounted(() => {
  setRefreshHandler(loadProperties);
  void loadProperties();
  void loadFavoriteIds();
});
</script>

<template>
  <AppLayout
    title="العروض العقارية"
    subtitle="إدارة محلية وسريعة لعروض البيع والتسويق داخل المكتب."
  >
    <template #header-actions>
      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-if="can('properties.export')"
          variant="tonal"
          prepend-icon="mdi-microsoft-excel"
          @click="exportExcel"
        >
          تصدير Excel
        </v-btn>
        <v-btn
          v-if="can('properties.create')"
          variant="tonal"
          prepend-icon="mdi-file-import-outline"
          @click="importOpen = true"
        >
          استيراد Excel
        </v-btn>
        <v-btn
          v-if="can('properties.create')"
          color="primary"
          prepend-icon="mdi-plus"
          @click="router.push('/properties/new')"
        >
          إضافة عرض
        </v-btn>
      </div>
    </template>

    <PropertyFilters v-model="filters" @apply="loadProperties" @clear="clearFilters" />

    <div class="table-meta">
      <span>النتيجة: {{ favOnly ? displayed.length + " مفضّل" : filteredCountLabel }}</span>
      <v-switch
        v-model="favOnly"
        color="error"
        density="compact"
        hide-details
        label="المفضلة فقط"
      />
    </div>

    <MasterDetailLayout
      :open="paneOpen && !!selectedProperty"
      @close="paneOpen = false"
    >
      <template #main>
        <PropertiesTable
          :properties="displayed"
          :loading="loading"
          :selected-id="selectedProperty?.id ?? null"
          @view="viewDetails"
          @edit="editProperty"
          @archive="askArchive"
          @restore="askRestore"
          @delete="askDelete"
          @create="router.push('/properties/new')"
          @select="selectRow"
        />
      </template>
      <template #detail>
        <PropertySummary
          v-if="selectedProperty"
          :property="selectedProperty"
          @open="paneOpenDetails"
          @edit="paneEdit"
          @archive="paneArchive"
          @restore="paneRestore"
          @delete="paneDelete"
          @close="paneOpen = false"
        />
      </template>
    </MasterDetailLayout>

    <PropertyDetailsDialog
      v-model="detailsDialog"
      :property="selectedProperty"
      @edit="editProperty"
      @archive="askArchive"
      @restore="askRestore"
      @delete="askDelete"
    />

    <ExcelImportDialog v-model="importOpen" @imported="refreshData" />
  </AppLayout>
</template>
