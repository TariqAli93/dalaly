import assert from "node:assert/strict";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { _electron, expect } from "@playwright/test";
import type { FastifyInstance } from "fastify";

export async function verifyPackagedMaps(
  apiServer: FastifyInstance, token: string, propertyId: number, temporary: string,
  api: (method: "GET" | "POST" | "PUT", url: string, payload?: object) => Promise<{ status: number; body: any }>,
) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  // The existing app may be using 34567; packaged startup gets a distinct checked port.
  const portProbe = net.createServer();
  await new Promise<void>((resolve, reject) => { portProbe.once("error", reject); portProbe.listen(0, "127.0.0.1", resolve); });
  const address = portProbe.address(); assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => portProbe.close(() => resolve()));
  const current = (await api("GET", `/properties/${propertyId}`)).body;
  assert.equal((await api("PUT", `/properties/${propertyId}`, { ...current, latitude: 33.3152, longitude: 44.3661, location_link: "https://www.google.com/maps?q=33.3152,44.3661" })).status, 200);
  const launchEnv = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== "ELECTRON_RUN_AS_NODE" && typeof value === "string"));
  const electron = await _electron.launch({
    executablePath: path.join(root, "apps/desktop/release/maps-verification-checked/win-unpacked/دلالي.exe"),
    args: [`--user-data-dir=${path.join(temporary, "electron-profile")}`],
    env: { ...launchEnv, API_HOST: "127.0.0.1", API_PORT: String(port), VITE_DEV_SERVER_URL: "" },
    timeout: 30000,
  });
  try {
    electron.context().on("page", (page) => page.on("console", (message) => { if (message.type() === "error") console.error("Packaged renderer:", message.text()); }));
    assert.equal(await electron.evaluate(({ app }) => app.isPackaged), true);
    const actualProfile = await electron.evaluate(({ app }) => app.getPath("userData"));
    assert.equal(path.resolve(actualProfile), path.resolve(temporary, "electron-profile"));
    // Route the compiled renderer's fixed API origin to the same isolated Fastify server.
    await electron.context().route("http://127.0.0.1:34567/api/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-allow-headers": "Content-Type,Authorization" } }); return; }
      const proxyHeaders = { ...req.headers() };
      delete proxyHeaders.origin;
      const response = await apiServer.inject({ method: req.method() as any, url: new URL(req.url()).pathname + new URL(req.url()).search, payload: req.postData() ?? undefined, headers: proxyHeaders });
      await route.fulfill({ status: response.statusCode, body: response.body, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
    });
    await electron.context().addInitScript((session) => { localStorage.setItem("dalaly.session", session); }, token);
    let mainPage: import("@playwright/test").Page | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      mainPage = electron.windows().find((page) => page.url().includes("/index.html"));
      if (mainPage) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(mainPage, "Packaged main window did not load");
    mainPage.on("console", (message) => { if (message.type() === "error") console.error("Packaged renderer:", message.text()); });
    mainPage.on("pageerror", (error) => console.error("Packaged page error:", error.message));
    assert.match(mainPage.url(), /^file:/);
    await mainPage.waitForLoadState("load");
    await mainPage.reload();
    await mainPage.waitForFunction(() => !!window.dalalyConfig?.openGoogleMaps);
    await expect(mainPage.getByRole("button", { name: "قائمة المستخدم", exact: true })).toBeVisible();
    // Set a known valid route after the authenticated router has initialized.
    await mainPage.evaluate((id) => { window.location.hash = `/properties/${id}`; }, propertyId);
    await mainPage.getByRole("tab", { name: "الموقع على الخريطة" }).click();
    await expect(mainPage.getByText(/خرائط Google غير مهيأة/)).toBeVisible();
    await expect(mainPage.getByLabel("خط العرض", { exact: true })).toHaveValue("33.3152");
    await electron.evaluate("globalThis.__name = (fn) => fn;");
    await electron.evaluate(({ shell }) => {
      shell.openExternal = async (url) => { (globalThis as any).__openedMaps = url; };
    });
    await mainPage.getByRole("button", { name: "فتح في خرائط Google", exact: true }).click();
    assert.match(await electron.evaluate(() => (globalThis as any).__openedMaps), /33\.31520000,44\.36610000/);
    assert.equal((await mainPage.evaluate(() => window.dalalyConfig!.openGoogleMaps!("file:///C:/Windows/test.exe"))).ok, false);
    assert.equal((await mainPage.evaluate(() => window.dalalyConfig!.openGoogleMaps!("https://evil.test/maps"))).ok, false);
    console.log("PASS packaged Windows app: isolated startup, file:// renderer, real preload/main IPC, safe shell opening and missing-key fallback");
  } finally { await electron.close(); }
}
