import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, expect, type Page } from "@playwright/test";
import { removalTestContext } from "./removal-test-context.js";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const forbiddenUi = /عقود|العقد|إنشاء عقد|تحرير عقد|إصدار عقد|طباعة عقد|قوالب العقود|استوديو العقود|Contract Studio/i;
const forbiddenApi = /\/api\/(?:contracts(?:\/|$)|contract-studio(?:\/|$)|contract-templates(?:\/|$)|studio(?:\/|$))/i;

type Fixture = {
  property: { id: number; name?: string | null; code?: string };
  rental: { id: number; name?: string | null; code?: string };
  people: Array<{ id: number; full_name: string }>;
};

export async function verifyRemovalNavigation(
  page: Page,
  base: string,
  fixture: Fixture,
  options: { editPeople?: boolean; uploadDocument?: boolean } = {},
) {
  const passed: string[] = [];
  const forbiddenRequests: string[] = [];
  const errors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (forbiddenApi.test(request.url())) forbiddenRequests.push(request.url());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500)
      serverErrors.push(`${response.status()} ${response.url()}`);
  });
  async function noContractUi(label: string) {
    const controls = await page
      .locator("a, button, [role=button], [role=tab]")
      .allTextContents();
    assert.deepEqual(controls.filter((text) => forbiddenUi.test(text)), [], label);
    assert.equal(await page.locator('a[href*="contract"], a[href*="studio"]').count(), 0, label);
    assert.deepEqual(forbiddenRequests, [], "Remaining pages requested a removed API");
    passed.push(label);
  }
  async function navigate(route: string) {
    await page.evaluate((hash) => { window.location.hash = hash; }, route);
    await expect(page).toHaveURL(new RegExp(`#${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  }

  await page.goto(`${base}#/login`);
  await expect(page.getByLabel("اسم المستخدم", { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByLabel("اسم المستخدم", { exact: true }).fill("removal_admin");
  await page.getByLabel("الرمز السري", { exact: true }).fill("1234");
  const loginResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/login") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  assert.equal((await loginResponse).status(), 200);
  await expect(page.getByRole("button", { name: "قائمة المستخدم", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL(/#\/$/);
  await noContractUi("UI login and dashboard have no contract navigation or actions");

  await page.locator('.dal-nav-drawer a[href="#/people"]').click();
  await expect(page.getByRole("button", { name: "إضافة شخص", exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toContainText([fixture.people[0].full_name]);
  await noContractUi("Sidebar opens the people directory without contract actions");

  if (options.editPeople !== false) {
    const name = `شخص فحص الإزالة ${Date.now()}`;
    await page.getByRole("button", { name: "إضافة شخص", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("الاسم الرباعي مع اللقب", { exact: true }).fill(name);
    await dialog.getByLabel("الهاتف", { exact: true }).fill("07701234567");
    await dialog.getByLabel("رقم البطاقة الوطنية أو هوية الأحوال المدنية").fill("001234567890");
    const createdResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/people") && response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
    const createdHttp = await createdResponse;
    assert.equal(createdHttp.status(), 201);
    const created = await createdHttp.json();
    await expect(dialog).not.toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "تعديل بيانات الشخص" }).click();
    const updatedName = `${name} محدث`;
    await dialog.getByLabel("الاسم الرباعي مع اللقب", { exact: true }).fill(updatedName);
    const updatedResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/people/${created.id}`) && response.request().method() === "PUT",
    );
    await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
    assert.equal((await updatedResponse).status(), 200);
    await expect(dialog).not.toBeVisible();
    const updatedRow = page.locator("tbody tr").filter({ hasText: updatedName });
    const archiveResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/people/${created.id}/archive`) && response.request().method() === "PATCH",
    );
    await updatedRow.getByRole("button", { name: "أرشفة الشخص" }).click();
    const archived = await archiveResponse;
    assert.equal(archived.status(), 200);
    assert.equal((await archived.json()).status, "archived");
    // The existing directory intentionally excludes archived people by default.
    await expect(updatedRow).not.toBeVisible();
    const session = await page.evaluate(() => localStorage.getItem("dalaly.session"));
    const restored = await page.context().request.patch(createdHttp.url() + `/${created.id}/restore`, { headers: { Authorization: `Bearer ${session}`, "User-Agent": "DalalyRemovalVerification/1.0" } });
    assert.equal(restored.status(), 200);
    assert.equal((await restored.json()).status, "active");
    await page.getByRole("button", { name: "بحث", exact: true }).click();
    await expect(updatedRow).toContainText("نشط");
    await updatedRow.getByRole("link").click();
    await expect(page.getByRole("tab", { name: "المعلومات الأساسية", exact: true })).toBeVisible();
    await expect(page.locator("body")).toContainText("001234567890");
    await noContractUi("People UI create, update, archive and details work; API restoration returns the person to the directory");

    if (options.uploadDocument !== false) {
      await navigate("/documents");
      const person = page.getByRole("combobox", { name: "تصفية حسب الشخص" });
      await person.fill(updatedName);
      await page.getByRole("option", { name: updatedName, exact: true }).click();
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTWQAAAAASUVORK5CYII=", "base64");
      await page.locator('input[type="file"]').setInputFiles({ name: "person-document.png", mimeType: "image/png", buffer: png });
      await page.getByLabel("اسم المستمسك", { exact: true }).fill("مستمسك فحص مستقل");
      await page.getByLabel("رقم المستمسك", { exact: true }).fill("REMOVAL-UI-001");
      const documentResponse = page.waitForResponse((response) =>
        response.url().endsWith("/api/documents") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "إضافة", exact: true }).click();
      const documentHttp = await documentResponse;
      assert.equal(documentHttp.status(), 201);
      const document = await documentHttp.json();
      await expect(page.locator("tbody tr").filter({ hasText: "REMOVAL-UI-001" })).toBeVisible();
      const session = await page.evaluate(() => localStorage.getItem("dalaly.session"));
      const apiUrl = documentHttp.url().replace(/\/documents$/, "");
      const file = await page.context().request.get(`${apiUrl}/documents/${document.id}/file`, { headers: { authorization: `Bearer ${session ?? ""}` } });
      assert.equal(file.status(), 200);
      assert.deepEqual(await file.body(), png);
      await noContractUi("Shared person documents still upload and return their original bytes");
    }
  }

  await navigate(`/clients/${fixture.people[0].id}`);
  await expect(page.getByRole("tab", { name: "العقارات المرتبطة", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "العقارات المرتبطة", exact: true }).click();
  await expect(page.getByRole("link", { name: fixture.property.name || fixture.property.code || "", exact: true })).toBeVisible();
  await noContractUi("Person property ownership relationship remains and contract tab is absent");

  await page.locator('.dal-nav-drawer a[href="#/properties"]').click();
  await expect(page.locator("tbody tr")).toContainText([fixture.property.name || fixture.property.code || ""]);
  await page.getByRole("link", { name: fixture.property.name || fixture.property.code || "", exact: true }).click();
  await expect(page.getByRole("tab", { name: "المعلومات الأساسية", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "الصور", exact: true })).toBeVisible();
  await noContractUi("Sales property list and details keep their independent tabs");
  await page.getByRole("button", { name: "تعديل العقار", exact: true }).click();
  await expect(page.getByLabel("اسم المالك", { exact: true })).toBeVisible();
  await noContractUi("Sales property edit form loads without contract controls");

  await navigate("/rentals");
  const rentalRow = page.locator("tbody tr").filter({ hasText: fixture.rental.name || fixture.rental.code || "" });
  await expect(rentalRow).toBeVisible();
  await rentalRow.locator('button[title="عرض"]').click();
  await expect(page.getByRole("dialog").getByRole("tab", { name: "التفاصيل", exact: true })).toBeVisible();
  await noContractUi("Independent rentals list and detail dialog remain operational");
  await page.keyboard.press("Escape");
  await navigate(`/rentals/${fixture.rental.id}/edit`);
  await expect(page.getByLabel("اسم المالك", { exact: true })).toBeVisible();
  await noContractUi("Rental edit form loads without contract actions");

  await navigate("/settings");
  await expect(page.getByRole("tab", { name: "المظهر", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "معلومات المكتب", exact: true }).click();
  await expect(page.getByLabel("اسم المكتب", { exact: true })).toBeVisible();
  await noContractUi("Office settings remain and contract template settings are absent");
  for (const removed of ["/contracts", "/contracts/create", "/contracts/1/edit", "/contracts/archive/1", "/contract-templates"]) {
    await page.evaluate((hash) => { window.location.hash = hash; }, removed);
    await expect(page).toHaveURL(/#\/$/);
    await noContractUi(`Removed frontend route redirects through normal catch-all: ${removed}`);
  }
  await navigate("/people");
  await page.setViewportSize({ width: 720, height: 1000 });
  await expect(page.getByRole("button", { name: "إضافة شخص", exact: true })).toBeVisible();
  await noContractUi("Narrow viewport retains the people module without contract controls");
  await page.setViewportSize({ width: 1440, height: 1000 });

  assert.deepEqual(errors, [], "JavaScript errors");
  assert.deepEqual(serverErrors, [], "Backend 500 responses during remaining module navigation");
  assert.deepEqual(forbiddenRequests, [], "Contract API requests");
  return { passed, javascript_errors: errors, backend_errors: serverErrors, contract_api_requests: forbiddenRequests };
}

async function main() {
  const context = await removalTestContext("browser");
  let vite: { close(): Promise<void> } | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: Page | undefined;
  try {
    await context.app.listen({ host: "127.0.0.1", port: 0 });
    const api = context.app.server.address();
    assert.ok(api && typeof api !== "string");
    const renderer = path.join(repository, "apps/renderer");
    const rendererRequire = createRequire(path.join(renderer, "package.json"));
    const { createServer } = await import(pathToFileURL(rendererRequire.resolve("vite")).href);
    const rendererServer = await createServer({
      root: renderer,
      configFile: path.join(renderer, "vite.config.ts"),
      mode: "web-demo",
      define: {
        "import.meta.env.VITE_API_BASE_URL": JSON.stringify(`http://127.0.0.1:${api.port}/api`),
        "import.meta.env.VITE_WEB_DEMO": JSON.stringify("false"),
      },
      server: { host: "127.0.0.1", port: 0 },
    });
    vite = rendererServer;
    await rendererServer.listen();
    const rendererAddress = rendererServer.httpServer.address();
    assert.ok(rendererAddress && typeof rendererAddress !== "string");
    const { config } = await import("../src/infrastructure/config.js");
    config.corsOrigins.push(`http://127.0.0.1:${rendererAddress.port}`);
    browser = await chromium.launch({ headless: true });
    const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ar-IQ" });
    await browserContext.addInitScript("window.__name = (fn) => fn;");
    page = await browserContext.newPage();
    const result = await verifyRemovalNavigation(page, `http://127.0.0.1:${rendererAddress.port}/`, context);
    await page.screenshot({ path: path.join(context.root, "removal-people.png"), fullPage: true });
    await fs.writeFile(path.join(context.root, "removal-browser-result.json"), JSON.stringify({ ...result, browser: browser.version(), artifact_directory: context.root }, null, 2));
    console.log(JSON.stringify({ status: "PASS", checks: result.passed, artifacts: context.root }, null, 2));
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(context.root, "removal-browser-failure.png"), fullPage: true }).catch(() => undefined);
      await fs.writeFile(path.join(context.root, "removal-browser-failure.json"), JSON.stringify({ error: String(error), url: page.url(), text: await page.locator("body").innerText().catch(() => "") }, null, 2));
    }
    throw error;
  } finally {
    await browser?.close();
    await vite?.close();
    await context.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
