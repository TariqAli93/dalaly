import { app, BrowserWindow, dialog, shell, ipcMain } from "electron";
import log from "electron-log/main.js";
import { appConfigPath, readAppConfig, writeAppConfig } from "./app-config.js";
import { createBackupScheduler, registerBackupHandlers } from "./backup.js";
import { registerDocumentExport } from "./document-export.js";
import {
  safeExternalUrl,
  safeMapLinkUrl,
  isSameDocumentNavigation,
} from "./external-links.js";
import { isMainWindowSender } from "./ipc-guard.js";
import {
  SPLASH_STAGES,
  closeSplashWindow,
  createSplashWindow,
  registerSplashHandlers,
  resetSplashOpacity,
  sendSplashProgress,
} from "./splash.js";
import { fetchJson, pollApiHealth, withDeadline } from "./startup.js";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

log.initialize();
log.transports.file.level = "info";
log.transports.console.level = "info";

app.commandLine.appendSwitch("lang", "ar-IQ");
app.setName("دلالي");
// Honor Chromium's explicit profile switch for isolated packaged verification.
const profileDirectory = app.commandLine.getSwitchValue("user-data-dir");
if (profileDirectory) {
  const resolvedProfileDirectory = path.resolve(profileDirectory);
  fs.mkdirSync(resolvedProfileDirectory, { recursive: true });
  app.setPath("userData", resolvedProfileDirectory);
}
// The lock is per userData folder, so isolated test profiles still run side
// by side. A second launch would otherwise start another API on the same port
// and talk to the first one with the wrong internal token.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..", "..");

const isDev = !app.isPackaged;
const isPackaged = app.isPackaged;
const apiPort = process.env.API_PORT ?? "34567";
const apiHost = process.env.API_HOST ?? "127.0.0.1";
const apiUrl = `http://${apiHost}:${apiPort}`;
const viteUrl = process.env.VITE_DEV_SERVER_URL;

const serverDir = isDev
  ? path.join(rootDir, "server")
  : path.join(process.resourcesPath, "server");

const serverEntry = isDev
  ? "src/index.ts"
  : path.join(serverDir, "dist", "index.js");

const rendererIndex = isDev
  ? path.join(rootDir, "apps", "renderer", "dist", "index.html")
  : path.join(process.resourcesPath, "renderer", "dist", "index.html");

const splashOptions = {
  viteUrl,
  splashFile: path.join(path.dirname(rendererIndex), "splash.html"),
};

const migrationsDir =
  process.env.DRIZZLE_MIGRATIONS_DIR ||
  (isDev
    ? path.join(rootDir, "server", "drizzle")
    : path.join(process.resourcesPath, "server", "drizzle"));

const appDataDir = app.getPath("userData");
// توكن داخلي لحماية نقاط الجدولة في الخادم.
const internalToken = crypto.randomUUID();

let serverProcess = null;
let mainWindow = null;
let mainReadyToShow = null;
let rendererReady = null;
let resolveRendererReady = null;
let startupState = "CHECKING";
let startupInFlight = false;

// تُغلق شاشة البدء فور جاهزية التطبيق، دون مدة ظهور مصطنعة.
const SLOW_AFTER_MS = 8000; // بعدها نُظهر حالة "يستغرق وقتاً أطول" دون فشل.

