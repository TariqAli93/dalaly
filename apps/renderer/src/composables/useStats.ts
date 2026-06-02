import { ref } from "vue";
import { getErrorMessage } from "../services/api.service";
import * as statsService from "../services/stats.service";
import type { StatsSummary } from "../types";
import { useSnackbar } from "./useSnackbar";

const stats = ref<StatsSummary>({
  total: 0,
  available: 0,
  sold: 0,
  archived: 0,
  by_type: [],
  by_legal_type: [],
  by_pricing_method: [],
});

const statsLoading = ref(false);

async function loadStats() {
  const { notifyError } = useSnackbar();
  statsLoading.value = true;
  try {
    stats.value = await statsService.fetchSummary();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    statsLoading.value = false;
  }
}

export function useStats() {
  return { stats, statsLoading, loadStats };
}
