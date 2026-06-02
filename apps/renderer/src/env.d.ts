/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
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
  chooseExportPath?: () => Promise<{ canceled?: boolean; filePath?: string }>;
  pickBackupFile?: () => Promise<{ path?: string; canceled?: boolean }>;
  pickFolder?: () => Promise<{ path?: string; canceled?: boolean }>;
  saveScheduledBackup?: (config: unknown) => Promise<{ ok: boolean }>;
  getScheduledBackup?: () => Promise<Record<string, unknown> | null>;
}

interface Window {
  dalalyConfig?: DalalyConfigBridge;
}