async function createWindow(initialPath = "/") {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: "دلالي",
    backgroundColor: "#F3F5F6",
    autoHideMenuBar: true,
    // تبقى مخفية حتى تكتمل شاشة البدء، لمنع الوميض والظهور خلف الـ Splash.
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // OSM treats packaged Electron as a native client: identify Dalaly explicitly.
  // Keep Chromium's normal disk cache and do not invent a web Referer for file://.
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ["https://tile.openstreetmap.org/*"] },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          "User-Agent": `Dalaly/${app.getVersion()} (Electron desktop; codel.dalaly.desktop)`,
        },
      });
    },
  );

  // وعد جاهزية العرض لاستخدامه في تسلسل الإقلاع.
  mainReadyToShow = new Promise((resolve) => {
    mainWindow.once("ready-to-show", resolve);
  });
  rendererReady = new Promise((resolve) => {
    resolveRendererReady = resolve;
  });
  mainWindow.webContents.once("render-process-gone", (_event, details) => {
    log.error("Startup renderer exited", details);
    resolveRendererReady?.({
      startup_state: "ERROR",
      startup_reason: "RENDERER_FAILED",
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safe = safeExternalUrl(url);
    if (safe)
      void shell
        .openExternal(safe)
        .catch((error) => log.warn("Could not open external link", error));
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (isSameDocumentNavigation(current, url)) return;
    event.preventDefault();
    const safe = safeExternalUrl(url);
    if (safe)
      void shell
        .openExternal(safe)
        .catch((error) => log.warn("Could not open external link", error));
  });
  // نموذج بتعديلات غير محفوظة يلغي beforeunload (useDirtyForm). بلا هذا
  // المعالج يبقى الإغلاق معلّقاً دون أي سؤال؛ الافتراضي البقاء.
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "warning",
      buttons: ["البقاء في البرنامج", "الإغلاق دون حفظ"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: "تعديلات غير محفوظة",
      message: "في النموذج المفتوح تعديلات لم تُحفظ بعد.",
      detail: "إن أغلقت الآن ستضيع هذه التعديلات.",
    });
    // preventDefault هنا يتجاهل إلغاء الصفحة فيُكمل الإغلاق.
    if (choice === 1) event.preventDefault();
  });

  if (viteUrl) {
    const url = new URL(viteUrl);
    url.hash = initialPath;
    await mainWindow.loadURL(url.href);
    return;
  }

  if (!fs.existsSync(rendererIndex)) {
    log.error("Renderer index.html not found", { rendererIndex });
    throw new Error(`Renderer not found: ${rendererIndex}`);
  }

  await mainWindow.loadFile(rendererIndex, { hash: initialPath });
}

function startLocalApi() {
  if (serverProcess) return;

  const command = process.execPath;
  // Resolve the installed runtime directly: startup must not depend on a shell
  // or Corepack trying to download a package manager while offline.
  const args = isDev
    ? [
        createRequire(path.join(serverDir, "package.json")).resolve("tsx/cli"),
        "src/index.ts",
      ]
    : [serverEntry];

  if (!isDev && !fs.existsSync(serverEntry)) {
    log.error("Local API entry not found", { serverEntry });
    return;
  }

  log.info("Starting local API", {
    isDev,
    serverDir,
    serverEntry,
    migrationsDir,
    apiHost,
    apiPort,
  });

  const appConfig = readAppConfig();
  const databaseUrl = appConfig.databaseUrl || process.env.DATABASE_URL || "";

  log.info("Database config loaded", {
    configPath: appConfigPath(),
    hasDatabaseUrl: Boolean(databaseUrl),
  });

  serverProcess = spawn(command, args, {
    cwd: serverDir,
    // Direct runtime invocation also handles paths containing spaces offline.
    shell: false,
    windowsHide: true,
    stdio: isDev ? "inherit" : ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ELECTRON_RUN_AS_NODE: "1",
      API_HOST: apiHost,
      API_PORT: apiPort,
      // كل المسارات تُمرَّر عبر متغيرات بيئة جاهزة (path.join) بلا تحليل نصوص.
      DRIZZLE_MIGRATIONS_DIR: migrationsDir,
      APP_DATA_DIR: appDataDir,
      IMAGES_DIR: path.join(appDataDir, "images", "properties"),
      BACKUP_DIR: path.join(appDataDir, "backups"),
      INTERNAL_TOKEN: internalToken,
    },
  });

  serverProcess.stdout?.on("data", (chunk) => {
    log.info(`[api stdout] ${String(chunk).trim()}`);
  });

  serverProcess.stderr?.on("data", (chunk) => {
    log.error(`[api stderr] ${String(chunk).trim()}`);
  });

  serverProcess.on("exit", (code, signal) => {
    log.error("Local API exited", { code, signal });
    serverProcess = null;
  });
  serverProcess.on("error", (error) => {
    log.error("Local API failed to start", error);
    serverProcess = null;
  });
}

