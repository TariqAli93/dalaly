/* global window -- page.waitForFunction callbacks run in the renderer */
// Launches the real Dalaly Electron app against the tutorial environment, the
// way server/scripts/startup-electron.mjs does: an isolated --user-data-dir
// whose config.json names the tutorial database, a dedicated API port, and the
// renderer's fixed 127.0.0.1:34567 API calls rerouted to that port.
import path from "node:path";
import { _electron, expect } from "@playwright/test";
import { isolatedServerEnv, killStaleProcesses } from "./env.mjs";
import { DESKTOP_DIR, requireDesktop } from "./util.mjs";

const electronExecutable = requireDesktop("electron");

export async function launchApp(environment, { log }) {
  const { config, profileDir, apiPort } = environment;
  const env = isolatedServerEnv(environment, {
    API_HOST: "127.0.0.1",
    API_PORT: String(apiPort),
    // Empty: load the built renderer from apps/renderer/dist, not a Vite server.
    VITE_DEV_SERVER_URL: "",
    CORS_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173",
  });
  const electron = await _electron.launch({
    executablePath: electronExecutable,
    args: [
      path.join(DESKTOP_DIR, "src", "main.js"),
      `--user-data-dir=${profileDir}`,
      // Keep painting while another window covers this one, so the screencast never stalls.
      "--disable-features=CalculateNativeWinOcclusion",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--force-color-profile=srgb",
    ],
    env,
    timeout: 60_000,
  });
  const output = [];
  const keep = (chunk) => {
    output.push(String(chunk));
    if (output.length > 400) output.shift();
  };
  electron.process().stdout?.on("data", keep);
  electron.process().stderr?.on("data", keep);

  const rerouted = { count: 0 };
  const defaultApi = `127.0.0.1:${config.api.rendererDefaultPort}`;
  await electron.context().route(`http://${defaultApi}/**`, async (route) => {
    rerouted.count += 1;
    await route.continue({ url: route.request().url().replace(defaultApi, `127.0.0.1:${apiPort}`) });
  });

  await expect.poll(() => electron.windows().find((page) => page.url().includes("/index.html")), { timeout: 90_000 }).toBeTruthy();
  const page = electron.windows().find((candidate) => candidate.url().includes("/index.html"));
  await page.waitForLoadState("load");
  await expect.poll(() => electron.windows().some((candidate) => candidate.url().includes("splash.html")), { timeout: 30_000 }).toBe(false);

  const health = await (await fetch(`http://127.0.0.1:${apiPort}/api/health`)).json();
  if (health.startup_state !== "READY") throw new Error(`Tutorial API is ${health.startup_state} (${health.startup_reason ?? "no reason"})`);
  log.info("app.launched", { message: `API 127.0.0.1:${apiPort} READY`, health: { state: health.startup_state } });

  const capture = await fitWindow(electron, page, config.video, environment.captureMethod);
  return { electron, page, rerouted, output, capture };
}

// Extra client rows below the picture: they hide Windows 11's rounded window
// corners and carry the recorder's frame counter; the editor crops them off.
const CORNER_PAD = 8;

/**
 * Makes the app window a native 1920×1080 surface and lays the app out at the
 * readable viewport (1280×720 CSS px) with Electron's page zoom — the same as
 * Ctrl + — so Chromium rasterises text at full output resolution.
 *
 * "window" capture: the client area is sized to 1920×(1080 + pad) physical
 * pixels on the window's display (zoom = 1.5 at 100 % scaling, 1.0 at 150 %),
 * and the recorder grabs that surface. Returns { method, hwnd, contentWidth,
 * contentHeight, scale }. When the display cannot hold such a window it falls
 * back to "screencast": the view is emulated at the output size (DevTools
 * screencast frames never exceed the view's DIP size).
 */
