import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import type { FastifyInstance } from "fastify";

// This test double exercises API event wiring and lifecycle without billable Google requests.
const mapsDouble = `
window.__mapsTest = { maps: [], markers: [], listeners: [] };
class MapDouble {
  constructor(host, options) {
    if (!(host instanceof HTMLElement)) throw new Error('Map host must be a DOM element');
    this.host=host; this.options=options; this.events={}; window.__mapsTest.maps.push(this);
  }
  addListener(name, callback) { this.events[name]=callback; const listener={removed:false,remove:()=>{listener.removed=true;delete this.events[name]}}; window.__mapsTest.listeners.push(listener);return listener; }
  setCenter(position){this.center=position} setZoom(zoom){this.zoom=zoom}
}
class AdvancedMarkerElement {
  constructor(options){Object.assign(this,options);this.events={};window.__mapsTest.markers.push(this)}
  addListener(name, callback){this.events[name]=callback;const listener={removed:false,remove:()=>{listener.removed=true;delete this.events[name]}};window.__mapsTest.listeners.push(listener);return listener}
}
window.google={maps:{Map:MapDouble,marker:{AdvancedMarkerElement},LatLng:class{},ColorScheme:{DARK:'DARK',LIGHT:'LIGHT'},
  event:{trigger(){},clearInstanceListeners(target){target.events={}}},
  importLibrary:async(name)=>name==='maps'?{Map:MapDouble}:{AdvancedMarkerElement}
}};
window.dalalyMapsReady();
`;