// يفحص جاهزية الخادم المحلي عبر /api/health ويعيد كائن الصحة، أو يرمي
// STARTUP_BACKEND_TIMEOUT عند انتهاء المهلة. مجرّد استطلاع لنقطة الصحة الحالية.
async function waitForApiHealth(timeoutMs = 25000) {
  // Retry quickly until the API listens; a refused connection costs nothing.
  return pollApiHealth(
    `${apiUrl}/api/health`,
    timeoutMs,
    () => sendSplashProgress(SPLASH_STAGES.database),
    100,
  );
}

function trustedMainSender(event) {
  return isMainWindowSender(event, mainWindow);
}

function transitionStartup(state, reason) {
  if (startupState !== state)
    log.info("Startup state transition", {
      from: startupState,
      to: state,
      reason,
    });
  startupState = state;
}

ipcMain.handle("startup:get-health", async (event) => {
  if (!trustedMainSender(event)) throw new Error("Invalid startup sender");
  const { status, body } = await fetchJson(`${apiUrl}/api/health`);
  if (status !== 200) throw new Error("STARTUP_BACKEND");
  transitionStartup(body.startup_state, body.startup_reason);
  return body;
});
ipcMain.handle("startup:renderer-ready", (event, health) => {
  if (!trustedMainSender(event)) return;
  if (!["READY", "SETUP_REQUIRED", "ERROR"].includes(health?.startup_state))
    return;
  resolveRendererReady?.(health);
});
const setupPaths = new Set([
  "/setup/status",
  "/setup/test-postgres",
  "/setup/initialize",
  "/setup/recover",
  "/auth/setup-admin",
]);
ipcMain.handle("setup:request", async (event, input) => {
  if (!trustedMainSender(event) || !setupPaths.has(input?.path))
    throw new Error("Invalid setup request");
  return fetchJson(
    `${apiUrl}/api${input.path}`,
    {
      method: input.path === "/setup/status" ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dalaly-Internal-Token": internalToken,
      },
      body:
        input.path === "/setup/status"
          ? undefined
          : JSON.stringify(input.body ?? {}),
    },
    60000,
  );
});

function stopLocalApi() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
}