export async function fitWindow(electron, page, video, method = "window") {
  const placed = await electron.evaluate(({ BrowserWindow, screen }, wanted) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("index.html"));
    if (!window) return null;
    const display = screen.getDisplayMatching(window.getBounds());
    const scale = display.scaleFactor;
    const dip = { width: Math.round(wanted.width / scale), height: Math.round((wanted.height + wanted.pad) / scale) };
    const fits = dip.width <= display.workArea.width && dip.height + 40 <= display.workArea.height;
    return { scale, dip, fits, workArea: display.workArea };
  }, { width: video.width, height: video.height, pad: CORNER_PAD });
  const windowCapture = method === "window" && placed?.fits;
  const size = windowCapture ? { ...placed.dip, zoom: placed.dip.width / video.viewport.width } : { width: video.width, height: video.height, zoom: video.width / video.viewport.width };
  const native = await electron.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("index.html"));
    if (!window) return null;
    if (window.isMaximized()) window.unmaximize();
    if (window.isMinimized()) window.restore();
    window.setContentSize(size.width, size.height);
    window.center();
    window.show();
    // A minimized window paints nothing, so nothing can be recorded: while the
    // studio runs, the window comes straight back (and keeps its size).
    if (!window.__tutorialKeepShown) {
      window.__tutorialKeepShown = true;
      window.on("minimize", () => setTimeout(() => window.restore(), 150));
      window.on("maximize", () => setTimeout(() => window.unmaximize(), 150));
    }
    const contents = window.webContents;
    contents.setBackgroundThrottling(false);
    contents.setZoomFactor(size.zoom);
    // Chromium keys zoom by URL for file:// pages, so every hash route would
    // fall back to 100 %. Pin it again whenever the in-page URL changes.
    if (!contents.__tutorialZoomPinned) {
      contents.__tutorialZoomPinned = true;
      const pin = () => {
        if (Math.abs(contents.getZoomFactor() - contents.__tutorialZoom) > 0.001) contents.setZoomFactor(contents.__tutorialZoom);
      };
      contents.on("did-navigate-in-page", pin);
      contents.on("did-navigate", pin);
      contents.on("zoom-changed", () => setTimeout(pin, 0));
    }
    contents.__tutorialZoom = size.zoom;
    const [contentWidth, contentHeight] = window.getContentSize();
    const handle = window.getNativeWindowHandle();
    return { contentWidth, contentHeight, hwnd: (handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0))).toString() };
  }, size);
  if (!native) throw new Error("The Dalaly window was not found");
  const viewportHeight = windowCapture ? Math.floor(size.height / size.zoom) : video.viewport.height;
  if (!windowCapture) {
    const session = page.__tutorialCdp ?? (await page.context().newCDPSession(page));
    await session.send("Emulation.setDeviceMetricsOverride", { width: video.width, height: video.height, deviceScaleFactor: 1, mobile: false });
    page.__tutorialCdp = session;
  }
  await page.waitForFunction(({ width, height }) => Math.abs(window.innerWidth - width) <= 1 && Math.abs(window.innerHeight - height) <= 1, { width: video.viewport.width, height: viewportHeight }, { timeout: 10_000 });
  page.__tutorialZoom = size.zoom;
  if (!windowCapture) return { method: "screencast", reason: method === "window" ? `the display work area ${placed?.workArea?.width}×${placed?.workArea?.height} cannot hold a ${video.width}×${video.height} window` : "configured" };
  return {
    method: "window",
    hwnd: native.hwnd,
    scale: placed.scale,
    pad: CORNER_PAD,
    // Physical pixels of the client area; the recorder keeps the top video.height rows.
    contentWidth: Math.round(native.contentWidth * placed.scale),
    contentHeight: Math.round(native.contentHeight * placed.scale),
  };
}

/**
 * Native file dialogs cannot be driven by automation and would block the run.
 * In the tutorial app a save dialog answers with the suggested file name in
 * the studio's own exports folder, as if the presenter had chosen it, so an
 * export really runs and its file can be checked; open dialogs are cancelled.
 * Only this Electron process (isolated profile and database) is affected.
 */
export async function answerFileDialogs(electron, exportsDir) {
  await electron.evaluate(({ dialog }, dir) => {
    const pick = (first, second) => {
      const options = second ?? first ?? {};
      const name = String(options.defaultPath ?? "export").split(/[\\/]/).pop().replace(/[<>:"/\\|?*]/g, "-") || "export";
      return `${dir}\\${name}`;
    };
    dialog.showSaveDialog = async (first, second) => ({ canceled: false, filePath: pick(first, second) });
    dialog.showSaveDialogSync = (first, second) => pick(first, second);
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    dialog.showOpenDialogSync = () => undefined;
  }, exportsDir);
}

/** Re-applies the zoom if anything reset it; returns false when the layout had drifted. */
export async function keepLayout(app, video) {
  const zoom = app.page.__tutorialZoom ?? video.width / video.viewport.width;
  const current = await app.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("index.html"))?.webContents.getZoomFactor() ?? 0);
  const width = await app.page.evaluate(() => window.innerWidth);
  if (Math.abs(current - zoom) < 0.001 && Math.abs(width - video.viewport.width) <= 1) return true;
  await app.electron.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("index.html"))?.webContents.setZoomFactor(factor), zoom);
  await app.page.waitForFunction((size) => Math.abs(window.innerWidth - size.width) <= 1, video.viewport, { timeout: 10_000 });
  return false;
}

export async function login(page, account, { typeDelay = 0 } = {}) {
  await page.waitForURL(/#\/(login|$|\?)/, { timeout: 30_000 });
  // A reused profile may still hold a session; the app then opens the dashboard.
  if (!/#\/login/.test(page.url())) return;
  const username = page.getByLabel("اسم المستخدم", { exact: true });
  const pin = page.getByLabel("الرمز السري", { exact: true });
  await username.fill("");
  if (typeDelay) await username.pressSequentially(account.username, { delay: typeDelay });
  else await username.fill(account.username);
  if (typeDelay) await pin.pressSequentially(account.pin, { delay: typeDelay });
  else await pin.fill(account.pin);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL(/#\/(\?.*)?$/, { timeout: 30_000 });
}

export async function closeApp(app, environment, log) {
  if (!app?.electron) return;
  await Promise.race([app.electron.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 15_000))]);
  await killStaleProcesses(environment.profileDir, log);
}
