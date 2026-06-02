import { ref } from "vue";
import * as setupService from "../services/setup.service";
import type {
  InitializeInput,
  InitializeResult,
  SetupStatus,
} from "../types";

const status = ref<SetupStatus | null>(null);
const loading = ref(false);

async function fetchStatus() {
  loading.value = true;
  try {
    status.value = await setupService.fetchSetupStatus();
    return status.value;
  } finally {
    loading.value = false;
  }
}

/**
 * يهيئ النظام بالكامل ثم يحفظ DATABASE_URL محلياً عبر Electron IPC.
 */
async function initialize(input: InitializeInput): Promise<InitializeResult> {
  const result = await setupService.initializeSystem(input);
  if (result.ok && result.database_url) {
    await setupService.persistDatabaseUrl(result.database_url);
  }
  return result;
}

export function useSetup() {
  return {
    status,
    loading,
    fetchStatus,
    testPostgres: setupService.testPostgres,
    createFirstAdmin: setupService.createFirstAdmin,
    initialize,
  };
}
