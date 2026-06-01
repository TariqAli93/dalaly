import { app, BrowserWindow, shell } from "electron";
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
const isPackaged = app.isPackaged;
const serverDir = isPackaged
  ? path.join(process.resourcesPath, "server")
  : path.join(rootDir, "server");
const rendererDist = isPackaged
  ? path.join(process.resourcesPath, "renderer", "dist", "index.html")
  : path.join(rootDir, "apps", "renderer", "dist", "index.html");
const apiUrl = `http://127.0.0.1:${process.env.API_PORT ?? "45678"}`;
const viteUrl = process.env.VITE_DEV_SERVER_URL;

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
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (viteUrl) {
    await mainWindow.loadURL(viteUrl);
  } else {
    const fallbackRenderer = path.join(
      rootDir,
      "apps",
      "renderer",
      "dist",
      "index.html",
    );
    await mainWindow.loadFile(
      fs.existsSync(rendererDist) ? rendererDist : fallbackRenderer,
    );
  }
}

function startLocalApi() {
  const isDev = Boolean(viteUrl);
  const command = isDev ? "pnpm" : process.execPath;
  const args = isDev ? ["dev"] : ["dist/index.js"];

  log.info("Starting local API", { serverDir, isDev });
  serverProcess = spawn(command, args, {
    cwd: serverDir,
    shell: process.platform === "win32",
    stdio: isDev ? "inherit" : ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: isDev ? undefined : "1",
      NODE_PATH: isPackaged
        ? path.join(process.resourcesPath, "node_modules")
        : undefined,
      API_HOST: process.env.API_HOST ?? "127.0.0.1",
      API_PORT: process.env.API_PORT ?? "45678",
    },
  });

  if (serverProcess.stdout) {
    serverProcess.stdout.on("data", (chunk) => log.info(String(chunk).trim()));
  }
  if (serverProcess.stderr) {
    serverProcess.stderr.on("data", (chunk) => log.error(String(chunk).trim()));
  }
  serverProcess.on("exit", () => {
    log.warn("Local API exited");
    serverProcess = null;
  });
}

async function waitForApi(timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${apiUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  log.error("Local API health check timed out");
}

function stopLocalApi() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
}

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
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", stopLocalApi);