ipcMain.handle("maps:open-external", async (event, value) => {
  if (!trustedMainSender(event)) return { ok: false };
  const url = safeMapLinkUrl(value);
  if (!url) return { ok: false };
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

// يحفظ DATABASE_URL الناتج عن /api/setup/initialize ليُستخدم في التشغيل القادم.
// الخادم الحالي يكون قد أعاد تهيئة الـ pool حيّاً، لذا لا حاجة لإعادة تشغيله الآن.
ipcMain.handle("config:save-database-url", async (event, databaseUrl) => {
  if (
    !trustedMainSender(event) ||
    typeof databaseUrl !== "string" ||
    !databaseUrl
  ) {
    return { ok: false, message: "DATABASE_URL غير صالح." };
  }

  const existing = readAppConfig();
  writeAppConfig({ ...existing, databaseUrl });
  return { ok: true };
});

registerDocumentExport(() => mainWindow);
registerBackupHandlers(() => mainWindow);
registerSplashHandlers({ onRetry: () => runStartup() });

const backupScheduler = createBackupScheduler({ apiUrl, internalToken });

// الجاهزية الفعلية: خادم محلي يعمل، /api/health ناجح، وقاعدة بيانات سليمة
// إن كانت مهيأة، ثم تحميل نافذة التطبيق. يرمي خطأً عند الفشل الفادح.
async function waitForApplicationReady() {
  startLocalApi();
  sendSplashProgress(SPLASH_STAGES.backend);

  const health = await waitForApiHealth();
  if (!health || health.ok !== true) {
    throw new Error("STARTUP_BACKEND");
  }

  transitionStartup(health.startup_state, health.startup_reason);
  if (health.startup_state === "ERROR") throw new Error(health.startup_reason);
  sendSplashProgress(SPLASH_STAGES.database);
  const setupRequired = health.startup_state === "SETUP_REQUIRED";
  sendSplashProgress(setupRequired ? SPLASH_STAGES.setup : SPLASH_STAGES.ui);
  // ready-to-show only confirms the first paint. Vue confirms completed router
  // navigation separately, so the splash never closes over a blank router-view.
  await withDeadline(
    (async () => {
      await createWindow(setupRequired ? "/setup" : "/");
      const [, rendererHealth] = await Promise.all([
        mainReadyToShow,
        rendererReady,
      ]);
      if (rendererHealth?.startup_state === "ERROR")
        throw new Error(rendererHealth.startup_reason);
    })(),
    20000,
    "STARTUP_RENDERER_TIMEOUT",
  );
}

// تسلسل الإقلاع القابل لإعادة التشغيل (زر إعادة المحاولة).
async function runStartup() {
  if (startupInFlight) return;
  startupInFlight = true;
  transitionStartup("CHECKING", "RETRY");

  resetSplashOpacity();
  sendSplashProgress(SPLASH_STAGES.start);

  const slowTimer = setTimeout(
    () => sendSplashProgress(SPLASH_STAGES.slow),
    SLOW_AFTER_MS,
  );

  try {
    await waitForApplicationReady();
    clearTimeout(slowTimer);

    sendSplashProgress(SPLASH_STAGES.ready); // 100% فقط بعد الجاهزية.
    // يُعرض التطبيق فور جاهزيته ثم تُغلق شاشة البدء.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    closeSplashWindow();
    log.info("Startup complete", { mainReady: true, splashClosed: true });
    backupScheduler.start();
  } catch (error) {
    clearTimeout(slowTimer);
    log.error("Startup sequence failed", error);
    transitionStartup(
      "ERROR",
      error instanceof Error ? error.message : "STARTUP_FAILED",
    );
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    mainWindow = null;
    sendSplashProgress({
      ...SPLASH_STAGES.error,
      message:
        error?.message === "DATABASE_CONNECTION"
          ? "تعذر الاتصال بخادم قاعدة البيانات. تحقق من تشغيل PostgreSQL ثم أعد المحاولة."
          : error?.message?.startsWith("STARTUP_RENDERER")
            ? "تعذر تحميل الواجهة. أعد المحاولة أو افتح السجلات لمعرفة السبب."
            : "تعذر تشغيل الخادم المحلي أو اكتمال التهيئة. أعد المحاولة أو افتح السجلات.",
    });
  } finally {
    startupInFlight = false;
  }
}

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  if (!hasInstanceLock) return;
  if (process.platform === "win32")
    app.setAppUserModelId(
      isPackaged ? "codel.dalaly.desktop" : process.execPath,
    );
  createSplashWindow(splashOptions);
  void runStartup();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashWindow(splashOptions);
      void runStartup();
    }
  });
});

process.on("uncaughtException", (error) => {
  log.error("Uncaught exception", error);
});

process.on("unhandledRejection", (error) => {
  log.error("Unhandled rejection", error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  closeSplashWindow();
});

// before-quit يسبق إغلاق النوافذ، وقد يلغي نموذجٌ غير محفوظ الخروجَ بعده
// (will-prevent-unload، كخروج من قائمة «File ← Exit»). will-quit لا يأتي إلا
// بعد إغلاق كل النوافذ، فلا يبقى البرنامج مفتوحاً على خادم متوقف.
app.on("will-quit", () => {
  backupScheduler.stop();
  stopLocalApi();
});
