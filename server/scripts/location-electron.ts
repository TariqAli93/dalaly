import assert from "node:assert/strict";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { _electron, expect } from "@playwright/test";
import type { FastifyInstance } from "fastify";
import { fixtureTile } from "./location-ui.js";

export async function verifyPackagedMaps(
  apiServer: FastifyInstance, token: string, propertyId: number, temporary: string,
  api: (method: "GET" | "POST" | "PUT", url: string, payload?: object) => Promise<{ status: number; body: any }>,
) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  await apiServer.listen({ host: "127.0.0.1", port: 0 });
  const testApiAddress = apiServer.server.address();
  assert.ok(testApiAddress && typeof testApiAddress !== "string");
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
    executablePath: path.join(root, "apps/desktop/release/leaflet-verification/win-unpacked/دلالي.exe"),
    args: [`--user-data-dir=${path.join(temporary, "electron-profile")}`],
    env: { ...launchEnv, API_HOST: "127.0.0.1", API_PORT: String(port), VITE_DEV_SERVER_URL: "" },
    timeout: 30000,
  });
  try {
    // Never send automated test traffic to the community tile servers.
    await electron.context().route("https://tile.openstreetmap.org/**", async (route) => {
      await route.fulfill({ contentType: "image/png", body: fixtureTile, headers: { "cache-control": "public, max-age=604800" } });
    });
    electron.context().on("page", (page) => page.on("console", (message) => { if (message.type() === "error") console.error("Packaged renderer:", message.text()); }));
    assert.equal(await electron.evaluate(({ app }) => app.isPackaged), true);
    const actualProfile = await electron.evaluate(({ app }) => app.getPath("userData"));
    assert.equal(path.resolve(actualProfile), path.resolve(temporary, "electron-profile"));
    // Use real HTTP responses: Electron may report synthetic Fetch fulfilments as status 0.
    // Only the isolated test server accepts the file:// origin ("null").
    await electron.context().route("http://127.0.0.1:34567/api/**", async (route) => {
      await route.continue({ url: route.request().url().replace("127.0.0.1:34567", `127.0.0.1:${testApiAddress.port}`) });
    });
    // Authenticate through the actual compiled UI rather than injecting a session during startup.
    await electron.context().addInitScript(() => { localStorage.removeItem("dalaly.session"); });
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
    await mainPage.waitForFunction(() => !!window.dalalyConfig?.openMapLink);
    await mainPage.getByLabel("اسم المستخدم", { exact: true }).fill("maps_test_admin");
    await mainPage.getByLabel("الرمز السري", { exact: true }).fill("918273");
    await mainPage.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await expect(mainPage.getByRole("button", { name: "قائمة المستخدم", exact: true })).toBeVisible({ timeout: 15000 });
    // Set a known valid route after the authenticated router has initialized.
    await mainPage.evaluate((id) => { window.location.hash = `/properties/${id}`; }, propertyId);
    await mainPage.getByRole("tab", { name: "الموقع على الخريطة" }).click();
    const map = mainPage.getByRole("region", { name: "خريطة موقع العقار" });
    await expect(map.locator(".leaflet-container")).toBeVisible();
    await expect(map.locator(".leaflet-marker-icon")).toBeVisible();
    await expect(map.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
    await expect.poll(() => map.locator(".leaflet-marker-icon").evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    assert.equal(await mainPage.evaluate(() => typeof (window as any).require), "undefined");
    await expect(mainPage.getByLabel("خط العرض", { exact: true })).toHaveValue("33.3152");
    await electron.evaluate("globalThis.__name = (fn) => fn;");
    await electron.evaluate(({ shell }) => {
      shell.openExternal = async (url) => { (globalThis as any).__openedMaps = url; };
    });
    await mainPage.getByRole("button", { name: "فتح في الخرائط", exact: true }).click();
    assert.match(await electron.evaluate(() => (globalThis as any).__openedMaps), /openstreetmap\.org\/\?mlat=33\.31520000&mlon=44\.36610000/);
    assert.equal((await mainPage.evaluate(() => window.dalalyConfig!.openMapLink!("file:///C:/Windows/test.exe"))).ok, false);
    assert.equal((await mainPage.evaluate(() => window.dalalyConfig!.openMapLink!("https://evil.test/maps"))).ok, false);
    await mainPage.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(mainPage.getByText(/لا يوجد اتصال بالإنترنت/)).toBeVisible();
    await expect(mainPage.getByLabel("خط العرض", { exact: true })).toHaveValue("33.3152");
    console.log("PASS packaged Windows Leaflet: isolated startup, file:// renderer, tiles/icons/attribution, readonly map, real preload/main IPC, safe external OSM link, no Node exposure and offline fallback; no API key");
  } finally { await electron.close(); }
}
