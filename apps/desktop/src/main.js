import { app, BrowserWindow, shell, ipcMain } from "electron";
import log from "electron-log/main.js";
import { spawn } from "node:child_process";
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

let serverProcess = null;
let mainWindow = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: "دلالي",
    backgroundColor: "#f6f7f5",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
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

  const configPath = path.join(app.getPath("userData"), "config.json");

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

  function buildDatabaseUrl(config) {
    const host = config.host || "127.0.0.1";
    const port = config.port || "5432";
    const database = config.database || "dalaly";
    const username = encodeURIComponent(config.username || "postgres");
    const password = encodeURIComponent(config.password || "");

    return `postgres://${username}:${password}@${host}:${port}/${database}`;
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
    shell: process.platform === "win32",
    stdio: isDev ? "inherit" : ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DRIZZLE_MIGRATIONS_DIR: isPackaged
        ? path.join(process.resourcesPath, "server", "drizzle")
        : path.join(rootDir, "server", "drizzle"),
      ELECTRON_RUN_AS_NODE: isDev ? undefined : "1",
      API_HOST: apiHost,
      API_PORT: apiPort,
      DRIZZLE_MIGRATIONS_DIR: migrationsDir,
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

async function waitForApi(timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${apiUrl}/api/health`);
      if (response.ok) {
        const health = await response.json().catch(() => null);
        log.info("Local API health check passed", health);
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  log.error("Local API health check timed out", { apiUrl });
}

function stopLocalApi() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
}

ipcMain.handle("config:save-database", async (_event, config) => {
  const databaseUrl = buildDatabaseUrl(config);

  writeAppConfig({
    databaseUrl,
    database: {
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
    },
  });

  return { ok: true };
});

ipcMain.handle("config:get-database-status", async () => {
  const config = readAppConfig();

  return {
    configured: Boolean(config.databaseUrl),
    database: config.database ?? null,
  };
});

app.whenReady().then(async () => {
  startLocalApi();
  await waitForApi();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
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

app.on("before-quit", stopLocalApi);
