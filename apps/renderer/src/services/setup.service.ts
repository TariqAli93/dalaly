import type {
  DatabaseSetupInput,
  InitializeInput,
  InitializeResult,
  SetupStatus,
  TestPostgresResult,
} from "../types";
import { platform } from "../platform";
import { ApiError, publicRequest } from "./api.service";

async function bounded<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "انتهت مهلة العملية. تحقق من حالة النظام ثم أعد المحاولة.",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function setupRequest<T>(path: string, body?: unknown): Promise<T> {
  if (window.dalalyConfig?.setupRequest) {
    const result = await bounded(
      window.dalalyConfig.setupRequest({ path, body }),
      65000,
    );
    if (result.status < 200 || result.status >= 300)
      throw new ApiError(result.body, result.status);
    return result.body as T;
  }
  return publicRequest<T>(path, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(path === "/setup/status" ? 6000 : 60000),
  });
}

export function fetchSetupStatus() {
  return window.dalalyConfig?.getStartupHealth
    ? bounded(window.dalalyConfig.getStartupHealth(), 7000)
    : setupRequest<SetupStatus>("/setup/status");
}

export function testPostgres(input: DatabaseSetupInput) {
  return setupRequest<TestPostgresResult>("/setup/test-postgres", {
    ...input,
    port: Number(input.port),
  });
}

export function initializeSystem(input: InitializeInput) {
  return setupRequest<InitializeResult>("/setup/initialize", {
    ...input,
    port: Number(input.port),
  });
}

/**
 * إنشاء أول مدير فقط، عندما تكون قاعدة البيانات مهيأة والجداول موجودة
 * لكن لا يوجد مستخدم بعد. لا يحتاج بيانات مدير PostgreSQL.
 */
export function createFirstAdmin(username: string, pin: string) {
  return setupRequest<{ user: { username: string } }>("/auth/setup-admin", {
    username,
    pin,
  });
}

export function recoverSystem() {
  return setupRequest<SetupStatus>("/setup/recover", {});
}

/**
 * يحفظ DATABASE_URL محلياً عبر طبقة المنصّة (Electron IPC).
 * في المتصفح لا يوجد ملف إعدادات محلي، وهذا مقبول لأن الخادم قد أعاد
 * تهيئة الـ pool حيّاً.
 */
export async function persistDatabaseUrl(databaseUrl: string) {
  const result = await bounded(platform.saveDatabaseUrl(databaseUrl), 6000);
  if (!result.ok)
    throw new Error(result.message || "تعذر حفظ إعدادات قاعدة البيانات.");
}
