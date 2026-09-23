<script setup lang="ts">
import { ref } from "vue";
import { useSnackbar } from "../../composables/useSnackbar";
import { exportRentalFolder } from "../../utils/listingExport";
import type { RentalRecord } from "../../types";

const props = defineProps<{ rental: RentalRecord }>();
const { notifySuccess, notifyError } = useSnackbar();
const loading = ref(false);

async function exportFolder() {
  loading.value = true;
  try {
    const result = await exportRentalFolder(props.rental);
    if (result.canceled) return;
    if (!result.ok)
      throw new Error(result.message ?? "تعذر تصدير مجلد الإيجار.");
    notifySuccess(
      `تم تصدير الإيجار مع صوره إلى: ${result.path ?? "المجلد المحدد"}`,
    );
  } catch (error) {
    notifyError(
      error instanceof Error ? error.message : "تعذر تصدير مجلد الإيجار.",
    );
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-btn
    variant="tonal"
    prepend-icon="mdi-folder-multiple-outline"
    :loading="loading"
    @click="exportFolder"
  >
    تصدير TXT والصور
  </v-btn>
</template>
