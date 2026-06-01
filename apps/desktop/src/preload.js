import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("dalalyConfig", {
  saveDatabaseConfig: (config) =>
    ipcRenderer.invoke("config:save-database", config),

  getDatabaseConfigStatus: () =>
    ipcRenderer.invoke("config:get-database-status"),
});
