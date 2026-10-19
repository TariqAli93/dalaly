import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { _electron, type Page } from "@playwright/test";
import { removalTestContext } from "./removal-test-context.js";
import { verifyRemovalNavigation } from "./removal-browser.js";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const executable = path.join(repository, "apps/desktop/release/removal-check/win-unpacked/دلالي.exe");
await fs.access(executable);
const context = await removalTestContext("package");
let electron: Awaited<ReturnType<typeof _electron.launch>> | undefined;
let page: Page | undefined;
try {
  assert.equal(new URL(context.url).pathname, `/${context.name}`, "Packaged test must use its isolated database");
  assert.match(context.name, /^dalaly_removal_test_\d+_package$/);
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const profile = path.join(context.root, "electron-profile");
  const launchEnv = Object.fromEntries(Object.entries(process.env).filter(([key, value]) =>
    key !== "ELECTRON_RUN_AS_NODE" && typeof value === "string",
  )) as Record<string, string>;
  electron = await _electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${profile}`],
    env: {
      ...launchEnv,
      DATABASE_URL: context.url,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      VITE_DEV_SERVER_URL: "",
      WEB_DEMO_MODE: "false",
      DOCUMENTS_DIR: path.join(profile, "documents"),
    },
    timeout: 30000,
  });
  await electron.evaluate("globalThis.__name = (fn) => fn;");
  assert.equal(await electron.evaluate(({ app }) => app.isPackaged), true);
  assert.equal(path.resolve(await electron.evaluate(({ app }) => app.getPath("userData"))), profile);
  const browserContext = electron.context();
  // The compiled renderer's default API port is routed to this launch's own
  // bundled API, which uses only the isolated database and isolated profile.
  await browserContext.route("http://127.0.0.1:34567/api/**", (route) => route.continue({
    url: route.request().url().replace("127.0.0.1:34567", `127.0.0.1:${port}`),
  }));
  await browserContext.addInitScript("window.__name = (fn) => fn;");
  await browserContext.addInitScript(() => { localStorage.removeItem("dalaly.session"); });
  for (let attempt = 0; attempt < 150; attempt++) {
    page = electron.windows().find((window) => /\/index\.html(?:[?#]|$)/.test(window.url()));
    if (page) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(page, "Packaged main window did not load");
  assert.match(page.url(), /^file:/);
  await page.waitForLoadState("load");
  await page.reload();
  await page.waitForFunction(() => !!window.dalalyConfig?.getStartupHealth);
  const bridge = await page.evaluate(() => ({
    nodeRequire: typeof (window as unknown as Record<string, unknown>).require,
    printPdf: typeof (window.dalalyConfig as unknown as Record<string, unknown>).printPdf,
    printDocument: typeof (window.dalalyConfig as unknown as Record<string, unknown>).printDocument,
    exportPdf: typeof window.dalalyConfig?.exportPdf,
    exportFolder: typeof window.dalalyConfig?.exportFolder,
  }));
  assert.deepEqual(bridge, { nodeRequire: "undefined", printPdf: "undefined", printDocument: "undefined", exportPdf: "function", exportFolder: "function" });
  const health = await page.evaluate(() => window.dalalyConfig!.getStartupHealth!());
  assert.equal(health.startup_state, "READY");
  const base = page.url().split("#")[0];
  const result = await verifyRemovalNavigation(page, base, context, { uploadDocument: false });
  const sharedPdfPath = path.join(context.root, "shared-property-export.pdf");
  assert.ok(path.resolve(sharedPdfPath).startsWith(path.resolve(context.root) + path.sep));
  await electron.evaluate(({ dialog }, output) => {
    (globalThis as any).__removalSaveDialog = dialog.showSaveDialog;
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
  }, sharedPdfPath);
  let sharedPdf: { ok: boolean; path?: string };
  try {
    sharedPdf = await page.evaluate(async (property) => window.dalalyConfig!.exportPdf!({
      html: `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><body><h1>${property.name}</h1><p>تقرير عرض عقاري مستقل</p><p>150,000,000 دينار عراقي</p></body></html>`,
      suggestedName: "shared-property-export.pdf",
    }), { name: context.property.name });
  } finally {
    await electron.evaluate(({ dialog }) => {
      dialog.showSaveDialog = (globalThis as any).__removalSaveDialog;
      delete (globalThis as any).__removalSaveDialog;
    });
  }
  assert.equal(sharedPdf!.ok, true);
  assert.equal(sharedPdf!.path, sharedPdfPath);
  const pdfBytes = await fs.readFile(sharedPdfPath);
  assert.equal(pdfBytes.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdfBytes.length > 1000);
  result.passed.push("Shared native exportPdf still writes a real property PDF through its existing IPC");
  const mainSecurity = await electron.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((window) => /\/index\.html(?:[?#]|$)/.test(window.webContents.getURL()));
    const preferences = main?.webContents.getLastWebPreferences();
    return { contextIsolation: preferences?.contextIsolation, nodeIntegration: preferences?.nodeIntegration, sandbox: preferences?.sandbox };
  });
  assert.deepEqual(mainSecurity, { contextIsolation: true, nodeIntegration: false, sandbox: true });
  await page.screenshot({ path: path.join(context.root, "removal-package-people.png"), fullPage: true });
  await fs.writeFile(path.join(context.root, "removal-package-result.json"), JSON.stringify({
    ...result,
    packaged: true,
    startup: health.startup_state,
    preload_bridge: bridge,
    web_preferences: mainSecurity,
    shared_pdf_bytes: pdfBytes.length,
    artifact_directory: context.root,
  }, null, 2));
  console.log(JSON.stringify({ status: "PASS", checks: result.passed, packaged: true, artifacts: context.root }, null, 2));
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(context.root, "removal-package-failure.png"), fullPage: true }).catch(() => undefined);
    await fs.writeFile(path.join(context.root, "removal-package-failure.json"), JSON.stringify({ error: String(error), url: page.url(), text: await page.locator("body").innerText().catch(() => "") }, null, 2));
  }
  throw error;
} finally {
  await electron?.close();
  await context.close();
}
