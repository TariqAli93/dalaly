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
    await row.getByRole("button", { name: "تعديل", exact: true }).click();
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
    for (const design of templates.json()) {
      await page
        .getByRole("combobox", { name: "التصميم المرئي", exact: true })
        .press("Enter");
      const changed = previousDesignId !== design.id;
      const response = changed
        ? page.waitForResponse(
            (r) =>
              r.url().endsWith("/legal-content/preview") &&
              r.request().method() === "POST" &&
              r.request().postDataJSON().visual_id === design.id,
          )
        : null;
      await page
        .getByRole("option", { name: design.name, exact: true })
        .click();
      if (response) {
        const result = await response;
        assert.equal(result.status(), 200);
        await expect(
          page.locator('iframe[title="معاينة العقد العربي بحجم A4"]'),
        ).toHaveAttribute("srcdoc", (await result.json()).html);
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
    await expect(published).toContainText("نشطة");
    await published
      .getByRole("button", { name: "المزيد من إجراءات الصيغة" })
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
    await expect(editor).toContainText("تغيير قانوني جوهري يحتاج مراجعة مختصة");
    await expect(
      editor.getByRole("button", { name: "اعتماد ونشر", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "إرسال للاعتماد", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page.getByRole("tab", { name: "عقود الإيجار", exact: true }).click();
    const pending = page
      .locator(".v-data-table tbody tr")
      .filter({ hasText: "تحتاج مراجعة مختصة" })
      .filter({ hasText: approved.title })
      .first();
    await expect(pending).toBeVisible();
    await expect(
      page.getByText("متابعة طلبات الاعتماد", { exact: true }),
    ).toBeVisible();
    await pending
      .getByRole("button", { name: "المزيد من إجراءات الصيغة" })
      .click();
    await page.getByText("الموعد والأولوية", { exact: true }).click();
    await page
      .getByLabel("الموعد المستهدف — توقيت بغداد", { exact: true })
      .fill("2026-10-11T10:00");
    await page.getByRole("button", { name: "حفظ الموعد", exact: true }).click();
    await page
      .getByRole("button", { name: "تنبيهات الصيغ القانونية", exact: true })
      .click();
    await expect(page.locator(".legal-notices")).toContainText(approved.title);
    await page
      .getByRole("button", { name: "تعليم الكل كمقروء", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "تعليم الكل كمقروء", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await pending
      .getByRole("button", { name: "اعتماد المراجعة", exact: true })
      .click();
    await page
      .getByLabel("ملاحظة القرار", { exact: true })
      .fill("مراجعة صياغة جوهرية اختبارية في قاعدة مؤقتة");
    await page
      .getByRole("button", { name: "تسجيل القرار", exact: true })
      .click();
    await expect(pending).toHaveCount(0);
    const active = page
      .locator(".v-data-table tbody tr")
      .filter({ hasText: approved.title })
      .filter({ hasText: "نشطة" })
      .first();
    await active.getByRole("button", { name: "إيقاف", exact: true }).click();
    await page
      .getByLabel("ملاحظة القرار", { exact: true })
      .fill("اختبار إيقاف صيغة معتمدة");
    await page
      .getByRole("button", { name: "تسجيل القرار", exact: true })
      .click();
    const archived = page
      .locator(".v-data-table tbody tr")
      .filter({ hasText: approved.title })
      .filter({ hasText: "مؤرشفة" })
      .first();
    await expect(archived).toBeVisible();
    await archived.getByRole("button", { name: "تفعيل", exact: true }).click();
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
    await page
      .getByRole("button", { name: "حفظ التصميم", exact: true })
      .click();
    await expect(
      page.getByText("تم حفظ إصدار مرئي جديد.", { exact: true }),
    ).toBeVisible();
    // Keep export/approval controls inside a desktop-sized viewport even while
    // the long document body is scrolled; unapproved drafts remain exportable.
    await page.setViewportSize({ width: 1000, height: 700 });
    for (const draft of unprepared) {
      await page.goto(
        `${origin}/?contract-test=unprepared-${draft.kind}#/contracts?view=${draft.id}`,
      );
      const toolbar = page.getByRole("toolbar", { name: "إجراءات العقد" });
      await expect(toolbar).toBeVisible();
      await expect(
        toolbar.getByRole("button", {
          name: "مراجعة الشروط الاستثنائية",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        toolbar.getByRole("button", {
          name: "إصدار العقد المعتمد",
          exact: true,
        }),
      ).toBeDisabled();
      for (const name of ["تصدير PDF", "تصدير Word", "إصدار العقد المعتمد"]) {
        const box = await toolbar
          .getByRole("button", { name, exact: true })
          .boundingBox();
        assert(
          box && box.y >= 0 && box.y + box.height <= 700,
          `${name} must be in the viewport`,
        );
      }
      const [printable] = await Promise.all([
        page.waitForEvent("download"),
        toolbar.getByRole("button", { name: "تصدير PDF", exact: true }).click(),
      ]);
      assert(printable.suggestedFilename().endsWith("_مسودة.print.html"));
      assert(
        (await fs.readFile((await printable.path())!, "utf8")).includes(
          'data-draft="true"',
        ),
      );
      await expect(
        toolbar.getByRole("button", { name: "تصدير Word", exact: true }),
      ).toBeEnabled();
      const [word] = await Promise.all([
        page.waitForEvent("download"),
        toolbar
          .getByRole("button", { name: "تصدير Word", exact: true })
          .click(),
      ]);
      assert(word.suggestedFilename().endsWith("_مسودة.docx"));
      assert(
        (await fs.readFile((await word.path())!))
          .subarray(0, 2)
          .equals(Buffer.from("PK")),
      );
      await page
        .getByRole("link", { name: "إدارة واعتماد الصيغ", exact: true })
        .click();
      await expect(
        page.getByRole("tab", {
          name: draft.kind === "rental" ? "عقود الإيجار" : "عقود البيع",
        }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.locator("tbody tr").filter({ hasText: "house" }),
      ).not.toHaveCount(0);
      await page
        .getByRole("link", { name: "العودة إلى العقد", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "تجهيز المسودة بالصيغ المعتمدة",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "مراجعة العقد قبل الإصدار",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "حفظ تعديل المسودة", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "مراجعة الشروط الاستثنائية",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "إصدار العقد المعتمد", exact: true }),
      ).toBeEnabled();
      if (draft.kind === "rental") {
        const current = await app.inject({
          url: "/api/contracts/" + draft.id,
          headers: { authorization: "Bearer " + token },
        });
        assert.equal(
          current.json().contract.payment_info.schedule,
          "جدول اختبار محفوظ",
        );
      }
      await page
        .getByRole("button", { name: "إصدار العقد المعتمد", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "مراجعة الشروط الاستثنائية",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page
          .frameLocator('iframe[title="معاينة العقد العربي بحجم A4"]')
          .locator("[data-draft]"),
      ).toHaveCount(0);
    }
    await page.goto(
      `${origin}/?contract-test=issue#/contracts?view=${draftId}`,
    );
    await page
      .getByRole("button", { name: "مراجعة الشروط الاستثنائية", exact: true })
      .click();
    await page
      .getByLabel("نتيجة مراجعة المحامي وأسباب انطباق الصيغ")
      .fill("مراجعة واجهة اختبار فقط لبيانات العقد");
    await page
      .getByRole("button", { name: "تسجيل اعتماد العقد", exact: true })
      .click();
    await page
      .getByRole("button", { name: "إصدار العقد المعتمد", exact: true })
      .click();
    await expect(
      page.getByText("تم إصدار العقد وحفظ نسخته التاريخية.", { exact: true }),
    ).toBeVisible();
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
    }
    throw error;
  } finally {
    await browser?.close();
    vite.kill();
  }
}
