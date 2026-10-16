import { ref } from "vue";
import * as setupService from "../services/setup.service";
import type { InitializeInput, InitializeResult, SetupStatus } from "../types";

const status = ref<SetupStatus | null>(null);
const loading = ref(false);
const startupState = ref<SetupStatus["startup_state"]>("CHECKING");
const startupMessage = ref("جارِ فحص حالة النظام…");
let statusRequest: Promise<SetupStatus> | null = null;

function fetchStatus(): Promise<SetupStatus> {
  if (statusRequest) return statusRequest;
  loading.value = true;
  startupState.value = "CHECKING";
  statusRequest = checkStatus().finally(() => {
    loading.value = false;
    statusRequest = null;
  });
  return statusRequest;
}

async function checkStatus(): Promise<SetupStatus> {
  const deadline = Date.now() + 30000;
  try {
    while (Date.now() < deadline) {
      const health = await setupService.fetchSetupStatus();
      if (!health.startup_state)
        throw new Error("استجابة فحص النظام غير صالحة.");
      status.value = health;
      startupState.value = health.startup_state;
      startupMessage.value =
        health.startup_reason === "DATABASE_CONNECTION"
          ? "تعذر الاتصال بخادم قاعدة البيانات. تحقق من تشغيل PostgreSQL ثم أعد المحاولة."
          : "جارِ فحص قاعدة البيانات والتهيئة…";
      if (health.startup_state !== "CHECKING") return health;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    throw new Error(
      "انتهت مهلة تهيئة النظام. أعد المحاولة أو راجع سجلات الخادم.",
    );
  } catch (error) {
    status.value = null;
    startupState.value = "ERROR";
    startupMessage.value =
      error instanceof Error && error.message.includes("مهلة")
        ? error.message
        : "تعذر الوصول إلى الخادم المحلي. أعد المحاولة بعد التأكد من تشغيله.";
    throw error;
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
    startupState,
    startupMessage,
    fetchStatus,
    testPostgres: setupService.testPostgres,
    createFirstAdmin: setupService.createFirstAdmin,
    recoverSystem: setupService.recoverSystem,
    initialize,
  };
}
