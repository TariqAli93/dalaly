import {
  app,
  BrowserWindow,
  dialog,
  safeStorage,
  shell,
  ipcMain,
} from "electron";
import log from "electron-log/main.js";
import nodemailer from "nodemailer";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

log.initialize();
log.transports.file.level = "info";
log.transports.console.level = "info";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..", "..");

const isDev = !app.isPackaged;
const isPackaged = app.isPackaged;
const apiPort = process.env.API_PORT ?? "45678";
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

const migrationsDir = isDev
  ? path.join(rootDir, "server", "drizzle")
  : path.join(process.resourcesPath, "server", "drizzle");

// مسار ملف الإعدادات المحلي الذي يخزّن DATABASE_URL بعد First Run Wizard.
const configPath = path.join(app.getPath("userData"), "config.json");
const appDataDir = app.getPath("userData");
// توكن داخلي لحماية نقاط الجدولة في الخادم.
const internalToken = crypto.randomUUID();

let serverProcess = null;
let mainWindow = null;
let splashWindow = null;
let mainReadyToShow = null;
let scheduleTimer = null;
let startupInFlight = false;

// توقيتات شاشة البدء.
const MIN_SPLASH_MS = 1800; // أدنى مدة ظهور حتى لو جهُز التطبيق فوراً.
const SLOW_AFTER_MS = 8000; // بعدها نُظهر حالة "يستغرق وقتاً أطول" دون فشل.
const READY_HOLD_MS = 200; // تثبيت 100% قبل الاختفاء.
const FADE_MS = 250; // مدة تلاشي السبلاش.

