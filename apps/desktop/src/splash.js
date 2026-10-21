import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import log from "electron-log/main.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// مراحل الإقلاع مرتبطة بخطوات التشغيل الفعلية. مصدر واحد للرسائل والنسب.
// النسبة لا تصل 100% إلا بعد جاهزية النافذة الرئيسية فعلاً.
export const SPLASH_STAGES = {
  start: { progress: 6, message: "جارِ تهيئة التطبيق…" },
  backend: { progress: 40, message: "جارِ تشغيل الخادم المحلي…" },
  database: { progress: 66, message: "جارِ فحص قاعدة البيانات والتهيئة…" },
  setup: {
    progress: 72,
    message: "يلزم إعداد النظام. جارِ فتح معالج الإعداد…",
  },
  ui: { progress: 86, message: "جارِ تحميل الواجهة…" },
  ready: { progress: 100, message: "التطبيق جاهز" },
  // slow/error لا يحملان progress كي لا يتحرّك الشريط للخلف أو للأمام.
  slow: { message: "يستغرق التشغيل وقتاً أطول من المعتاد… يرجى الانتظار" },
  error: {
    message: "تعذّر بدء التطبيق. تحقّق من الخادم المحلي وقاعدة البيانات.",
    isError: true,
  },
};

let splashWindow = null;
let lastSplashStage = SPLASH_STAGES.start;

// viteUrl في التطوير، وإلا ملف splash.html المبني بجانب index.html.
export function createSplashWindow({ viteUrl, splashFile }) {
  if (splashWindow) return splashWindow;

  splashWindow = new BrowserWindow({
    width: 465,
    height: 300,
    frame: false,
    resizable: false,
    movable: false,
    center: true,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    skipTaskbar: true,
    alwaysOnTop: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    title: "دلالي",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "splash-preload.cjs"),
    },
  });
  const currentSplash = splashWindow;

  splashWindow.once("ready-to-show", () => {
    splashWindow?.show();
    log.info("Splash window ready", { width: 465, height: 300 });
  });
  splashWindow.on("closed", () => {
    splashWindow = null;
  });

  splashWindow.webContents.on("did-finish-load", () =>
    sendSplashProgress(lastSplashStage),
  );
  const splashLoad = viteUrl
    ? splashWindow.loadURL(
        new URL("splash.html", viteUrl.endsWith("/") ? viteUrl : `${viteUrl}/`)
          .href,
      )
    : splashWindow.loadFile(splashFile);
  void splashLoad.catch((error) => {
    // Closing an unfinished development navigation aborts loadURL intentionally.
    if (currentSplash.isDestroyed()) return;
    log.error("Splash renderer failed to load", error);
    dialog.showErrorBox(
      "تعذّر بدء دلالي",
      "تعذّر تحميل شاشة البدء. أعد بناء التطبيق ثم حاول تشغيله مجدداً.",
    );
    app.quit();
  });
  return splashWindow;
}

export function sendSplashProgress(stage) {
  lastSplashStage = {
    ...lastSplashStage,
    ...stage,
    isError: Boolean(stage.isError),
  };
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.send("splash:progress", lastSplashStage);
}

// إعادة الشاشة إلى وضع التحميل (يُخفي شاشة الخطأ إن كانت ظاهرة).
export function resetSplashOpacity() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.setOpacity(1);
}

export function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

export function registerSplashHandlers({ onRetry }) {
  ipcMain.handle("splash:get-version", () => app.getVersion());
  ipcMain.handle("splash:get-progress", () => lastSplashStage);
  // أزرار شاشة الخطأ.
  ipcMain.handle("splash:retry", () => {
    void onRetry();
  });
  ipcMain.handle("splash:open-logs", async () => {
    try {
      await shell.openPath(app.getPath("logs"));
    } catch (error) {
      log.error("Failed to open logs folder", error);
    }
  });
  ipcMain.handle("splash:quit", () => app.quit());
}
