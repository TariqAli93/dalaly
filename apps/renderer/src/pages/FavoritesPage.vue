<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import PropertiesTable from "../components/properties/PropertiesTable.vue";

import { listFavorites } from "../services/favorites.service";
import { getErrorMessage } from "../services/api.service";
import { useProperties } from "../composables/useProperties";
import { useConfirm } from "../composables/useConfirm";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useFavorites } from "../composables/useFavorites";
import type { PropertyRecord } from "../types";

const router = useRouter();
const { service } = useProperties();
const { openConfirm } = useConfirm();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { favoriteIds, loadFavoriteIds } = useFavorites();

const items = ref<PropertyRecord[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    await loadFavoriteIds(true);
    items.value = await listFavorites();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

// عند إزالة عقار من المفضلة عبر زر القلب، حدّث القائمة.
watch(
  favoriteIds,
  () => {
    items.value = items.value.filter((p) => favoriteIds.value.has(p.id));
  },
  { deep: true },
);

function view(property: PropertyRecord) {
  void router.push(`/properties/${property.id}`);
}
function edit(property: PropertyRecord) {
  void router.push(`/properties/${property.id}/edit`);
}
function askDelete(property: PropertyRecord) {
  openConfirm({
    title: `حذف ${property.code}`,
    body: "سيتم حذف العرض نهائياً.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await service.deleteProperty(property.id);
      await load();
      notifySuccess("تم حذف العرض.");
    },
  });
}
function askArchive(property: PropertyRecord) {
  openConfirm({
    title: `أرشفة ${property.code}`,
    body: "سيتم أرشفة العرض.",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: async () => {
      await service.archiveProperty(property.id);
      await load();
      notifySuccess("تمت الأرشفة.");
    },
  });
}
function askRestore(property: PropertyRecord) {
  openConfirm({
    title: `إرجاع ${property.code}`,
    body: "إرجاع العرض إلى متاح.",
    confirmText: "إرجاع",
    color: "success",
    onConfirm: async () => {
      await service.restoreProperty(property.id);
      await load();
      notifySuccess("تم الإرجاع.");
    },
  });
}

onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>

<template>
  <AppPage title="العروض المفضلة" subtitle="العروض التي أضفتها للمفضلة.">
    <PropertiesTable
      :properties="items"
      :loading="loading"
      empty-title="لا توجد عروض مفضلة"
      empty-text="أضف عرضاً إلى المفضلة من زر القلب في قائمة عروض البيع ليظهر هنا."
      @view="view"
      @edit="edit"
      @archive="askArchive"
      @restore="askRestore"
      @delete="askDelete"
      @create="router.push('/properties/new')"
    />
  </AppPage>
</template>
