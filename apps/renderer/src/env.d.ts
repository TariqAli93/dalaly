/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** "true" في وضع web-demo فقط (pnpm dev:web) — لا يُفعَّل في نسخة سطح المكتب. */
  readonly VITE_WEB_DEMO?: string;
  /** "true" أثناء جلسات التصوير الآلي (Playwright). */
  readonly VITE_CAPTURE_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DalalyConfigBridge {
  saveDatabaseUrl: (databaseUrl: string) => Promise<{ ok: boolean; message?: string }>;
  saveDatabaseConfig: (config: unknown) => Promise<{ ok: boolean }>;
  getDatabaseConfigStatus: () => Promise<{ configured: boolean; database: unknown }>;
  exportPdf?: (input: { html: string; suggestedName: string }) => Promise<{
    ok: boolean;
    path?: string;
    canceled?: boolean;
    fallback?: boolean;
  }>;
  saveFile?: (input: {
    data: Uint8Array;
    suggestedName: string;
    title: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }) => Promise<{ ok: boolean; path?: string; canceled?: boolean; message?: string }>;
  exportFolder?: (input: {
    files: Array<{ name: string; data: Uint8Array }>;
    suggestedFolderName: string;
    title: string;
  }) => Promise<{ ok: boolean; path?: string; canceled?: boolean; message?: string }>;
  chooseExportPath?: () => Promise<{ canceled?: boolean; filePath?: string }>;
  pickBackupFile?: () => Promise<{ path?: string; canceled?: boolean }>;
  pickFolder?: () => Promise<{ path?: string; canceled?: boolean }>;
  saveScheduledBackup?: (config: unknown) => Promise<{ ok: boolean }>;
  getScheduledBackup?: () => Promise<Record<string, unknown> | null>;
}

interface Window {
  dalalyConfig?: DalalyConfigBridge;
}
