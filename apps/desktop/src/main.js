import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  safeStorage,
  shell,
  ipcMain,
} from "electron";
import log from "electron-log/main.js";
import { registerContractPdfExport } from "./contract-export.js";
import { safeExternalUrl, safeMapLinkUrl } from "./external-links.js";
import { fetchJson, pollApiHealth, withDeadline } from "./startup.js";
import nodemailer from "nodemailer";
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

const migrationsDir =
  process.env.DRIZZLE_MIGRATIONS_DIR ||
  (isDev
    ? path.join(rootDir, "server", "drizzle")
    : path.join(process.resourcesPath, "server", "drizzle"));

// مسار ملف الإعدادات المحلي الذي يخزّن DATABASE_URL بعد First Run Wizard.
const configPath = path.join(app.getPath("userData"), "config.json");
const appDataDir = app.getPath("userData");
// توكن داخلي لحماية نقاط الجدولة في الخادم.
const internalToken = crypto.randomUUID();

let serverProcess = null;
let mainWindow = null;
let splashWindow = null;
let mainReadyToShow = null;
let rendererReady = null;
let resolveRendererReady = null;
let startupState = "CHECKING";
let scheduleTimer = null;
let startupInFlight = false;

// تُغلق شاشة البدء فور جاهزية التطبيق، دون مدة ظهور مصطنعة.
const SLOW_AFTER_MS = 8000; // بعدها نُظهر حالة "يستغرق وقتاً أطول" دون فشل.

// مراحل الإقلاع مرتبطة بخطوات التشغيل الفعلية. مصدر واحد للرسائل والنسب.
// النسبة لا تصل 100% إلا بعد جاهزية النافذة الرئيسية فعلاً.
const SPLASH_STAGES = {
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
let lastSplashStage = SPLASH_STAGES.start;

function createApplicationMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: "ملف",
      submenu: [
        { label: "إعادة تحميل", role: "reload" },
        { type: "separator" },
        { label: "خروج", role: "quit" },
      ],
    },
    {
      label: "تحرير",
      submenu: [
        { label: "تراجع", role: "undo" },
        { label: "إعادة", role: "redo" },
        { type: "separator" },
        { label: "قص", role: "cut" },
        { label: "نسخ", role: "copy" },
        { label: "لصق", role: "paste" },
        { label: "تحديد الكل", role: "selectAll" },
      ],
    },
    {
      label: "عرض",
      submenu: [
        { label: "تكبير", role: "zoomIn" },
        { label: "تصغير", role: "zoomOut" },
        { label: "الحجم الافتراضي", role: "resetZoom" },
        { label: "ملء الشاشة", role: "togglefullscreen" },
        { label: "أدوات المطور", role: "toggleDevTools" },
      ],
    },
    {
      label: "مساعدة",
      submenu: [
        {
          label: "حول دلالي",
          click: () => {
            void dialog.showMessageBox(mainWindow ?? undefined, {
              type: "info",
              title: "حول دلالي",
              message: "دلالي",
              detail: "نظام إدارة العروض العقارية لمكتب الوساطة.",
              buttons: ["موافق"],
            });
          },
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
}

function readAppConfig() {
  try {
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    log.error("Failed to read app config", error);
    return {};
  }
}

function writeAppConfig(config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

function buildDatabaseUrl(input) {
  const host = input.host || "127.0.0.1";
  const port = input.port || "5432";
  const database = input.database || input.databaseName || "dalaly";
  const username = encodeURIComponent(
    input.username || input.adminUsername || "postgres",
  );
  const password = encodeURIComponent(
    input.password || input.adminPassword || "",
  );

  return `postgres://${username}:${password}@${host}:${port}/${database}`;
}

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
    if (url === current) return;
    event.preventDefault();
    const safe = safeExternalUrl(url);
    if (safe)
      void shell
        .openExternal(safe)
        .catch((error) => log.warn("Could not open external link", error));
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
    configPath,
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
      LIBREOFFICE_PATH: process.env.LIBREOFFICE_PATH || path.join(isDev ? rootDir : process.resourcesPath, "tools", "libreoffice", "program", "soffice.exe"),
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

// يفحص جاهزية الخادم المحلي عبر /api/health ويعيد كائن الصحة أو null عند
// الفشل. لا يغيّر تشغيل Fastify؛ مجرّد استطلاع لنقطة الصحة الحالية.
async function waitForApiHealth(timeoutMs = 25000) {
  return pollApiHealth(`${apiUrl}/api/health`, timeoutMs, () =>
    sendSplashProgress(SPLASH_STAGES.database),
  );
}

function trustedMainSender(event) {
  return (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame
  );
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

// يحفظ DATABASE_URL الناتج عن /api/setup/initialize ليُستخدم في التشغيل القادم.
// الخادم الحالي يكون قد أعاد تهيئة الـ pool حيّاً، لذا لا حاجة لإعادة تشغيله الآن.
ipcMain.handle("maps:open-external", async (event, value) => {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  )
    return { ok: false };
  const url = safeMapLinkUrl(value);
  if (!url) return { ok: false };
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch {
    return { ok: false };
  }
});


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

// يبني DATABASE_URL من المكوّنات ويحفظه (مسار بديل عند الحاجة).
ipcMain.handle("config:save-database", async (_event, input) => {
  const databaseUrl = buildDatabaseUrl(input ?? {});
  const existing = readAppConfig();

  writeAppConfig({
    ...existing,
    databaseUrl,
    database: {
      host: input?.host,
      port: input?.port,
      database: input?.database ?? input?.databaseName,
      username: input?.username ?? input?.adminUsername,
    },
  });

  return { ok: true };
});

registerContractPdfExport(() => mainWindow);

ipcMain.handle("export:save-file", async (_event, input) => {
  const data = input?.data;
  const suggestedName =
    typeof input?.suggestedName === "string" && input.suggestedName
      ? input.suggestedName
      : "تصدير_دلالي.xlsx";
  if (!(data instanceof Uint8Array)) {
    return { ok: false, message: "محتوى الملف غير صالح." };
  }

  const saveResult = await dialog.showSaveDialog(mainWindow ?? undefined, {
    title: input?.title || "حفظ التصدير",
    defaultPath: suggestedName,
    filters:
      Array.isArray(input?.filters) && input.filters.length
        ? input.filters
        : [{ name: "مصنف إكسل", extensions: ["xlsx"] }],
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, canceled: true };
  }

  try {
    fs.writeFileSync(saveResult.filePath, Buffer.from(data));
    return { ok: true, path: saveResult.filePath };
  } catch (error) {
    log.error("File export failed", error);
    return { ok: false, message: "تعذر حفظ ملف التصدير." };
  }
});

function safeExportName(value, fallback) {
  const sanitized = String(value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized || fallback;
}

ipcMain.handle("export:save-folder", async (_event, input) => {
  const files = Array.isArray(input?.files) ? input.files : [];
  if (!files.length) {
    return { ok: false, message: "لا توجد ملفات لتصديرها." };
  }

  const folderResult = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: input?.title || "اختيار مجلد التصدير",
    properties: ["openDirectory", "createDirectory"],
  });
  if (folderResult.canceled || !folderResult.filePaths[0]) {
    return { ok: false, canceled: true };
  }

  const folderName = safeExportName(input?.suggestedFolderName, "تصدير_دلالي");
  const targetFolder = path.join(folderResult.filePaths[0], folderName);

  try {
    fs.mkdirSync(targetFolder, { recursive: true });
    for (const file of files) {
      if (!(file?.data instanceof Uint8Array)) {
        return { ok: false, message: "محتوى إحدى الصور غير صالح." };
      }
      const fileName = safeExportName(
        path.basename(String(file.name ?? "")),
        "file.bin",
      );
      fs.writeFileSync(
        path.join(targetFolder, fileName),
        Buffer.from(file.data),
      );
    }
    return { ok: true, path: targetFolder };
  } catch (error) {
    log.error("Folder export failed", error);
    return { ok: false, message: "تعذر إنشاء مجلد التصدير." };
  }
});

ipcMain.handle("config:get-database-status", async () => {
  const config = readAppConfig();

  return {
    configured: Boolean(config.databaseUrl),
    database: config.database ?? null,
  };
});

// ===== النسخ الاحتياطي المجدول بالبريد =====

function encryptSecret(plain) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plain).toString("base64");
    }
  } catch (error) {
    log.error("safeStorage encrypt failed", error);
  }
  return null;
}