export async function verifyLocationUi(
  app: FastifyInstance, token: string, ids: Record<string, number>,
  api: (method: "GET" | "POST" | "PUT", url: string, payload?: object) => Promise<{ status: number; body: any }>,
) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  const vite = spawn(process.execPath, [path.join(root, "apps/renderer/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5189", "--strictPort", "--mode", "web-demo"], {
    cwd: path.join(root, "apps/renderer"), windowsHide: true, stdio: "pipe",
    env: { ...process.env, VITE_API_BASE_URL: `http://127.0.0.1:${address.port}/api`, VITE_GOOGLE_MAPS_API_KEY: "ui-test-intercepted", VITE_GOOGLE_MAPS_MAP_ID: "ui-test-intercepted", VITE_WEB_DEMO: "false" },
  });
  let browser;
  let debugPage: import("@playwright/test").Page | undefined;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch("http://127.0.0.1:5189")).ok) break; } catch {}
      if (attempt === 59) throw new Error("Test renderer did not start");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
    await context.addInitScript("window.__name = (fn) => fn;"); // tsx preserves nested callback names in serialized browser functions.
    await context.addInitScript((session) => { localStorage.setItem("dalaly.session", session); }, token);
    const page = await context.newPage();
    debugPage = page;
    const errors: string[] = []; page.on("pageerror", (cause) => errors.push(cause.message));
    let apiLoads = 0;
    let failApi = false;
    await page.route("https://maps.googleapis.com/maps/api/js?*", async (route) => {
      apiLoads++;
      if (failApi) { await route.abort(); return; }
      await route.fulfill({ contentType: "application/javascript", body: mapsDouble });
    });
    await page.goto(`http://127.0.0.1:5189/#/properties/${ids.properties}`);
    await expect(page.getByRole("tab", { name: "الموقع على الخريطة" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: "الموقع على الخريطة" }).click();
    await expect(page.getByText("لم يتم تحديد موقع لهذا العقار بعد", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "إضافة موقع العقار" })).toBeVisible();
    assert.equal(apiLoads, 0);
    await page.getByRole("button", { name: "إضافة موقع العقار" }).click();
    await expect(page.getByLabel("اسم المالك", { exact: true })).toHaveValue("اختبار");
    await page.getByLabel("خط العرض", { exact: true }).fill("33.3152");
    await page.getByLabel("خط الطول", { exact: true }).fill("44.3661");
    await expect(page.getByLabel("رابط خرائط Google", { exact: true })).toHaveValue(/33\.31520000,44\.36610000/);
    await page.getByRole("button", { name: "تحديد الموقع على الخريطة" }).click();
    await expect(page.getByRole("region", { name: "خريطة موقع العقار" })).toBeVisible();
    await page.waitForFunction(() => (window as any).__mapsTest?.maps.length === 1);
    assert.equal(apiLoads, 1);
    await page.evaluate(() => {
      const state = (window as any).__mapsTest;
      state.maps.at(-1).events.click({ latLng: { toJSON: () => ({ lat: 34.1, lng: 45.2 }) } });
    });
    await expect(page.getByLabel("خط العرض", { exact: true })).toHaveValue("34.1");
    await page.evaluate(() => {
      const marker = (window as any).__mapsTest.markers.at(-1);
      marker.position = { lat: 34.2, lng: 45.3 }; marker.events.dragend();
    });
    await expect(page.getByLabel("خط الطول", { exact: true })).toHaveValue("45.3");
    await page.getByLabel("خط العرض", { exact: true }).fill("91");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page.getByLabel("خط العرض", { exact: true })).toHaveValue("91");
    assert.equal((await api("GET", `/properties/${ids.properties}`)).body.latitude, null);
    await page.getByLabel("رابط خرائط Google", { exact: true }).fill("https://www.google.com/maps?q=33.3152,44.3661");
    await expect(page.getByLabel("خط العرض", { exact: true })).toHaveValue("33.3152");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page).toHaveURL(/#\/properties$/);
    assert.equal((await api("GET", `/properties/${ids.properties}`)).body.longitude, 44.3661);
    assert.equal(await page.evaluate(() => (window as any).__mapsTest.listeners.every((listener: any) => listener.removed)), true);
    await page.goto(`http://127.0.0.1:5189/?maps-test=details#/properties/${ids.properties}`);
    await page.getByRole("tab", { name: "الموقع على الخريطة" }).click();
    await page.waitForFunction(() => (window as any).__mapsTest?.maps.length === 1);
    const readonlyMarker = await page.evaluate(() => (window as any).__mapsTest.markers.at(-1).gmpDraggable);
    assert.equal(readonlyMarker, false);
    const count = await page.evaluate(() => (window as any).__mapsTest.maps.length);
    await page.getByRole("tab", { name: "المعلومات الأساسية" }).click();
    await page.getByRole("tab", { name: "الموقع على الخريطة" }).click();
    assert.equal(await page.evaluate(() => (window as any).__mapsTest.maps.length), count);
    await page.evaluate(() => {
      (window as any).dalalyConfig = { openGoogleMaps: async (url: string) => { (window as any).__openedMap = url; return { ok: true }; } };
    });
    await page.getByRole("button", { name: "فتح في خرائط Google", exact: true }).click();
    assert.match(await page.evaluate(() => (window as any).__openedMap), /33\.31520000,44\.36610000/);
    await page.getByRole("button", { name: "نسخ رابط الموقع", exact: true }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /33\.31520000,44\.36610000/);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText(/لا يوجد اتصال بالإنترنت/)).toBeVisible();
    assert.equal((await api("GET", `/properties/${ids.properties}`)).body.latitude, 33.3152);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.goto(`http://127.0.0.1:5189/?maps-test=rental#/rentals/${ids.rentals}/edit`);
    await expect(page.getByLabel("اسم المالك", { exact: true })).toHaveValue("اختبار");
    await page.getByRole("button", { name: "تحديد الموقع على الخريطة" }).click();
    await page.waitForFunction(() => (window as any).__mapsTest?.maps.length === 1);
    assert.deepEqual(await page.evaluate(() => (window as any).__mapsTest.maps.at(-1).options.center), { lat: 33.3152, lng: 44.3661 });
    assert.equal(await page.evaluate(() => (window as any).__mapsTest.markers.at(-1).map), null);
    await expect(page.getByLabel("خط العرض", { exact: true })).toHaveValue("");
    await page.getByLabel("رابط خرائط Google", { exact: true }).fill("https://www.google.com/maps/@34.5,45.5,15z");
    await expect(page.getByLabel("خط العرض", { exact: true })).toHaveValue("34.5");
    await page.getByRole("button", { name: "مسح الموقع", exact: true }).click();
    await expect(page.getByLabel("خط العرض", { exact: true })).toHaveValue("");
    await page.getByLabel("رابط خرائط Google", { exact: true }).fill("https://www.google.com/maps?q=34.5,45.5");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page).toHaveURL(/#\/rentals$/);
    assert.equal((await api("GET", `/rentals/${ids.rentals}`)).body.longitude, 45.5);
    await page.evaluate(() => localStorage.setItem("dalaly.theme", "dalalyDark"));
    await page.goto(`http://127.0.0.1:5189/?maps-test=dark#/properties/${ids.properties}`);
    await page.getByRole("tab", { name: "الموقع على الخريطة" }).click();
    await page.waitForFunction(() => (window as any).__mapsTest?.maps.length === 1);
    assert.equal(await page.evaluate(() => (window as any).__mapsTest.maps.at(-1).options.colorScheme), "DARK");
    failApi = true;
    await page.goto(`http://127.0.0.1:5189/?maps-test=error#/properties/${ids.properties}`);
    await page.getByRole("tab", { name: "الموقع على الخريطة" }).click();
    await expect(page.getByText(/تعذر تحميل خرائط Google/)).toBeVisible();
    failApi = false;
    await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
    await page.waitForFunction(() => (window as any).__mapsTest?.maps.length === 1);
    await page.evaluate(() => (window as any).gm_authFailure());
    await expect(page.getByText(/تعذر التحقق من إعدادات خرائط Google/)).toBeVisible();
    assert.deepEqual(errors, []);
    console.log("PASS browser UI: lazy loader, map click/drag, manual/link input, invalid blocking, save/reopen, tab reuse, listener cleanup, readonly, bridge/copy, offline and both themes");
    await context.close();
  } catch (error) {
    if (debugPage && !debugPage.isClosed()) console.error("UI failure:", debugPage.url(), (await debugPage.locator("body").innerText()).slice(0, 2200));
    throw error;
  } finally {
    await browser?.close(); vite.kill();
  }
}
