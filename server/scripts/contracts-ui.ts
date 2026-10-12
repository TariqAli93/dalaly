import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import type { FastifyInstance } from "fastify";

export async function verifyContractsUi(
  app: FastifyInstance,
  token: string,
  draftId: number,
  documents: Array<{ html: string; code: string }>,
  unprepared: Array<{ id: number; kind: "sale" | "rental" }>,
) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert(address && typeof address !== "string");
  const origin = "http://127.0.0.1:5191";
  const vite = spawn(
    process.execPath,
    [
      path.join(root, "apps/renderer/node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5191",
      "--strictPort",
      "--mode",
      "web-demo",
    ],
    {
      cwd: path.join(root, "apps/renderer"),
      windowsHide: true,
      stdio: "pipe",
      env: {
        ...process.env,
        VITE_API_BASE_URL: `http://127.0.0.1:${address.port}/api`,
        VITE_WEB_DEMO: "true",
      },
    },
  );
  let browser;
  let debugPage: import("@playwright/test").Page | undefined;
  const errors: string[] = [];
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      if (i === 59) throw new Error("Contract test renderer did not start");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1500, height: 1100 },
      reducedMotion: "reduce",
    });
    await context.addInitScript("window.__name = (fn) => fn;");
    await context.addInitScript((session) => {
      if (window === window.top)
        localStorage.setItem("dalaly.session", session);
    }, token);
    const page = await context.newPage();
    debugPage = page;
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (
        msg.type() === "error" ||
        msg.text().includes("Failed to resolve component") ||
        msg.text().includes("Unexpected error")
      )
        errors.push(msg.text());
    });
    await fs.mkdir(path.join(root, "test-results/contracts-legal"), {
      recursive: true,
    });
    await page.goto(`${origin}/#/settings/legal-content`);
    await expect(
      page.getByRole("tab", { name: "عقود الإيجار", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(4);
    await page
      .getByLabel("البحث في الصيغ", { exact: true })
      .fill("صيغة اختبار commercial");
    const row = page
      .locator("tbody tr")
      .filter({ hasText: "صيغة اختبار commercial" })
      .first();
    await row.getByRole("button", { name: "تعديل الصيغة", exact: true }).click();
    const editor = page.locator(".legal-editor");
    await expect(editor).toBeVisible();
    await page
      .getByLabel("اسم الصيغة", { exact: true })
      .fill("صيغة اختبار من واجهة الإدارة");
    await page
      .getByLabel("سبب التغيير", { exact: true })
      .fill("تغيير إداري اختباري من المحرر");
    await page
      .getByRole("button", { name: "التحقق من الصيغة", exact: true })
      .click();
    await expect(editor).toContainText("تعديل إداري على نص مراجع مسبقاً");
    const previews = page.frameLocator(
      'iframe[title="معاينة العقد العربي بحجم A4"]',
    );
    await expect(previews.locator("html")).toHaveAttribute("dir", "rtl");
    const real = await app.inject({
      url: "/api/contracts",
      headers: { authorization: "Bearer " + token },
    });
    const previewContract = real
      .json()
      .find(
        (c: any) =>
          c.contract_type === "rental" &&
          c.id !== draftId &&
          c.status === "draft" &&
          c.rental_id,
      );
    // Choose the most recent routine shop draft prepared by the fixture.
    const lastRental = real
      .json()
      .filter(
        (c: any) =>
          c.contract_type === "rental" &&
          c.id !== draftId &&
          c.status === "draft",
      )
      .sort((a: any, b: any) => b.id - a.id)[0];
    assert(previewContract && lastRental);
    await page
      .getByRole("combobox", { name: "بيانات المعاينة", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "بيانات المعاينة", exact: true })
      .fill(lastRental.code);
    await expect(
      page.getByRole("combobox", { name: "بيانات المعاينة", exact: true }),
    ).toHaveValue(lastRental.code);
    await page
      .getByRole("option", { name: lastRental.code, exact: true })
      .click();
    await expect(previews.locator("body")).toContainText("إيجار اختبار 1");
    const normalizeText = (s: string) =>
      s
        .replace(/CTR-\d+ · rental_\d+ · الإصدار المرئي \d+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const baselineText = normalizeText(
      await previews.locator("body").innerText(),
    );
    const templates = await app.inject({
      url: "/api/contracts/templates?contract_type=rental",
      headers: { authorization: "Bearer " + token },
    });
    let previousDesignId = templates.json()[0].id;
    // The first design is already rendered. Selecting an already-selected
    // Vuetify option does not produce a preview request.
    for (const design of templates.json().slice(1)) {
      await editor.getByRole("combobox", { name: "التصميم المرئي", exact: true }).locator("..").click();
      const changed = previousDesignId !== design.id;
      if (changed) {
        const [response] = await Promise.all([
          page.waitForResponse((response) => response.url().endsWith("/legal-content/preview") && response.request().method() === "POST" && Number(response.request().postDataJSON().visual_id) === Number(design.id)),
          page.getByRole("option", { name: design.name, exact: true }).click(),
        ]);
        assert.equal(response.status(), 200);
        await expect(editor.locator('iframe[title="معاينة العقد العربي بحجم A4"]')).toHaveAttribute("srcdoc", (await response.json()).html);
      } else {
        await page.getByRole("option", { name: design.name, exact: true }).click();
      }
      assert.equal(
        normalizeText(await previews.locator("body").innerText()),
        baselineText,
      );
      previousDesignId = design.id;
    }
    await page.locator(".editor-grid").evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: path.join(root, "test-results/contracts-legal/editor.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "اعتماد ونشر", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page
      .getByLabel("البحث في الصيغ", { exact: true })
      .fill("صيغة اختبار من واجهة الإدارة");
    const published = page
      .locator("tbody tr")
      .filter({ hasText: "صيغة اختبار من واجهة الإدارة" })
      .first();
    await expect(published).toContainText("مفعلة");
    await published
      .getByRole("button", { name: "إجراءات الصيغة" })
      .click();
    await page.getByText("عرض الإصدارات", { exact: true }).click();
    await page
      .getByRole("button", { name: "مقارنة الإصدارات", exact: true })
      .click();
    await expect(
      page.getByText("الأحكام القانونية متطابقة؛ الاختلافات إدارية فقط.", {
        exact: true,
      }),
    ).toBeVisible();
    const latestVersion = page
      .locator(".v-data-table tbody tr")
      .filter({ hasText: "صيغة اختبار من واجهة الإدارة" })
      .first();
    await latestVersion
      .getByRole("button", { name: "استعادة كإصدار جديد", exact: true })
      .click();
    await expect(
      page.getByText(
        "أنشئ إصدار جديد من النص السابق؛ تحدد المقارنة مسار اعتماده.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "استيراد صيغة", exact: true })
      .click();
    const content = await app.inject({
      url: "/api/legal-content",
      headers: { authorization: "Bearer " + token },
    });
    const approved = content
      .json()
      .find(
        (r: any) =>
          r.contract_type === "rental" &&
          r.property_type === "commercial" &&
          r.publication_status === "active",
      );
    assert(approved);
    await page
      .getByLabel("محتوى الصيغة JSON", { exact: true })
      .fill(JSON.stringify({ revision: approved }));
    await page
      .getByRole("button", { name: "فتح في المحرر", exact: true })
      .click();
    await expect(page.getByLabel("اسم الصيغة", { exact: true })).toHaveValue(
      approved.title,
    );
    await page
      .getByRole("button", { name: "التحقق من الصيغة", exact: true })
      .click();
    await expect(editor).toContainText("تعديل إداري على نص مراجع مسبقاً");
    await page
      .getByLabel("النص القانوني العربي", { exact: true })
      .first()
      .fill(approved.clauses[0].clause_content_ar + " إضافة جوهرية اختبارية");
    await page
      .getByRole("button", { name: "التحقق من الصيغة", exact: true })
      .click();
    await expect(editor).toContainText("تغيير في الأحكام القانونية");
    await expect(
      editor.getByRole("button", { name: "اعتماد ونشر", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("اسم الصيغة", { exact: true }).fill("صيغة جوهرية من الواجهة");
    await page
      .getByRole("button", { name: "إرسال للاعتماد", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page.getByRole("tab", { name: "عقود الإيجار", exact: true }).click();
    await page.getByLabel("البحث في الصيغ", { exact: true }).fill("صيغة جوهرية من الواجهة");
    const pending = page
      .locator(".v-data-table tbody tr")
      .filter({ hasText: "بانتظار المراجعة" })
      .filter({ hasText: "صيغة جوهرية من الواجهة" })
      .first();
    await expect(pending).toBeVisible();
    await expect(
      page.getByText("متابعة طلبات الاعتماد", { exact: true }),
    ).toBeVisible();
    await pending
      .getByRole("button", { name: "إجراءات الصيغة" })
      .click();
    await page.getByText("الموعد والأولوية", { exact: true }).click();
    await page
      .getByLabel("الموعد المستهدف — توقيت بغداد", { exact: true })
      .fill("2026-10-11T10:00");
    await page.getByRole("button", { name: "حفظ الموعد", exact: true }).click();
    // Wait for the closing dialog and its scroll lock to leave before opening
    // another connected overlay in the command bar.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "تنبيهات الصيغ القانونية", exact: true })
      .click();
    await expect(page.locator(".legal-notices")).toContainText("صيغة جوهرية من الواجهة");
    await expect(page.locator(".legal-notices")).toBeInViewport();
    await page
      .getByRole("button", { name: "تعليم الكل كمقروء", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "تعليم الكل كمقروء", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await pending.getByRole("button", { name: "إجراءات الصيغة", exact: true }).click();
    await page.getByText("اعتماد وتفعيل", { exact: true }).click();
    await page
      .getByLabel("ملاحظة القرار", { exact: true })
      .fill("مراجعة صياغة جوهرية اختبارية في قاعدة مؤقتة");
    await page
      .getByRole("button", { name: "تسجيل القرار", exact: true })
      .click();
    await expect(pending).toHaveCount(0);
    const active = page
      .locator(".v-data-table tbody tr")
      .filter({ hasText: "صيغة جوهرية من الواجهة" })
      .first();
    await active.getByRole("button", { name: "إجراءات الصيغة", exact: true }).click();
    await page.getByText("إيقاف الصيغة", { exact: true }).click();
    await page
      .getByLabel("ملاحظة القرار", { exact: true })
      .fill("اختبار إيقاف صيغة معتمدة");
    await page
      .getByRole("button", { name: "تسجيل القرار", exact: true })
      .click();
    const archived = page
      .locator(".v-data-table tbody tr")
      .filter({ hasText: "صيغة جوهرية من الواجهة" })
      .filter({ hasText: "غير مفعلة" })
      .first();
    await expect(archived).toBeVisible();
    await archived.getByRole("button", { name: "إجراءات الصيغة", exact: true }).click();
    await page.getByText("تفعيل الصيغة", { exact: true }).click();
    await page
      .getByLabel("ملاحظة القرار", { exact: true })
      .fill("اختبار تفعيل صيغة معتمدة");
    await page
      .getByRole("button", { name: "تسجيل القرار", exact: true })
      .click();
    await expect(active).toBeVisible();
    await page.screenshot({
      path: path.join(
        root,
        "test-results/contracts-legal/legal-management.png",
      ),
      fullPage: true,
    });
    await page.goto(`${origin}/?contract-test=visual#/contract-templates`);
    await expect(page.locator(".v-expansion-panel")).toHaveCount(12);
    await page.locator(".v-expansion-panel-title").first().click();
    await page.getByLabel("حجم الخط", { exact: true }).fill("16");
    await page.getByLabel("حجم الخط", { exact: true }).press("Tab");
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/contracts/templates/") && response.request().method() === "PUT"),
      page.getByRole("button", { name: "حفظ التصميم", exact: true }).click({ force: true }),
    ]);
    await expect(
      page.getByText("تم حفظ إصدار مرئي جديد.", { exact: true }),
    ).toBeVisible();
    // Review is a dedicated page. The primary controls remain visible on a
    // smaller desktop viewport while exports live in the secondary menu.
    await page.setViewportSize({ width: 1000, height: 700 });
    for (const draft of unprepared) {
      const saved = (await app.inject({ url: "/api/contracts/" + draft.id, headers: { authorization: "Bearer " + token } })).json();
      assert.equal(saved.contract.status, "draft", JSON.stringify(draft));
      assert.equal(saved.contract.contract_type, draft.kind, JSON.stringify(draft));
      await page.goto(`${origin}/?contract-test=review-${draft.id}#/contracts/${draft.id}/review`);
      await expect(page).toHaveURL(new RegExp(`#/contracts/${draft.id}/review$`));
      const toolbar = page.getByRole("toolbar", { name: "إجراءات العقد" });
      await expect(toolbar).toBeVisible();
      await expect(page.getByRole("tab", { name: "المعاينة", exact: true })).toBeVisible();
      await expect(page.getByRole("tab", { name: "المعلومات", exact: true })).toBeVisible();
      await expect(page.getByRole("tab", { name: "الشروط القانونية", exact: true })).toBeVisible();
      await expect(page.getByRole("tab", { name: "سجل الإجراءات", exact: true })).toBeVisible();
      await expect(page.getByText("اتفاق المكتب العقاري لا يغني", { exact: false })).toBeVisible();
      const issue = toolbar.getByRole("button", { name: "حفظ وإصدار العقد", exact: true });
      await expect(issue).toBeEnabled();
      const box = await issue.boundingBox();
      assert(box && box.y >= 0 && box.y + box.height <= 700, "Issue control must be in the viewport");
      await toolbar.getByRole("button", { name: "المزيد من إجراءات العقد", exact: true }).click();
      const [printable] = await Promise.all([page.waitForEvent("download"), page.getByText("تصدير PDF", { exact: true }).click()]);
      assert(printable.suggestedFilename().endsWith("_مسودة.print.html"));
      assert((await fs.readFile((await printable.path())!, "utf8")).includes('data-draft="true"'));
      await toolbar.getByRole("button", { name: "المزيد من إجراءات العقد", exact: true }).click();
      const [word] = await Promise.all([page.waitForEvent("download"), page.getByText("تصدير Word", { exact: true }).click()]);
      assert(word.suggestedFilename().endsWith("_مسودة.docx"), word.suggestedFilename());
      assert((await fs.readFile((await word.path())!)).subarray(0, 2).equals(Buffer.from("PK")));
      if (draft.kind === "rental") {
        const current = await app.inject({ url: "/api/contracts/" + draft.id, headers: { authorization: "Bearer " + token } });
        assert.equal(current.json().contract.payment_info.schedule, "جدول اختبار محفوظ");
      }
      await issue.click();
      await expect(page.frameLocator('iframe[title="معاينة العقد العربي بحجم A4"]').locator("[data-draft]")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "تعديل المسودة", exact: true })).toHaveCount(0);
      await page.getByRole("tab", { name: "سجل الإجراءات", exact: true }).click();
      await expect(page.getByText("إصدار العقد", { exact: true })).toBeVisible();
      await expect(page.getByText("طلب تصدير PDF", { exact: true })).toBeVisible();
    }
    await page.goto(`${origin}/?contract-test=exception-${draftId}#/contracts/${draftId}/review`);
    await page.getByRole("button", { name: "حفظ وإصدار العقد", exact: true }).click();
    await expect(page.getByText("تم إصدار العقد وحفظ نسخته التاريخية.", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "المعلومات", exact: true }).click();
    await page.getByText("متابعة التوقيع والإجراءات اللاحقة", { exact: true }).click();
    await expect(page.getByText("نسخة صادرة للطباعة والتوقيع — التوقيع غير مسجل", { exact: false })).toBeVisible();
    const signingRow = page.getByRole("listitem").filter({ hasText: "تم توقيع الاتفاق" });
    await signingRow.getByRole("button", { name: "تسجيل الإجراء", exact: true }).click();
    await page.getByRole("radio", { name: "مكتمل", exact: true }).check();
    const completedDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await page.getByLabel("تاريخ استكمال الإجراء", { exact: true }).fill(completedDate);
    await page.getByRole("button", { name: "حفظ المتابعة", exact: true }).click();
    await expect(page.getByText("اتفاق موقع — الإجراءات اللاحقة قيد المتابعة", { exact: false })).toBeVisible();
    await page.getByRole("tab", { name: "المعاينة", exact: true }).click();
    const frame = page.frameLocator(
      'iframe[title="معاينة العقد العربي بحجم A4"]',
    );
    await expect(frame.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(frame.locator("[data-draft]")).toHaveCount(0);
    const output = path.join(root, "test-results/contracts-legal");
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, "workflow.png"),
      fullPage: true,
    });
    const printPage = await context.newPage();
    for (const document of documents) {
      await printPage.setContent(document.html, { waitUntil: "load" });
      await printPage.emulateMedia({ media: "print" });
      const pdf = await printPage.pdf({
        path: path.join(output, `${document.code}.pdf`),
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
      assert(pdf.toString("latin1").includes("/Type /Page"));
      const media = pdf
        .toString("latin1")
        .match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
      assert(media);
      assert(
        Math.abs(Number(media[1]) - 595) < 2 &&
          Math.abs(Number(media[2]) - 842) < 2,
        "PDF must be A4",
      );
    }
    assert.deepEqual(errors, []);
    await context.close();
  } catch (error) {
    if (debugPage && !debugPage.isClosed()) {
      await fs.mkdir(path.join(root, "test-results/contracts-legal"), {
        recursive: true,
      });
      await debugPage.screenshot({
        path: path.join(root, "test-results/contracts-legal/failure.png"),
      });
      console.error(
        "UI failure:",
        debugPage.url(),
        errors,
        (await debugPage.locator("body").innerText()).slice(0, 3500),
      );
      console.error("Notification menu bounds", await debugPage.locator(".legal-notices").evaluateAll((elements) => elements.map((element) => ({
        bounds: element.getBoundingClientRect().toJSON(),
        overlay: element.closest(".v-overlay__content")?.getAttribute("style"),
        overlayBox: element.closest(".v-overlay")?.getBoundingClientRect().toJSON(),
        overlayParent: element.closest(".v-overlay")?.parentElement?.outerHTML.slice(0, 500),
        activator: document.querySelector('[aria-label="تنبيهات الصيغ القانونية"]')?.getBoundingClientRect().toJSON(),
        rootBox: document.documentElement.getBoundingClientRect().toJSON(),
        rootStyle: document.documentElement.getAttribute("style"),
        rootScroll: { x: scrollX, y: scrollY },
        pageZoom: { zoom: (document.body as HTMLElement & {currentCSSZoom?:number}).currentCSSZoom, css: getComputedStyle(document.body).zoom, dpr: devicePixelRatio, visual: visualViewport?.scale },
        position: getComputedStyle(element.closest(".v-overlay__content")!).position,
        transform: getComputedStyle(element.closest(".v-overlay__content")!).transform,
        viewport: { width: innerWidth, height: innerHeight },
      }))));
    }
    throw error;
  } finally {
    await browser?.close();
    vite.kill();
  }
}