function decryptSecret(encBase64) {
  try {
    if (encBase64 && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encBase64, "base64"));
    }
  } catch (error) {
    log.error("safeStorage decrypt failed", error);
  }
  return "";
}

ipcMain.handle("backup:choose-export-path", async () => {
  const now = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
    title: "حفظ النسخة الاحتياطية",
    defaultPath: `نسخة_دلالي_الاحتياطية_${now}.zip`,
    filters: [{ name: "أرشيف مضغوط", extensions: ["zip"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("backup:pick-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "اختر ملف النسخة الاحتياطية",
    filters: [{ name: "نسخة احتياطية", extensions: ["zip"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return { path: result.filePaths[0] };
});

ipcMain.handle("backup:pick-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "اختر مجلد النسخ الاحتياطية",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return { path: result.filePaths[0] };
});

ipcMain.handle("backup:save-schedule", async (_event, incoming) => {
  const config = readAppConfig();
  const previous = config.scheduledBackup ?? {};
  const next = {
    enabled: Boolean(incoming?.enabled),
    recipient: incoming?.recipient ?? "",
    smtpHost: incoming?.smtpHost ?? "",
    smtpPort: incoming?.port ?? incoming?.smtpPort ?? 587,
    smtpUser: incoming?.smtpUser ?? "",
    frequency: incoming?.frequency === "weekly" ? "weekly" : "daily",
    time: incoming?.time ?? "02:00",
    passwordEnc: previous.passwordEnc ?? null,
    lastRunAt: previous.lastRunAt ?? null,
    lastError: previous.lastError ?? null,
  };
  // تشفير كلمة المرور فقط عند تقديم قيمة جديدة (وإلا الإبقاء على المخزَّنة).
  if (incoming?.password) {
    next.passwordEnc = encryptSecret(String(incoming.password));
  }
  writeAppConfig({ ...config, scheduledBackup: next });
  return { ok: true };
});

ipcMain.handle("backup:get-schedule", async () => {
  const config = readAppConfig();
  const s = config.scheduledBackup;
  if (!s) return null;
  return {
    enabled: Boolean(s.enabled),
    recipient: s.recipient ?? "",
    smtpHost: s.smtpHost ?? "",
    smtpPort: s.smtpPort ?? 587,
    smtpUser: s.smtpUser ?? "",
    hasPassword: Boolean(s.passwordEnc),
    frequency: s.frequency ?? "daily",
    time: s.time ?? "02:00",
    lastRunAt: s.lastRunAt ?? null,
    lastError: s.lastError ?? null,
  };
});

function isScheduleDue(schedule) {
  if (!schedule?.enabled) return false;
  const [hh, mm] = String(schedule.time ?? "02:00")
    .split(":")
    .map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hh || 0, mm || 0, 0, 0);
  if (now < target) return false; // لم يحن الوقت اليوم بعد

  if (!schedule.lastRunAt) return true;
  const last = new Date(schedule.lastRunAt);
  if (schedule.frequency === "weekly") {
    return now.getTime() - last.getTime() >= 7 * 24 * 60 * 60 * 1000;
  }
  // يومي: لم يُنفَّذ منذ موعد اليوم.
  return last < target;
}

async function runScheduledBackup() {
  const config = readAppConfig();
  const schedule = config.scheduledBackup;
  if (!isScheduleDue(schedule)) return;

  log.info("Running scheduled email backup");
  let lastError = null;
  try {
    // 1) إنشاء النسخة عبر الخادم.
    const response = await fetch(`${apiUrl}/api/backup/internal-run`, {
      method: "POST",
      headers: { "x-internal-token": internalToken },
    });
    const result = await response.json();
    if (!response.ok || !result?.ok) {
      throw new Error(result?.message || "تعذر إنشاء النسخة.");
    }

    // 2) إرسال البريد مع المرفق.
    const password = decryptSecret(schedule.passwordEnc);
    const port = Number(schedule.smtpPort) || 587;
    const transporter = nodemailer.createTransport({
      host: schedule.smtpHost,
      port,
      secure: port === 465,
      auth: schedule.smtpUser
        ? { user: schedule.smtpUser, pass: password }
        : undefined,
    });
    await transporter.sendMail({
      from: schedule.smtpUser || schedule.recipient,
      to: schedule.recipient,
      subject: `نسخة دلالي الاحتياطية - ${new Date().toLocaleDateString("ar-IQ")}`,
      text: "مرفق النسخة الاحتياطية لقاعدة بيانات دلالي.",
      attachments: [{ path: result.file_path }],
    });
    log.info("Scheduled backup emailed successfully");
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    log.error("Scheduled backup failed", lastError);
  }

  // 3) تسجيل النتيجة (لا ينهار التطبيق عند الفشل، بما في ذلك انقطاع الإنترنت).
  const latest = readAppConfig();
  if (latest.scheduledBackup) {
    latest.scheduledBackup.lastRunAt = new Date().toISOString();
    latest.scheduledBackup.lastError = lastError;
    writeAppConfig(latest);
  }
}

function startScheduler() {
  if (scheduleTimer) return;
  scheduleTimer = setInterval(() => {
    void runScheduledBackup();
  }, 60 * 1000);
}

function stopScheduler() {
  if (scheduleTimer) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  }
}

// ===== شاشة البدء (Splash) =====

function createSplashWindow() {
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
    : splashWindow.loadFile(
        path.join(path.dirname(rendererIndex), "splash.html"),
      );
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

function sendSplashProgress(stage) {
  lastSplashStage = {
    ...lastSplashStage,
    ...stage,
    isError: Boolean(stage.isError),
  };
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.send("splash:progress", lastSplashStage);
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

ipcMain.handle("splash:get-version", () => app.getVersion());
ipcMain.handle("splash:get-progress", () => lastSplashStage);
// أزرار شاشة الخطأ.
ipcMain.handle("splash:retry", () => {
  void runStartup();
});
ipcMain.handle("splash:open-logs", async () => {
  try {
    await shell.openPath(app.getPath("logs"));
  } catch (error) {
    log.error("Failed to open logs folder", error);
  }
});
ipcMain.handle("splash:quit", () => app.quit());

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

  // إعادة الشاشة إلى وضع التحميل (يُخفي شاشة الخطأ إن كانت ظاهرة).
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.setOpacity(1);
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
    startScheduler();
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

app.whenReady().then(() => {
  if (process.platform === "win32")
    app.setAppUserModelId(
      isPackaged ? "codel.dalaly.desktop" : process.execPath,
    );
  // createApplicationMenu();
  createSplashWindow();
  void runStartup();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashWindow();
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
  stopScheduler();
  stopLocalApi();
  closeSplashWindow();
});
