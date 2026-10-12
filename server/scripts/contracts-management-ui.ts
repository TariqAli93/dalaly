import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, type Page } from "@playwright/test";
import type { FastifyInstance } from "fastify";
import { config } from "../src/infrastructure/config.js";

type Fixtures = {
  propertyName: string;
  rentalName: string;
  ownerName: string;
  customerName: string;
  sale: Record<string, unknown>;
};

export async function verifyContractsManagementUi(app: FastifyInstance, token: string, fixtures: Fixtures) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const output = path.join(root, "test-results/contracts-management");
  await fs.mkdir(output, { recursive: true });
  const origin = "http://127.0.0.1:5193";
  config.corsOrigins.push(origin);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert(address && typeof address !== "string");
  const vite = spawn(process.execPath, [path.join(root, "apps/renderer/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5193", "--strictPort", "--mode", "web-demo"], {
    cwd: path.join(root, "apps/renderer"), windowsHide: true, stdio: "pipe",
    env: { ...process.env, VITE_API_BASE_URL: `http://127.0.0.1:${address.port}/api`, VITE_WEB_DEMO: "true" },
  });
  let viteLog = "";
  vite.stdout.on("data", (chunk) => { viteLog = (viteLog + String(chunk)).slice(-5000); });
  vite.stderr.on("data", (chunk) => { viteLog = (viteLog + String(chunk)).slice(-5000); });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: Page | undefined;
  const errors: string[] = [];
  const headers = { authorization: `Bearer ${token}` };
  const api = async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown) => {
    const response = await app.inject({ method, url: `/api${url}`, headers, payload });
    assert(response.statusCode < 300, `${method} ${url}: ${response.statusCode} ${response.body}`);
    return response.json();
  };
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(origin)).ok) break; } catch {}
      if (attempt === 59) throw new Error(`Renderer failed to start: ${viteLog}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
    await context.addInitScript("window.__name = (fn) => fn;");
    await context.addInitScript((session) => { if (window === window.top) localStorage.setItem("dalaly.session", session); }, token);
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    const reportError = (message: string) => { if (!errors.includes(message) && errors.length < 20) errors.push(message); };
    page.on("pageerror", (error) => reportError(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || message.text().includes("Failed to resolve component") || message.text().includes("Unexpected error")) reportError(message.text());
    });
    const choose = async (label: string, text: string) => {
      const combo = page!.getByRole("combobox", { name: label, exact: true });
      await combo.press("Enter");
      if ((await combo.getAttribute("readonly")) === null && (await combo.getAttribute("inputmode")) !== "none") await combo.fill(text);
      await page!.getByRole("option").filter({ hasText: text }).first().click();
      await combo.press("Escape");
    };
    const frame = () => page!.frameLocator('iframe[title="معاينة العقد العربي بحجم A4"]');

    const created: Array<{ id: number; code: string; kind: string }> = [];
    for (const kind of ["sale", "rental"]) {
      await page.goto(`${origin}/?management-test=${kind}#/contracts/create`);
      await expect(page.getByRole("button", { name: "حفظ وإصدار العقد", exact: true })).toBeVisible();
      await expect(page.locator(".v-stepper")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      if (kind === "rental") await choose("نوع العقد", "عقد إيجار");
      await choose(kind === "sale" ? "العقار / العقارات" : "العرض الإيجاري / العروض الإيجارية", kind === "sale" ? fixtures.propertyName : fixtures.rentalName);
      const role = kind === "sale" ? "البائع" : "المؤجر";
      await expect(page.locator(".v-autocomplete").filter({ has: page.getByRole("combobox", { name: role, exact: true }) })).toContainText(fixtures.ownerName);
      if (kind === "sale") {
        await expect.poll(() => page!.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("dalaly.contract-draft.v1.") && localStorage.getItem(key)?.includes("property_ids")))).toBe(true);
        await page.reload();
        await expect(page.locator(".v-autocomplete").filter({ has: page.getByRole("combobox", { name: role, exact: true }) })).toContainText(fixtures.ownerName);
      }
      await choose(kind === "sale" ? "المشتري" : "المستأجر", fixtures.customerName);
      const contractDate = page.getByLabel("تاريخ العقد", { exact: true });
      const expectedDate = await page.evaluate(() => {
        const baghdad = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        return new Date(`${baghdad}T00:00:00`).toLocaleDateString("ar-IQ", { numberingSystem: "latn" });
      });
      await expect(contractDate).toHaveValue(expectedDate);
      if (kind === "rental") {
        const start = page.getByLabel("تاريخ بدء الإيجار", { exact: true });
        await start.click();
        await page.locator('.v-date-picker-month button[aria-current="date"]').last().click();
        const end = page.getByLabel("تاريخ انتهاء الإيجار", { exact: true });
        await end.click();
        await page.locator('.v-date-picker-month button[aria-current="date"]').last().click();
      }
      await expect(page.getByLabel("المبلغ الإجمالي", { exact: true })).toHaveValue(kind === "sale" ? "1,000" : "500");
      const paid = page.getByLabel("المبلغ المدفوع", { exact: true });
      await paid.fill("2000"); await paid.press("Tab");
      await page.getByRole("button", { name: "حفظ وإصدار العقد", exact: true }).click();
      await expect(page.getByText(/لا يمكن أن يتجاوز (?:المدفوع|المبلغ المدفوع) المبلغ الإجمالي\./).first()).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await paid.fill("200"); await paid.press("Tab");
      await expect(page.getByLabel("المبلغ المتبقي", { exact: true })).toHaveValue(kind === "sale" ? "800" : "300");
      await expect(page.getByText("حُفظت المسودة تلقائياً في النظام.", { exact: true })).toBeVisible({ timeout: 15000 });
      if (kind === "sale") {
        const drafts = await api("GET", "/contracts");
        const autosaved = drafts.filter((entry: any) => entry.status === "draft" && entry.property_name === fixtures.propertyName).sort((a: any, b: any) => b.id - a.id)[0];
        const updated = await api("PUT", `/contracts/${autosaved.id}`, { ...fixtures.sale, notes: "تعديل أحدث في النظام يجب استعادته دون استبداله بنسخة محلية قديمة" });
        await page.reload();
        await expect(page.getByLabel("الشروط الإضافية التي اتفق عليها الطرفان", { exact: true })).toHaveValue(updated.contract.notes);
        await expect(page.getByText("استُعيدت أحدث نسخة من المسودة المحفوظة في النظام.", { exact: true })).toBeVisible();
      }
      await page.screenshot({ path: path.join(output, `create-${kind}.png`), fullPage: true });
      const issuing = page.waitForResponse((response) => /\/contracts\/\d+\/issue$/.test(response.url()) && response.request().method() === "POST");
      await page.getByRole("button", { name: "حفظ وإصدار العقد", exact: true }).click();
      const result = await issuing;
      assert.equal(result.status(), 200, await result.text());
      const bundle = await result.json();
      created.push({ id: bundle.contract.id, code: bundle.contract.code, kind });
      await expect(page).toHaveURL(new RegExp(`/contracts/${bundle.contract.id}/review`));
      await expect(frame().locator("html")).toHaveAttribute("dir", "rtl");
      await expect(frame().locator("body")).toContainText(kind === "sale" ? fixtures.propertyName : fixtures.rentalName);
      await expect(frame().locator("[data-draft]")).toHaveCount(0);
      assert.equal(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("dalaly.contract-draft.v1.") && key.endsWith(".new"))), false);
      await page.screenshot({ path: path.join(output, `issued-${kind}.png`), fullPage: true });
    }

    const sale = created.find((contract) => contract.kind === "sale")!;
    const rental = created.find((contract) => contract.kind === "rental")!;
    const navigateReview = async (id: number) => {
      await page!.evaluate((target) => { location.hash = `/contracts/${target}/review`; }, id);
      await expect(page!).toHaveURL(new RegExp(`/contracts/${id}/review$`));
    };
    let releaseStaleResponse!: () => void;
    let confirmDelayedRequest!: () => void;
    let confirmReleasedResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => { releaseStaleResponse = resolve; });
    const delayedRequest = new Promise<void>((resolve) => { confirmDelayedRequest = resolve; });
    const releasedResponse = new Promise<void>((resolve) => { confirmReleasedResponse = resolve; });
    const saleGet = new RegExp(`/api/contracts/${sale.id}(?:\\?.*)?$`);
    await page.route(saleGet, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      confirmDelayedRequest();
      await responseGate;
      try { await route.fulfill({ response }); } finally { confirmReleasedResponse(); }
    });
    await navigateReview(sale.id);
    await delayedRequest;
    await navigateReview(rental.id);
    await expect(page.getByText(`${rental.code} · إيجار`, { exact: true })).toBeVisible();
    await expect(frame().locator("body")).toContainText(fixtures.rentalName);
    const staleResponse = page.waitForResponse((response) => saleGet.test(response.url()) && response.request().method() === "GET");
    releaseStaleResponse();
    await staleResponse;
    await releasedResponse;
    await page.unroute(saleGet);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByText(`${rental.code} · إيجار`, { exact: true })).toBeVisible();
    await expect(frame().locator("body")).toContainText(fixtures.rentalName);

    const cancelRequests: string[] = [];
    const watchCancellation = (request: { method(): string; url(): string }) => {
      if (request.method() === "POST" && /\/contracts\/\d+\/cancel$/.test(request.url())) cancelRequests.push(request.url());
    };
    page.on("request", watchCancellation);
    await navigateReview(sale.id);
    await expect(page.getByText(`${sale.code} · بيع`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "إلغاء العقد", exact: true }).click();
    await page.getByLabel("سبب الإلغاء", { exact: true }).fill("سبب متعلق بعقد البيع السابق فقط");
    await navigateReview(rental.id);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(`${rental.code} · إيجار`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "تأكيد الإلغاء", exact: true })).toHaveCount(0);
    const rentalPrint = page.waitForResponse((response) => response.url().endsWith(`/contracts/${rental.id}/print-record`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "طباعة", exact: true }).click();
    const printResult = await rentalPrint;
    assert.equal(printResult.status(), 200);
    assert.equal((await printResult.json()).contract.id, rental.id);
    assert.deepEqual(cancelRequests, []);
    assert.equal((await api("GET", `/contracts/${sale.id}`)).contract.status, "active");
    assert.equal((await api("GET", `/contracts/${rental.id}`)).contract.status, "active");
    await page.screenshot({ path: path.join(output, "review-route-guard.png"), fullPage: true });
    page.off("request", watchCancellation);
    await page.goto(`${origin}/#/contracts/${sale.id}/review`);
    await expect(page.getByRole("tab")).toHaveCount(4);
    await page.getByRole("button", { name: "تكبير المعاينة", exact: true }).click();
    await expect(page.getByRole("button", { name: "إعادة حجم المعاينة", exact: true })).toContainText("110%");
    await page.getByRole("tab", { name: "المعلومات", exact: true }).click();
    await expect(page.getByText("المستمسكات المحفوظة", { exact: true })).toBeVisible();
    await expect(page.getByText("المتبقي:", { exact: false })).toBeVisible();
    await page.screenshot({ path: path.join(output, "review-information.png"), fullPage: true });
    await page.getByRole("tab", { name: "الشروط القانونية", exact: true }).click();
    await expect(page.getByText("الصيغة والبنود هنا نسخة ثابتة وقت الإصدار؛ تعديل الصيغ الحالية أو حذفها لا يغير هذا العقد.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "تعديل الشروط قبل الإصدار", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "سجل الإجراءات", exact: true }).click();
    await expect(page.getByText("إصدار العقد", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, "review-history.png"), fullPage: true });
    await page.getByRole("button", { name: "طباعة", exact: true }).click();
    await expect.poll(async () => (await api("GET", `/contracts/${sale.id}`)).audit_history.some((entry: any) => entry.action === "print_requested")).toBe(true);
    await page.getByRole("button", { name: "المزيد من إجراءات العقد", exact: true }).click();
    const downloadWait = page.waitForEvent("download");
    await page.getByText("تصدير PDF", { exact: true }).click();
    const download = await downloadWait;
    assert(download.suggestedFilename().endsWith(".print.html"));
    await download.saveAs(path.join(output, "issued-print.html"));
    assert((await api("GET", `/contracts/${sale.id}`)).audit_history.some((entry: any) => entry.action === "pdf_requested"));
    await page.getByRole("button", { name: "إلغاء العقد", exact: true }).click();
    await page.getByRole("button", { name: "تأكيد الإلغاء", exact: true }).click();
    await expect(page.getByText("سبب الإلغاء مطلوب (ثلاثة أحرف على الأقل).", { exact: true })).toBeVisible();
    await page.getByLabel("سبب الإلغاء", { exact: true }).fill("إلغاء إداري اختباري مع تسوية مستقلة");
    await page.getByLabel("ملاحظات إضافية (اختياري)", { exact: true }).fill("حفظ المبالغ والمستمسكات والسجل");
    await page.screenshot({ path: path.join(output, "cancel-confirmation.png"), fullPage: true });
    await page.getByRole("button", { name: "تأكيد الإلغاء", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(frame().locator('[data-cancelled="true"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "إلغاء العقد", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "طباعة أرشيفية", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, "cancelled-archive.png"), fullPage: true });
    const archived = await api("GET", `/contracts/${sale.id}`);
    assert.equal(archived.contract.paid_amount, "200.00");
    assert(archived.audit_history.some((entry: any) => entry.action === "cancel"));
    await page.getByRole("tab", { name: "المعلومات", exact: true }).click();
    await page.getByRole("button", { name: "تسجيل تسوية مستقلة", exact: true }).click();
    await page.getByLabel("مبلغ الإجراء", { exact: true }).fill("100");
    await page.getByLabel("مرجع المستند أو التسوية", { exact: true }).fill("UI-REFUND-100");
    await page.getByLabel("وصف الإجراء واتفاق الأطراف", { exact: true }).fill("استرداد مستقل مسجل باتفاق الأطراف");
    await page.getByRole("button", { name: "تسجيل الإجراء المالي", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("UI-REFUND-100", { exact: false })).toBeVisible();
    const settled = await api("GET", `/contracts/${sale.id}`);
    assert.equal(settled.financial_followup.refunded_amount, 100);
    assert.equal(settled.financial_followup.unallocated_paid_amount, 100);
    assert.equal(settled.contract.paid_amount, "200.00");
    await page.screenshot({ path: path.join(output, "cancelled-settlement.png"), fullPage: true });
    const printPage = await context.newPage();
    await printPage.setContent(archived.contract.generated_html, { waitUntil: "load" });
    await printPage.emulateMedia({ media: "print" });
    const pdf = await printPage.pdf({ path: path.join(output, "cancelled-archive.pdf"), format: "A4", preferCSSPageSize: true, printBackground: true });
    assert(pdf.toString("latin1").includes("/Type /Page"));
    const box = pdf.toString("latin1").match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    assert(box && Math.abs(Number(box[1]) - 595) < 2 && Math.abs(Number(box[2]) - 842) < 2);
    await printPage.close();
    await page.goto(`${origin}/?management-test=review-list#/contracts/review`);
    const saleRow = page.locator("tbody tr").filter({ hasText: sale.code });
    await expect(saleRow).toContainText("ملغى");
    await expect(saleRow).toContainText(fixtures.propertyName);
    await expect(saleRow).toContainText(fixtures.ownerName);
    await page.screenshot({ path: path.join(output, "review-list.png"), fullPage: true });

    const formulas = await api("GET", "/legal-content");
    const base = formulas.find((row: any) => row.contract_type === "sale" && row.is_default);
    assert(base);
    const title = "صيغة إدارة اختبار مخصصة";
    const custom = await api("POST", "/legal-content", {
      contract_type: base.contract_type, property_type: base.property_type, jurisdiction: base.jurisdiction, transaction_kind: base.transaction_kind,
      title, legal_basis: base.legal_basis, applicability_notes: base.applicability_notes, revision_note: "إنشاء نسخة اختبار الإدارة", priority: 1,
      clauses: base.clauses.map((clause: any) => ({ clause_code: clause.clause_code, clause_title: clause.clause_title, clause_content_ar: clause.clause_content_ar, clause_order: clause.clause_order, is_required: clause.is_required, conditions_json: clause.conditions_json, source_clause_id: clause.id })),
    });
    await api("POST", `/legal-content/${custom.id}/decision`, { action: "approve_publish", comment: "تفعيل صيغة اختبار الإدارة" });
    await page.goto(`${origin}/?management-test=legal-templates#/contracts/legal-templates`);
    await page.getByRole("tab", { name: "عقود البيع", exact: true }).click();
    await page.getByLabel("البحث في الصيغ", { exact: true }).fill(title);
    const customRow = page.locator("tbody tr").filter({ hasText: title }).first();
    await expect(customRow).toContainText("مخصصة");
    await customRow.getByRole("button", { name: "معاينة الصيغة", exact: true }).click();
    const editor = page.locator(".legal-editor");
    await expect(editor).toBeVisible();
    await page.getByRole("tab", { name: "النص والمتغيرات", exact: true }).click();
    await expect(editor.locator(".raw-clauses")).toContainText("{{");
    await page.getByRole("tab", { name: "بيانات المتغيرات", exact: true }).click();
    await expect(editor.locator("code").first()).toContainText("{{");
    await page.getByRole("tab", { name: "الشكل المطبوع", exact: true }).click();
    await expect(frame().locator("html")).toHaveAttribute("dir", "rtl");
    await page.screenshot({ path: path.join(output, "legal-template-preview.png"), fullPage: true });
    await page.getByRole("button", { name: "إغلاق", exact: true }).click();
    const selectDefault = async (row: any) => {
      await row.getByRole("button", { name: "إجراءات الصيغة", exact: true }).click();
      await page!.getByText("تعيين كافتراضية لنوع العقد", { exact: true }).click();
      await page!.getByLabel("ملاحظة القرار", { exact: true }).fill("تحديد الصيغة الافتراضية للاختبار");
      const deciding = page!.waitForResponse((response) => /\/legal-content\/\d+\/decision$/.test(response.url()) && response.request().method() === "POST");
      await page!.getByRole("button", { name: "تسجيل القرار", exact: true }).click();
      const decision = await deciding;
      assert.equal(decision.status(), 200, `${decision.url()}: ${await decision.text()}`);
      await expect(page!.getByRole("dialog")).toHaveCount(0);
    };
    await selectDefault(customRow);
    await expect(customRow).toContainText("افتراضية");
    const usedDraft = await api("POST", "/contracts", fixtures.sale);
    const usedIssued = await api("POST", `/contracts/${usedDraft.contract.id}/issue`, {});
    assert(usedIssued.legal_snapshot.legal_template_version.some((version: any) => version.id === custom.id));
    await customRow.getByRole("button", { name: "إجراءات الصيغة", exact: true }).click();
    await expect(page.getByText("حذف الصيغة", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByLabel("البحث في الصيغ", { exact: true }).fill(base.title);
    const baseRow = page.locator("tbody tr").filter({ hasText: base.title }).filter({ hasText: "العراق الاتحادي" }).first();
    await expect(baseRow).toContainText("أساسية محمية");
    await selectDefault(baseRow);
    await page.getByLabel("البحث في الصيغ", { exact: true }).fill(title);
    await customRow.getByRole("button", { name: "إجراءات الصيغة", exact: true }).click();
    await page.getByText("حذف الصيغة", { exact: true }).click();
    await expect(page.getByText("ستؤرشف هذه الصيغة المخصصة وجميع إصداراتها ولن تظهر للعقود الجديدة. تبقى النسخ القانونية المستخدمة في العقود السابقة محفوظة دون تغيير.", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, "legal-template-delete.png"), fullPage: true });
    await page.getByRole("button", { name: "تأكيد الأرشفة", exact: true }).click();
    await expect(customRow).toHaveCount(0);
    assert.deepEqual((await api("GET", `/contracts/${usedDraft.contract.id}`)).legal_snapshot.document_model, usedIssued.legal_snapshot.document_model);
    assert.deepEqual(errors, []);
    await fs.rm(path.join(output, "failure.png"), { force: true });
    await context.close();
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
      console.error("Management UI failure", page.url(), errors, (await page.locator("body").innerText()).slice(-6500));
    }
    throw error;
  } finally {
    await browser?.close();
    vite.kill();
    config.corsOrigins.splice(config.corsOrigins.indexOf(origin), 1);
  }
}