// مراحل الإقلاع مرتبطة بخطوات التشغيل الفعلية. مصدر واحد للرسائل والنسب.
// النسبة لا تصل 100% إلا بعد جاهزية النافذة الرئيسية فعلاً.
const SPLASH_STAGES = {
  start: { progress: 6, message: "جارِ تهيئة التطبيق…" },
  backend: { progress: 40, message: "جارِ تشغيل الخادم المحلي…" },
  database: { progress: 66, message: "جارِ تشغيل قاعدة البيانات…" },
  ui: { progress: 86, message: "جارِ تحميل الواجهة…" },
  ready: { progress: 100, message: "التطبيق جاهز" },
  // slow/error لا يحملان progress كي لا يتحرّك الشريط للخلف أو للأمام.
  slow: { message: "يستغرق التشغيل وقتاً أطول من المعتاد… يرجى الانتظار" },
  error: {
    message: "تعذّر بدء التطبيق. تحقّق من الخادم المحلي وقاعدة البيانات.",
    isError: true,
  },
};

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

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: "دلالي",
    backgroundColor: "#f6f7f5",
    autoHideMenuBar: true,
    // تبقى مخفية حتى تكتمل شاشة البدء، لمنع الوميض والظهور خلف الـ Splash.
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // وعد جاهزية العرض لاستخدامه في تسلسل الإقلاع.
  mainReadyToShow = new Promise((resolve) => {
    mainWindow.once("ready-to-show", resolve);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (viteUrl) {
    await mainWindow.loadURL(viteUrl);
    return;
  }

  if (!fs.existsSync(rendererIndex)) {
    log.error("Renderer index.html not found", { rendererIndex });
    throw new Error(`Renderer not found: ${rendererIndex}`);
  }

  await mainWindow.loadFile(rendererIndex);
}

function startLocalApi() {
  if (serverProcess) return;

  const command = isDev ? "pnpm" : process.execPath;
  const args = isDev ? ["tsx", "watch", "src/index.ts"] : [serverEntry];

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
    // shell:false في الإنتاج لتجنّب مشاكل المسارات التي تحتوي فراغات (مثل
    // C:\Users\Futer House\...). shell مطلوب فقط في التطوير لتشغيل pnpm.cmd.
    shell: isDev && process.platform === "win32",
    windowsHide: true,
    stdio: isDev ? "inherit" : ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ELECTRON_RUN_AS_NODE: isDev ? undefined : "1",
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
}

// يفحص جاهزية الخادم المحلي عبر /api/health ويعيد كائن الصحة أو null عند
// الفشل. لا يغيّر تشغيل Fastify؛ مجرّد استطلاع لنقطة الصحة الحالية.
async function waitForApiHealth(timeoutMs = 25000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${apiUrl}/api/health`);
      if (response.ok) {
        const health = await response.json().catch(() => null);
        log.info("Local API health check passed", health);
        return health ?? { ok: true };
      }
    } catch {
      // الخادم لم يجهز بعد؛ نُعيد المحاولة.
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  log.error("Local API health check timed out", { apiUrl });
  return null;
}

function stopLocalApi() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
}

// يحفظ DATABASE_URL الناتج عن /api/setup/initialize ليُستخدم في التشغيل القادم.
// الخادم الحالي يكون قد أعاد تهيئة الـ pool حيّاً، لذا لا حاجة لإعادة تشغيله الآن.
ipcMain.handle("config:save-database-url", async (_event, databaseUrl) => {
  if (typeof databaseUrl !== "string" || !databaseUrl) {
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

// تصدير PDF فعلي من HTML عبر نافذة مخفية + حوار حفظ.
ipcMain.handle("export:save-pdf", async (_event, input) => {
  const html = input?.html;
  const suggestedName = input?.suggestedName || "export.pdf";
  if (typeof html !== "string" || !html) {
    return { ok: false, message: "محتوى غير صالح." };
  }

  const saveResult = await dialog.showSaveDialog(mainWindow ?? undefined, {
    title: "حفظ ملف PDF",
    defaultPath: suggestedName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, canceled: true };
  }

  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  });

  try {
    await pdfWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    const data = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
    });
    fs.writeFileSync(saveResult.filePath, data);
    return { ok: true, path: saveResult.filePath };
  } catch (error) {
    log.error("PDF export failed", error);
    return { ok: false, message: "تعذر إنشاء PDF." };
  } finally {
    pdfWindow.destroy();
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
    defaultPath: `Dalaly_Backup_${now}.zip`,
    filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("backup:pick-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "اختر ملف النسخة الاحتياطية",
    filters: [{ name: "Backup", extensions: ["zip"] }],
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
    width: 1050,
    height: 590,
    frame: false,
    resizable: false,
    movable: false,
    center: true,
    show: false,
    // خلفية بترولية لمنع الوميض الأبيض قبل ظهور المحتوى.
    backgroundColor: "#0f4d4f",
    skipTaskbar: true,
    alwaysOnTop: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    title: "دلالي",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "splash-preload.js"),
    },
  });

  splashWindow.once("ready-to-show", () => splashWindow?.show());
  splashWindow.on("closed", () => {
    splashWindow = null;
  });

  void splashWindow.loadFile(path.join(__dirname, "splash", "splash.html"));
  return splashWindow;
}

function sendSplashProgress(stage) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.send("splash:progress", stage);
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

ipcMain.handle("splash:get-version", () => app.getVersion());
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

// تلاشٍ ناعم لنافذة السبلاش عبر الشفافية، ثم تُغلق لاحقاً.
async function fadeOutSplash(durationMs) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const steps = 12;
  const interval = Math.max(10, Math.round(durationMs / steps));
  for (let i = 1; i <= steps; i += 1) {
    if (!splashWindow || splashWindow.isDestroyed()) return;
    splashWindow.setOpacity(Math.max(0, 1 - i / steps));
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// الجاهزية الفعلية: خادم محلي يعمل، /api/health ناجح، وقاعدة بيانات سليمة
// إن كانت مهيأة، ثم تحميل نافذة التطبيق. يرمي خطأً عند الفشل الفادح.
async function waitForApplicationReady() {
  startLocalApi();
  sendSplashProgress(SPLASH_STAGES.backend);

  const health = await waitForApiHealth();
  if (!health || health.ok !== true) {
    throw new Error("STARTUP_BACKEND");
  }

  // قاعدة بيانات مهيّأة مسبقاً لكنها غير متصلة/فشلت هجرتها = خطأ فادح.
  // أول تشغيل (بلا databaseUrl) حالة صحيحة تُكمل إلى معالج الإعداد.
  const config = readAppConfig();
  if (
    config.databaseUrl &&
    (health.db_connected === false || health.migrations_ok === false)
  ) {
    throw new Error("STARTUP_DATABASE");
  }
  sendSplashProgress(SPLASH_STAGES.database);

  await createWindow(); // النافذة الرئيسية مخفية والمحتوى يُحمَّل.
  sendSplashProgress(SPLASH_STAGES.ui);

  // ننتظر جاهزية عرض النافذة فعلاً (مع حدّ أقصى للأمان كي لا تعلق).
  await Promise.race([
    mainReadyToShow ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 6000)),
  ]);
}

// تسلسل الإقلاع القابل لإعادة التشغيل (زر إعادة المحاولة).
async function runStartup() {
  if (startupInFlight) return;
  startupInFlight = true;

  // إعادة الشاشة إلى وضع التحميل (يُخفي شاشة الخطأ إن كانت ظاهرة).
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.setOpacity(1);
  sendSplashProgress(SPLASH_STAGES.start);

  const reachedMinimum = new Promise((resolve) =>
    setTimeout(resolve, MIN_SPLASH_MS),
  );
  const slowTimer = setTimeout(
    () => sendSplashProgress(SPLASH_STAGES.slow),
    SLOW_AFTER_MS,
  );

  try {
    // لا تُغلق السبلاش إلا عند تحقق الشرطين معاً: الجاهزية + الحد الأدنى.
    await Promise.all([waitForApplicationReady(), reachedMinimum]);
    clearTimeout(slowTimer);

    sendSplashProgress(SPLASH_STAGES.ready); // 100% فقط بعد الجاهزية.
    await new Promise((resolve) => setTimeout(resolve, READY_HOLD_MS));
    await fadeOutSplash(FADE_MS);

    // نُظهر الرئيسية بعد انتهاء التلاشي لتفادي ظهور النافذتين معاً.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    closeSplashWindow();
    startScheduler();
  } catch (error) {
    clearTimeout(slowTimer);
    // فشل فادح: نُبقي السبلاش ونحوّلها إلى شاشة خطأ (لا نُغلقها).
    log.error("Startup sequence failed", error);
    sendSplashProgress(SPLASH_STAGES.error);
  } finally {
    startupInFlight = false;
  }
}

app.whenReady().then(() => {
  createSplashWindow();
  void runStartup();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
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
