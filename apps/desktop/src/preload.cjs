// Explicit CommonJS keeps preload loading synchronous in the ESM desktop package.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dalalyConfig", {
  getStartupHealth: () => ipcRenderer.invoke("startup:get-health"),
  rendererReady: (health) =>
    ipcRenderer.invoke("startup:renderer-ready", health),
  setupRequest: (input) => ipcRenderer.invoke("setup:request", input),
  openMapLink: (url) => ipcRenderer.invoke("maps:open-external", url),
  // يحفظ DATABASE_URL الناتج عن تهيئة النظام (First Run Wizard).
  saveDatabaseUrl: (databaseUrl) =>
    ipcRenderer.invoke("config:save-database-url", databaseUrl),

  saveDatabaseConfig: (config) =>
    ipcRenderer.invoke("config:save-database", config),

  getDatabaseConfigStatus: () =>
    ipcRenderer.invoke("config:get-database-status"),

  // تصدير PDF عبر العملية الرئيسية.
  exportPdf: (input) => ipcRenderer.invoke("export:save-pdf", input),
  saveFile: (input) => ipcRenderer.invoke("export:save-file", input),
  exportFolder: (input) => ipcRenderer.invoke("export:save-folder", input),

  // النسخ الاحتياطي والجدولة.
  chooseExportPath: () => ipcRenderer.invoke("backup:choose-export-path"),
  pickBackupFile: () => ipcRenderer.invoke("backup:pick-file"),
  pickFolder: () => ipcRenderer.invoke("backup:pick-folder"),
  saveScheduledBackup: (config) =>
    ipcRenderer.invoke("backup:save-schedule", config),
  getScheduledBackup: () => ipcRenderer.invoke("backup:get-schedule"),
});
