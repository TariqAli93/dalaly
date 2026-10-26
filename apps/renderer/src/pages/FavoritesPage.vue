<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import PropertiesTable from "../components/properties/PropertiesTable.vue";
import { listFavorites } from "../services/favorites.service";
import { getErrorMessage } from "../services/api.service";
import { useRefresh } from "../composables/useRefresh";
import { useFavorites } from "../composables/useFavorites";
import { usePropertyActions } from "../composables/usePropertyActions";
import type { PropertyRecord } from "../types";

/** عروض البيع المفضلة للمستخدم الحالي، بجدول قائمة العروض نفسه. */
const router = useRouter();
const { setRefreshHandler } = useRefresh();
const { favoriteIds, loadFavoriteIds } = useFavorites();

const items = ref<PropertyRecord[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    await loadFavoriteIds(true);
    items.value = await listFavorites();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

// إزالة عرض من المفضلة بزر القلب تُخرجه من هذه القائمة فوراً.
watch(
  favoriteIds,
  () => {
    items.value = items.value.filter((p) => favoriteIds.value.has(p.id));
  },
  { deep: true },
);

const { askArchive, askRestore, askDelete } = usePropertyActions(load);

onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>

<template>
  <AppPage
    title="العروض المفضلة"
    :count="loading && !items.length ? null : items.length"
  >
    <section
      class="dal-panel dal-listpanel dal-fill"
      aria-label="العروض المفضلة"
    >
      <PropertiesTable
        :properties="items"
        :loading="loading"
        :error="error"
        empty-title="لا توجد عروض مفضلة"
        empty-text="أضف عرضاً إلى المفضلة من زر القلب في قائمة عروض البيع ليظهر هنا."
        @view="router.push(`/properties/${$event.id}`)"
        @edit="router.push(`/properties/${$event.id}/edit`)"
        @archive="askArchive"
        @restore="askRestore"
        @delete="askDelete"
        @retry="load"
        @create="router.push('/properties/new')"
      />
    </section>
  </AppPage>
</template>
