<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import RentalTable from "../components/rentals/RentalTable.vue";
import RentalDetailsDialog from "../components/rentals/RentalDetailsDialog.vue";
import * as rentals from "../services/rentals.service";
import { getErrorMessage } from "../services/api.service";
import { useConfirm } from "../composables/useConfirm";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import type { RentalRecord } from "../types";

const router = useRouter();
const { openConfirm } = useConfirm();
const { setRefreshHandler } = useRefresh();
const { notifyError, notifySuccess } = useSnackbar();

const items = ref<RentalRecord[]>([]);
const favoriteIds = ref(new Set<number>());
const loading = ref(false);
const selected = ref<RentalRecord | null>(null);
const detailsDialog = ref(false);

async function load() {
  loading.value = true;
  try {
    items.value = await rentals.listRentalFavorites();
    favoriteIds.value = new Set(items.value.map((item) => item.id));
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

function view(item: RentalRecord) {
  selected.value = item;
  detailsDialog.value = true;
}

function edit(item: RentalRecord) {
  detailsDialog.value = false;
  void router.push(`/rentals/${item.id}/edit`);
}

function removeFavorite(item: RentalRecord) {
  void rentals.removeRentalFavorite(item.id)
    .then(load)
    .catch((error) => notifyError(getErrorMessage(error)));
}

function askArchive(item: RentalRecord) {
  openConfirm({
    title: `أرشفة ${item.code}`,
    body: "سيبقى العرض محفوظاً لكنه لن يظهر في القائمة الافتراضية.",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: async () => {
      try {
        await rentals.archiveRental(item.id);
        detailsDialog.value = false;
        await load();
        notifySuccess("تمت أرشفة الإيجار بنجاح.");
      } catch (error) {
        notifyError(getErrorMessage(error));
      }
    },
  });
}

function askRestore(item: RentalRecord) {
  openConfirm({
    title: `إرجاع ${item.code}`,
    body: "هل تريد إرجاع هذا الإيجار إلى حالة متاح؟",
    confirmText: "إرجاع",
    color: "success",
    onConfirm: async () => {
      try {
        await rentals.restoreRental(item.id);
        detailsDialog.value = false;
        await load();
        notifySuccess("تم إرجاع الإيجار بنجاح.");
      } catch (error) {
        notifyError(getErrorMessage(error));
      }
    },
  });
}

function askDelete(item: RentalRecord) {
  openConfirm({
    title: `حذف ${item.code}`,
    body: "سيتم حذف الإيجار وصوره ومتابعاته نهائياً.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      try {
        await rentals.deleteRental(item.id);
        detailsDialog.value = false;
        selected.value = null;
        await load();
        notifySuccess("تم حذف الإيجار بنجاح.");
      } catch (error) {
        notifyError(getErrorMessage(error));
      }
    },
  });
}

onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>

<template>
  <AppLayout title="مفضلة الإيجارات" subtitle="العروض الإيجارية المحفوظة للمستخدم الحالي.">
    <RentalTable
      :rentals="items"
      :favorite-ids="favoriteIds"
      :loading="loading"
      @view="view"
      @edit="edit"
      @archive="askArchive"
      @restore="askRestore"
      @delete="askDelete"
      @favorite="removeFavorite"
      @create="router.push('/rentals/new')"
    />
    <RentalDetailsDialog
      v-model="detailsDialog"
      :rental="selected"
      @edit="edit"
      @archive="askArchive"
      @restore="askRestore"
      @delete="askDelete"
    />
  </AppLayout>
</template>
