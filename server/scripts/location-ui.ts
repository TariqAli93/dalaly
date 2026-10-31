import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import type { FastifyInstance } from "fastify";

// Real Leaflet and DOM pointer events, with fixture tiles: no automated OSM traffic.
export const fixtureTile = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTWQAAAAASUVORK5CYII=", "base64");

export async function verifyLocationUi(
  app: FastifyInstance, token: string, ids: Record<string, number>,
  api: (method: "GET" | "POST" | "PUT", url: string, payload?: object) => Promise<{ status: number; body: any }>,
) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address(); assert.ok(address && typeof address !== "string");
  const vite = spawn(process.execPath, [path.join(root, "apps/renderer/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5189", "--strictPort", "--mode", "web-demo"], {
    cwd: path.join(root, "apps/renderer"), windowsHide: true, stdio: "pipe",
    env: { ...process.env, VITE_API_BASE_URL: `http://127.0.0.1:${address.port}/api` },
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
    await context.addInitScript("window.__name = (fn) => fn;");
    await context.addInitScript((session) => { localStorage.setItem("dalaly.session", session); }, token);
    let tileRequests = 0;
    let failTiles = false;
    const googleRequests: string[] = [];
    context.on("request", (req) => { if (/maps\.googleapis\.com|maps\.gstatic\.com/.test(req.url())) googleRequests.push(req.url()); });
    await context.route("https://tile.openstreetmap.org/**", async (route) => {
      tileRequests++;
      if (failTiles) await route.abort();
      else await route.fulfill({ contentType: "image/png", body: fixtureTile, headers: { "cache-control": "public, max-age=604800" } });
    });
    const page = await context.newPage(); debugPage = page;
    const errors: string[] = []; page.on("pageerror", (cause) => errors.push(cause.message));
    const lat = page.getByLabel("خط العرض", { exact: true });
    const lng = page.getByLabel("خط الطول", { exact: true });
    const link = page.getByLabel("رابط الموقع", { exact: true });
    const map = page.getByRole("region", { name: "خريطة موقع العقار" });
    const mapTab = page.getByRole("tab", { name: "الموقع على الخريطة" });
    await page.goto(`http://127.0.0.1:5189/#/properties/${ids.properties}`);
    await expect(mapTab).toBeVisible({ timeout: 15000 });
    await mapTab.click();
    await expect(page.getByText("لم يتم تحديد موقع لهذا العقار بعد", { exact: true })).toBeVisible();
    assert.equal(tileRequests, 0);
    await page.getByRole("button", { name: "إضافة موقع العقار" }).click();
    await expect(page.getByLabel("اسم المالك", { exact: true })).toHaveValue("اختبار");
    await lat.fill("33.3152"); await lng.fill("44.3661");
    await expect(link).toHaveValue(/openstreetmap\.org\/\?mlat=33\.31520000&mlon=44\.36610000/);
    await page.getByRole("button", { name: "تحديد الموقع على الخريطة" }).click();
    await expect(map.locator(".leaflet-container")).toBeVisible();
    await expect(map.locator(".leaflet-marker-icon")).toHaveClass(/leaflet-marker-draggable/);
    await expect(map.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
    await expect.poll(() => tileRequests).toBeGreaterThan(0);
    const tile = map.locator("img.leaflet-tile").first();
    assert.equal(await tile.getAttribute("referrerpolicy"), "strict-origin-when-cross-origin");
    await map.locator(".leaflet-container").click({ position: { x: 250, y: 140 } });
    await expect(lat).not.toHaveValue("33.3152");
    const clickedLng = await lng.inputValue();
    const marker = map.locator(".leaflet-marker-icon");
    const markerBox = await marker.boundingBox(); assert.ok(markerBox);
    await page.mouse.move(markerBox.x + 12, markerBox.y + 15);
    await page.mouse.down();
    await page.mouse.move(markerBox.x + 90, markerBox.y + 55, { steps: 12 });
    await page.mouse.up();
    await expect(lng).not.toHaveValue(clickedLng);
    assert.equal(await marker.evaluate((el) => (el as HTMLImageElement).naturalWidth), 25);
    await lat.fill("91");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(lat).toHaveValue("91");
    assert.equal((await api("GET", `/properties/${ids.properties}`)).body.latitude, null);
    await link.fill("https://www.google.com/maps?q=33.3152,44.3661");
    await expect(lat).toHaveValue("33.3152");
    const oldHost = await map.locator(".leaflet-container").elementHandle(); assert.ok(oldHost);
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page).toHaveURL(/#\/properties$/);
    assert.equal((await api("GET", `/properties/${ids.properties}`)).body.longitude, 44.3661);
    assert.equal(await oldHost.evaluate((el) => (el as any)._leaflet_id), undefined);
    await page.goto(`http://127.0.0.1:5189/?maps-test=details#/properties/${ids.properties}`);
    await mapTab.click();
    await expect(map.locator(".leaflet-marker-icon")).toBeVisible();
    await expect(map.locator(".leaflet-marker-icon")).not.toHaveClass(/leaflet-marker-draggable/);
    await map.locator(".leaflet-marker-icon").click();
    const savedProperty = (await api("GET", `/properties/${ids.properties}`)).body;
    await expect(map.locator(".leaflet-popup-content")).toContainText(savedProperty.name || `عقار ${savedProperty.code}`);
    const savedLatitude = await lat.inputValue();
    await map.locator(".leaflet-container").click({ position: { x: 180, y: 140 } });
    await expect(lat).toHaveValue(savedLatitude);
    await map.getByRole("button", { name: "تكبير الخريطة", exact: true }).click();
    const detailsHost = await map.locator(".leaflet-container").elementHandle(); assert.ok(detailsHost);
    const mapId = await detailsHost.evaluate((el) => (el as any)._leaflet_id);
    await page.getByRole("tab", { name: "المعلومات الأساسية" }).click();
    await mapTab.click();
    assert.equal(await detailsHost.evaluate((el) => (el as any)._leaflet_id), mapId);
    await expect(map.locator(".leaflet-container")).toHaveCount(1);
    await page.evaluate(() => {
      (window as any).dalalyConfig = { openMapLink: async (url: string) => { (window as any).__openedMap = url; return { ok: true }; } };
    });
    await page.getByRole("button", { name: "فتح في الخرائط", exact: true }).click();
    assert.match(await page.evaluate(() => (window as any).__openedMap), /openstreetmap\.org\/\?mlat=33\.31520000/);
    await page.getByRole("button", { name: "نسخ رابط الموقع", exact: true }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /mlon=44\.36610000/);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText(/لا يوجد اتصال بالإنترنت/)).toBeVisible();
    assert.equal((await api("GET", `/properties/${ids.properties}`)).body.latitude, 33.3152);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.goto(`http://127.0.0.1:5189/?maps-test=rental#/rentals/${ids.rentals}/edit`);
    await expect(page.getByLabel("اسم المالك", { exact: true })).toHaveValue("اختبار");
    await page.getByRole("button", { name: "تحديد الموقع على الخريطة" }).click();
    await expect(map.locator(".leaflet-container")).toBeVisible();
    await expect(map.locator(".leaflet-marker-icon")).toHaveCount(0);
    await expect(lat).toHaveValue("");
    const requested = await tile.getAttribute("src"); assert.ok(requested?.includes("/12/"));
    await link.fill("https://www.openstreetmap.org/?mlat=34.5&mlon=45.5#map=15/32/43");
    await expect(lat).toHaveValue("34.5");
    await page.getByRole("button", { name: "مسح الموقع", exact: true }).click();
    await expect(lat).toHaveValue(""); await expect(map.locator(".leaflet-marker-icon")).toHaveCount(0);
    await link.fill("https://www.google.com/maps?q=34.5,45.5");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page).toHaveURL(/#\/rentals$/);
    assert.equal((await api("GET", `/rentals/${ids.rentals}`)).body.longitude, 45.5);
    // Rental details live inside a Vuetify dialog and need their own resize/lifecycle check.
    const savedRental = (await api("GET", `/rentals/${ids.rentals}`)).body;
    await page.locator("tbody tr").filter({ hasText: savedRental.code }).getByTitle("عرض", { exact: true }).click();
    await mapTab.click();
    await expect(map.locator(".leaflet-marker-icon")).toBeVisible();
    await expect(map.locator(".leaflet-marker-icon")).not.toHaveClass(/leaflet-marker-draggable/);
    await map.locator(".leaflet-marker-icon").click();
    await expect(map.locator(".leaflet-popup-content")).toContainText(savedRental.name || `عقار للإيجار ${savedRental.code}`);
    const dialogHost = await map.locator(".leaflet-container").elementHandle(); assert.ok(dialogHost);
    await page.getByRole("button", { name: "إغلاق التفاصيل", exact: true }).click();
    await expect(map).toHaveCount(0);
    assert.equal(await dialogHost.evaluate((el) => (el as any)._leaflet_id), undefined);
    // Both new-listing forms start without a persisted Baghdad marker.
    for (const entity of ["properties", "rentals"]) {
      await page.goto(`http://127.0.0.1:5189/?maps-test=new-${entity}#/${entity}/new`);
      await expect(lat).toHaveValue("");
      await page.getByRole("button", { name: "تحديد الموقع على الخريطة" }).click();
      await expect(map.locator(".leaflet-container")).toBeVisible();
      await expect(map.locator(".leaflet-marker-icon")).toHaveCount(0);
      await map.locator(".leaflet-container").click({ position: { x: 250, y: 140 } });
      await expect(lat).not.toHaveValue("");
      await expect(link).toHaveValue(/openstreetmap\.org/);
      await page.getByRole("button", { name: "مسح الموقع", exact: true }).click();
      await expect(lat).toHaveValue("");
      await expect(map.locator(".leaflet-marker-icon")).toHaveCount(0);
    }
    await page.evaluate(() => localStorage.setItem("dalaly.theme", "dalalyDark"));
    await page.goto(`http://127.0.0.1:5189/?maps-test=dark#/properties/${ids.properties}`);
    await mapTab.click();
    await expect(map).toHaveClass(/map-dark/);
    await expect(map.locator(".leaflet-tile-pane")).toHaveCSS("filter", /brightness/);
    failTiles = true;
    await page.goto(`http://127.0.0.1:5189/?maps-test=error#/properties/${ids.properties}`);
    await mapTab.click();
    await expect(page.getByText(/تعذر تحميل بعض أجزاء الخريطة/)).toBeVisible();
    await expect(lat).toHaveValue("33.3152");
    failTiles = false;
    await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
    await expect(page.getByText(/تعذر تحميل بعض أجزاء الخريطة/)).toHaveCount(0);
    await expect(map.locator(".leaflet-marker-icon")).toBeVisible();
    assert.deepEqual(googleRequests, []); assert.deepEqual(errors, []);
    console.log("PASS real Leaflet UI: click/drag, icons, attribution, manual/OSM/legacy links, save/reopen, invalid blocking, readonly popup, tab reuse, cleanup, bridge/copy, offline, themes and tile retry; zero Google API requests");
    await context.close();
  } catch (error) {
    if (debugPage && !debugPage.isClosed()) console.error("UI failure:", debugPage.url(), (await debugPage.locator("body").innerText()).slice(0, 2200));
    throw error;
  } finally { await browser?.close(); vite.kill(); }
}
