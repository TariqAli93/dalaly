import { contextBridge, ipcRenderer } from "electron";

// واجهة محدودة وآمنة لشاشة البدء فقط: استقبال التقدم وقراءة الإصدار.
// لا نكشف ipcRenderer كاملاً، ولا نفعّل nodeIntegration.
contextBridge.exposeInMainWorld("splashAPI", {
  // يعيد دالة لإلغاء الاشتراك (تُستخدم عند إغلاق الصفحة).
  onProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("splash:progress", handler);
    return () => ipcRenderer.removeListener("splash:progress", handler);
  },
  getVersion: () => ipcRenderer.invoke("splash:get-version"),
  // أزرار شاشة الخطأ.
  retry: () => ipcRenderer.invoke("splash:retry"),
  openLogs: () => ipcRenderer.invoke("splash:open-logs"),
  quit: () => ipcRenderer.invoke("splash:quit"),
});
