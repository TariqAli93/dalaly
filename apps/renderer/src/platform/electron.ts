/**
 * تنفيذ المنصّة داخل تطبيق سطح المكتب: يمرّر كل شيء إلى جسر preload
 * (window.dalalyConfig) بنفس الاستدعاءات التي كانت موزّعة على المكوّنات.
 */
import type {
  PickedFile,
  PickedFolder,
  PlatformAdapter,
  SaveResult,
  ScheduledBackupConfig,
} from "./types";

function bridge() {
  return window.dalalyConfig;
}

export const electronPlatform: PlatformAdapter = {
  name: "electron",
  isDesktop: true,
  supportsScheduledBackup: Boolean(bridge()?.getScheduledBackup),

  async exportPdf({ html, suggestedName }): Promise<SaveResult> {
    const api = bridge();
    if (!api?.exportPdf) return { ok: false, canceled: true };
    return api.exportPdf({ html, suggestedName });
  },

  async chooseBackupExportPath() {
    const api = bridge();
    if (!api?.chooseExportPath) return { canceled: true };
    return api.chooseExportPath();
  },

  async pickBackupFile(): Promise<PickedFile> {
    const api = bridge();
    if (!api?.pickBackupFile) return { canceled: true };
    const result = await api.pickBackupFile();
    return { path: result?.path, name: result?.path, canceled: result?.canceled };
  },

  async pickFolder(): Promise<PickedFolder> {
    const api = bridge();
    if (!api?.pickFolder) return { canceled: true };
    return api.pickFolder();
  },

  async getScheduledBackup() {
    const api = bridge();
    if (!api?.getScheduledBackup) return null;
    return (await api.getScheduledBackup()) as ScheduledBackupConfig | null;
  },

  async saveScheduledBackup(config: ScheduledBackupConfig) {
    const api = bridge();
    if (!api?.saveScheduledBackup) return { ok: false };
    return api.saveScheduledBackup(config);
  },

  async saveDatabaseUrl(databaseUrl: string) {
    const api = bridge();
    if (!api?.saveDatabaseUrl) return { ok: true };
    return api.saveDatabaseUrl(databaseUrl);
  },

  unavailableReason() {
    return null;
  },
};
