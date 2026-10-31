import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, expect, type Page } from "@playwright/test";
import { removalTestContext } from "./removal-test-context.js";

const repository = fileURLToPath(new URL("../../", import.meta.url));
// The retired contract system's API namespaces. The current contracts module
// (Contract Studio, 2026-10-26) lives under /api/agreements and is allowed.
const forbiddenApi = /\/api\/(?:contracts(?:[/?]|$)|contract-studio(?:[/?]|$)|contract-templates(?:[/?]|$)|studio(?:[/?]|$))/i;
// Frontend routes of the retired system. /contracts and /contracts/templates
// belong to the current module; these paths do not.
const retiredRoutes = ["/contracts/create", "/contracts/1/edit", "/contracts/archive/1", "/contract-templates"];
const retiredHref = /#\/(?:contracts\/(?:create|archive)(?:[/?]|$)|contracts\/\d+\/edit(?:[/?]|$)|contract-templates(?:[/?]|$)|contract-studio(?:[/?]|$)|studio(?:[/?]|$))/i;

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
  async function noRetiredContracts(label: string) {
    const links = await page.locator("a[href]").evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute("href") ?? ""),
    );
    assert.deepEqual(links.filter((href) => retiredHref.test(href)), [], `${label}: links to a retired contract route`);
    assert.deepEqual(forbiddenRequests, [], `${label}: requests to a retired contract API`);
    passed.push(label);
  }
  async function navigate(route: string) {
    await page.evaluate((hash) => { window.location.hash = hash; }, route);
    await expect(page).toHaveURL(new RegExp(`#${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  }
  // Waits for the response while the action runs, so a failed action is
  // reported as itself rather than as an unhandled response timeout.
  async function responseTo(method: string, url: (value: string) => boolean, action: () => Promise<unknown>) {
    const [response] = await Promise.all([
      page.waitForResponse((candidate) => candidate.request().method() === method && url(candidate.url())),
      action(),
    ]);
    return response;
  }
  const sidebar = page.getByRole("navigation", { name: "التنقل الرئيسي" });
  const commandBar = page.getByRole("banner");
  const propertyName = fixture.property.name || `عقار ${fixture.property.code}`;
  const rentalName = fixture.rental.name || `إيجار ${fixture.rental.code}`;

  await page.goto(`${base}#/login`);
  await expect(page.getByLabel("اسم المستخدم", { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByLabel("اسم المستخدم", { exact: true }).fill("removal_admin");
  await page.getByLabel("الرمز السري", { exact: true }).fill("1234");
  const loginResponse = await responseTo("POST", (url) => url.endsWith("/api/auth/login"), () =>
    page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click(),
  );
  assert.equal(loginResponse.status(), 200);
  await expect(page.getByRole("button", { name: /^حساب المستخدم: / })).toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL(/#\/$/);
  await noRetiredContracts("Login and dashboard: no retired contract API or route");

  await sidebar.getByRole("link", { name: "الزبائن", exact: true }).click();
  const addPerson = commandBar.getByRole("button", { name: "إضافة زبون", exact: true });
  await expect(addPerson).toBeVisible();
  await expect(page.locator("tbody tr").filter({ hasText: fixture.people[0].full_name })).toBeVisible();
  await noRetiredContracts("Sidebar opens the customers directory: no retired contract API or route");

  if (options.editPeople !== false) {
    const name = `شخص فحص الإزالة ${Date.now()}`;
    await addPerson.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("الاسم الرباعي مع اللقب *", { exact: true }).fill(name);
    await dialog.getByLabel("الهاتف", { exact: true }).fill("07701234567");
    await dialog.getByLabel("رقم البطاقة الوطنية أو هوية الأحوال المدنية", { exact: true }).fill("001234567890");
    const createdHttp = await responseTo("POST", (url) => url.endsWith("/api/people"), () =>
      dialog.getByRole("button", { name: "حفظ", exact: true }).click(),
    );
    assert.equal(createdHttp.status(), 201);
    const created = await createdHttp.json();
    await expect(dialog).not.toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `تعديل: ${name}`, exact: true }).click();
    const updatedName = `${name} محدث`;
    await dialog.getByLabel("الاسم الرباعي مع اللقب *", { exact: true }).fill(updatedName);
    const updatedHttp = await responseTo("PUT", (url) => url.endsWith(`/api/people/${created.id}`), () =>
      dialog.getByRole("button", { name: "حفظ", exact: true }).click(),
    );
    assert.equal(updatedHttp.status(), 200);
    await expect(dialog).not.toBeVisible();
    const updatedRow = page.locator("tbody tr").filter({ hasText: updatedName });
    await expect(updatedRow).toBeVisible();
    // Archiving is in the row's "more" menu and asks for confirmation.
    await updatedRow.getByRole("button", { name: `أوامر أخرى: ${updatedName}`, exact: true }).click();
    await page.getByRole("listitem").filter({ hasText: /^أرشفة$/ }).click();
    const confirm = page.getByRole("alertdialog", { name: `أرشفة ${updatedName}`, exact: true });
    const archived = await responseTo("PATCH", (url) => url.endsWith(`/api/people/${created.id}/archive`), () =>
      confirm.getByRole("button", { name: "أرشفة", exact: true }).click(),
    );
    assert.equal(archived.status(), 200);
    assert.equal((await archived.json()).status, "archived");
    // The directory excludes archived customers by default.
    await expect(updatedRow).not.toBeVisible();
    const session = await page.evaluate(() => localStorage.getItem("dalaly.session"));
    const restored = await page.context().request.patch(createdHttp.url() + `/${created.id}/restore`, { headers: { Authorization: `Bearer ${session}`, "User-Agent": "DalalyRemovalVerification/1.0" } });
    assert.equal(restored.status(), 200);
    assert.equal((await restored.json()).status, "active");
    await commandBar.getByRole("button", { name: "تحديث البيانات", exact: true }).click();
    await expect(updatedRow).toContainText("نشط");
    await updatedRow.getByRole("link", { name: updatedName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/clients/${created.id}$`));
    await page.getByRole("tab", { name: "البيانات", exact: true }).click();
    await expect(page.locator("body")).toContainText("001234567890");
    await noRetiredContracts("Customers UI create, update, archive and details work; API restoration returns the customer to the directory");

    if (options.uploadDocument !== false) {
      await navigate("/documents");
      const documents = page.getByRole("region", { name: "المستمسكات", exact: true });
      await documents.getByLabel("الزبون", { exact: true }).fill(updatedName);
      await page.getByRole("option").filter({ hasText: updatedName }).click();
      await commandBar.getByRole("button", { name: "إضافة مستمسك", exact: true }).click();
      const documentDialog = page.getByRole("dialog");
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTWQAAAAASUVORK5CYII=", "base64");
      await documentDialog.locator('input[type="file"]').setInputFiles({ name: "person-document.png", mimeType: "image/png", buffer: png });
      await documentDialog.getByLabel("اسم المستمسك *", { exact: true }).fill("مستمسك فحص مستقل");
      await documentDialog.getByLabel("رقم المستمسك", { exact: true }).fill("REMOVAL-UI-001");
      const documentHttp = await responseTo("POST", (url) => url.endsWith("/api/documents"), () =>
        documentDialog.getByRole("button", { name: "رفع وحفظ", exact: true }).click(),
      );
      assert.equal(documentHttp.status(), 201);
      assert.equal(documentHttp.request().postDataJSON().person_id, created.id, "The document belongs to the customer filtered on");
      const document = await documentHttp.json();
      await expect(documentDialog).not.toBeVisible();
      await expect(page.locator("tbody tr").filter({ hasText: "REMOVAL-UI-001" })).toBeVisible();
      const session = await page.evaluate(() => localStorage.getItem("dalaly.session"));
      const apiUrl = documentHttp.url().replace(/\/documents$/, "");
      const file = await page.context().request.get(`${apiUrl}/documents/${document.id}/file`, { headers: { authorization: `Bearer ${session ?? ""}` } });
      assert.equal(file.status(), 200);
      assert.deepEqual(await file.body(), png);
      await noRetiredContracts("Customer documents still upload and return their original bytes");
    }
  }

  await navigate(`/clients/${fixture.people[0].id}`);
  const owned = page.getByRole("tab", { name: /^العروض المملوكة/ });
  await expect(owned).toBeVisible();
  await owned.click();
  await expect(page.getByRole("table", { name: "عروض البيع التي يملكها الزبون" }).getByRole("link", { name: propertyName, exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "عروض الإيجار التي يملكها الزبون" }).getByRole("link", { name: rentalName, exact: true })).toBeVisible();
  await noRetiredContracts("Customer file lists the owned sale and rental listings");

  await sidebar.getByRole("link", { name: "عروض البيع", exact: true }).click();
  const propertyRow = page.locator("tbody tr").filter({ hasText: propertyName });
  await expect(propertyRow).toBeVisible();
  await propertyRow.getByRole("link", { name: propertyName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/properties/${fixture.property.id}$`));
  await expect(page.getByRole("tab", { name: "التفاصيل", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "الصور", exact: true })).toBeVisible();
  await noRetiredContracts("Sales listing list and details keep their tabs and images");
  await commandBar.getByRole("button", { name: "تعديل", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/properties/${fixture.property.id}/edit$`));
  await expect(page.getByLabel("اسم المالك *", { exact: true })).toBeVisible();
  await noRetiredContracts("Sales listing edit form loads");

  await sidebar.getByRole("link", { name: "عروض الإيجار", exact: true }).click();
  const rentalRow = page.locator("tbody tr").filter({ hasText: rentalName });
  await expect(rentalRow).toBeVisible();
  await rentalRow.getByRole("link", { name: rentalName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/rentals/${fixture.rental.id}$`));
  await expect(page.getByRole("region", { name: "بيانات العرض الإيجاري" }).getByRole("tab", { name: "التفاصيل", exact: true })).toBeVisible();
  await noRetiredContracts("Rental listing list and details page remain operational");
  await commandBar.getByRole("button", { name: "تعديل", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/rentals/${fixture.rental.id}/edit$`));
  await expect(page.getByLabel("اسم المالك *", { exact: true })).toBeVisible();
  await noRetiredContracts("Rental listing edit form loads");

  await navigate("/settings");
  await expect(page.getByRole("tab", { name: "المظهر", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "معلومات المكتب", exact: true }).click();
  await expect(page.getByLabel("اسم المكتب", { exact: true })).toBeVisible();
  await noRetiredContracts("Office information settings remain");

  // The current contracts module (agreements) opens on its own API.
  const agreementsList = await responseTo("GET", (url) => /\/api\/agreements\/paged(?:\?|$)/.test(url), () =>
    sidebar.getByRole("link", { name: "العقود", exact: true }).click(),
  );
  await expect(page).toHaveURL(/#\/contracts$/);
  assert.equal(agreementsList.status(), 200);
  await expect(page.getByRole("heading", { name: "العقود", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "العقود", exact: true })).toBeVisible();
  const agreementTemplates = await responseTo("GET", (url) => /\/api\/agreements\/templates(?:\?|$)/.test(url), () =>
    commandBar.getByRole("link", { name: "القوالب", exact: true }).click(),
  );
  await expect(page).toHaveURL(/#\/contracts\/templates$/);
  assert.equal(agreementTemplates.status(), 200);
  await noRetiredContracts("Current contracts list and templates open on /api/agreements, no retired contract API");

  for (const retired of retiredRoutes) {
    await page.evaluate((hash) => { window.location.hash = hash; }, retired);
    await expect(page).toHaveURL(/#\/$/);
    await noRetiredContracts(`Retired frontend route falls through the catch-all to the dashboard: ${retired}`);
  }
  await navigate("/people");
  await page.setViewportSize({ width: 720, height: 1000 });
  await expect(page.getByRole("button", { name: "إضافة زبون", exact: true })).toBeVisible();
  await noRetiredContracts("Narrow viewport keeps the customers directory");
  await page.setViewportSize({ width: 1440, height: 1000 });

  assert.deepEqual(errors, [], "JavaScript errors");
  assert.deepEqual(serverErrors, [], "Backend 5xx responses during navigation");
  assert.deepEqual(forbiddenRequests, [], "Retired contract API requests");
  return { passed, javascript_errors: errors, backend_errors: serverErrors, retired_contract_api_requests: forbiddenRequests };
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
