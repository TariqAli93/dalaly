import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("dalalyConfig", {
  // يحفظ DATABASE_URL الناتج عن تهيئة النظام (First Run Wizard).
  saveDatabaseUrl: (databaseUrl) =>
    ipcRenderer.invoke("config:save-database-url", databaseUrl),

  saveDatabaseConfig: (config) =>
    ipcRenderer.invoke("config:save-database", config),

  getDatabaseConfigStatus: () =>
    ipcRenderer.invoke("config:get-database-status"),

  // تصدير PDF عبر العملية الرئيسية.
  exportPdf: (input) => ipcRenderer.invoke("export:save-pdf", input),

  // النسخ الاحتياطي والجدولة.
  chooseExportPath: () => ipcRenderer.invoke("backup:choose-export-path"),
  pickBackupFile: () => ipcRenderer.invoke("backup:pick-file"),
  pickFolder: () => ipcRenderer.invoke("backup:pick-folder"),
  saveScheduledBackup: (config) => ipcRenderer.invoke("backup:save-schedule", config),
  getScheduledBackup: () => ipcRenderer.invoke("backup:get-schedule"),
});
