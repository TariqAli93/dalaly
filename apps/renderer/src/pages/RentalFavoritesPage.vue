<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import RentalTable from "../components/rentals/RentalTable.vue";
import * as rentals from "../services/rentals.service";
import { getErrorMessage } from "../services/api.service";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import { useRentalActions } from "../composables/useRentalActions";
import { exportRentalFolder } from "../utils/listingExport";
import type { RentalRecord } from "../types";

/** العروض الإيجارية المفضلة للمستخدم الحالي، بجدول قائمة الإيجارات نفسه. */
const router = useRouter();
const { setRefreshHandler } = useRefresh();
const { notifyError, notifySuccess } = useSnackbar();

const items = ref<RentalRecord[]>([]);
const favoriteIds = ref(new Set<number>());
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    items.value = await rentals.listRentalFavorites();
    favoriteIds.value = new Set(items.value.map((item) => item.id));
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function removeFavorite(item: RentalRecord) {
  try {
    await rentals.removeRentalFavorite(item.id);
    items.value = items.value.filter((rental) => rental.id !== item.id);
    favoriteIds.value.delete(item.id);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
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

const { askArchive, askRestore, askDelete } = useRentalActions(load);

onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>

<template>
  <AppPage
    title="مفضلة الإيجارات"
    :count="loading && !items.length ? null : items.length"
  >
    <section
      class="dal-panel dal-listpanel dal-fill"
      aria-label="مفضلة الإيجارات"
    >
      <RentalTable
        :rentals="items"
        :favorite-ids="favoriteIds"
        :loading="loading"
        :error="error"
        empty-title="لا توجد عروض إيجار مفضلة"
        empty-text="أضف عرضاً إلى المفضلة من زر القلب في قائمة عروض الإيجار ليظهر هنا."
        @view="router.push(`/rentals/${$event.id}`)"
        @edit="router.push(`/rentals/${$event.id}/edit`)"
        @archive="askArchive"
        @restore="askRestore"
        @delete="askDelete"
        @favorite="removeFavorite"
        @export="exportRental"
        @retry="load"
        @create="router.push('/rentals/new')"
      />
    </section>
  </AppPage>
</template>
