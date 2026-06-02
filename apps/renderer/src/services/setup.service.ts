import type {
  DatabaseSetupInput,
  InitializeInput,
  InitializeResult,
  SetupStatus,
  TestPostgresResult,
} from "../types";
import { publicRequest } from "./api.service";

export function fetchSetupStatus() {
  return publicRequest<SetupStatus>("/setup/status");
}

export function testPostgres(input: DatabaseSetupInput) {
  return publicRequest<TestPostgresResult>("/setup/test-postgres", {
    method: "POST",
    body: JSON.stringify({ ...input, port: Number(input.port) }),
  });
}

export function initializeSystem(input: InitializeInput) {
  return publicRequest<InitializeResult>("/setup/initialize", {
    method: "POST",
    body: JSON.stringify({ ...input, port: Number(input.port) }),
  });
}

/**
 * إنشاء أول مدير فقط، عندما تكون قاعدة البيانات مهيأة والجداول موجودة
 * لكن لا يوجد مستخدم بعد. لا يحتاج بيانات مدير PostgreSQL.
 */
export function createFirstAdmin(username: string, pin: string) {
  return publicRequest<{ user: { username: string } }>("/auth/setup-admin", {
    method: "POST",
    body: JSON.stringify({ username, pin }),
  });
}

/**
 * يحفظ DATABASE_URL محلياً عبر Electron IPC (إن توفر).
 * في المتصفح أثناء التطوير يكون window.dalalyConfig غير معرّف، وهذا مقبول
 * لأن الخادم قد أعاد تهيئة الـ pool حيّاً.
 */
export async function persistDatabaseUrl(databaseUrl: string) {
  const bridge = window.dalalyConfig;
  if (bridge?.saveDatabaseUrl) {
    await bridge.saveDatabaseUrl(databaseUrl);
  }
}
