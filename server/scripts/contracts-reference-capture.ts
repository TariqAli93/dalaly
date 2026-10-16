import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { renderVisual } from "../src/modules/contracts/contract-visual.engine.js";
import { DOCUMENT_PROCEDURE_NOTE } from "../src/modules/contracts/legal-content.engine.js";
import { referenceFixture, referenceVisual } from "./fixtures/contract-reference.js";
import { verifyElectronContracts } from "./contracts-electron.js";

export async function captureReferenceContracts() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const output = path.join(root, "test-results/contracts-reference");
  await fs.mkdir(output, { recursive: true });
  const cases = [
    { name: "reference-sale", model: referenceFixture("sale"), visual: referenceVisual() },
    { name: "reference-rental", model: referenceFixture("rental"), visual: referenceVisual() },
    { name: "reference-sale-long", model: referenceFixture("sale", true), visual: referenceVisual() },
    { name: "reference-rental-long", model: referenceFixture("rental", true), visual: referenceVisual() },
    { name: "reference-large-font", model: referenceFixture("sale", true), visual: referenceVisual({ font_size: 20, line_height: 2.5, margin_mm: 25 }) },
    { name: "reference-multiple-assets", model: referenceFixture("sale"), visual: referenceVisual({ margin_mm: 18 }) },
  ];
  const rentalLong = cases[3].model;
  rentalLong.data.procedure_labels = ["توقيع الاتفاق — متابعة تجريبية", "استكمال الإجراء لدى الجهة المختصة — متابعة تجريبية"];
  rentalLong.data.witnesses = [{ name: "اسم شاهد تجريبي أول" }, { name: "اسم شاهد تجريبي ثان" }];
  rentalLong.data.agreement_terms = [{ label: "شروط الإشغال", value: "تفاصيل تجريبية محفوظة دون إعادة صياغة. AGREEMENT-END" }];
  cases[4].model.data.assets[0].details.push({ label: "وصف العقار", value: `${"وصف تجريبي طويل لاختبار تقسيم الصفوف بين الصفحات. ".repeat(55)}ASSET-DESCRIPTION-END` });
  cases[4].model.data.parties[0].address = "عنوان طويل لاختبار التفاف النص وحفظ البيانات ".repeat(10);
  cases[5].model.data.assets = Array.from({ length: 4 }, (_, i) => ({ ...structuredClone(cases[5].model.data.assets[0]), id: i + 1 }));
  const browser = await chromium.launch({ headless: true });
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dalaly-reference-test-"));
  const documents: Array<{ html: string; code: string }> = [];
  const manifest: Array<Record<string, unknown>> = [];
  try {
    const context = await browser.newContext({ viewport: { width: 850, height: 1200 } });
    await context.addInitScript("window.__name = (fn) => fn;");
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const item of cases) {
      const { html } = renderVisual(item.model, item.visual);
      await fs.writeFile(path.join(output, `${item.name}.html`), html);
      await page.emulateMedia({ media: "screen" });
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready.then(() => true));
      assert.equal(await page.locator("h1").innerText(), item.model.data.contract_type === "rental" ? "عقد إيجار عقار" : "عقد بيع عقار");
      assert.equal(await page.locator(".clause-body").first().textContent(), item.model.sections[0].clauses[0].text);
      for (const clause of item.model.sections.flatMap((s) => s.clauses)) {
        assert.equal(await page.locator(`[data-clause-code="${clause.code}"] .clause-body`).textContent(), clause.text);
      }
      if (item.model.data.procedure_labels) assert((await page.locator(".procedure-note").textContent()) === DOCUMENT_PROCEDURE_NOTE);
      const overflow = await page.evaluate(() => {
        const paper = document.querySelector(".paper")!;
        const bounds = paper.getBoundingClientRect();
        const inset = parseFloat(getComputedStyle(paper).paddingLeft);
        return [...document.querySelectorAll(".metadata,.office-name,.party-card,.asset-card,.financial-card,.clause-body,.attachments,.signature-panel")]
          .filter((element) => { const box = element.getBoundingClientRect(); return box.left < bounds.left + inset - 2 || box.right > bounds.right - inset + 2; })
          .map((element) => element.className);
      });
      assert.deepEqual(overflow, [], `${item.name}: horizontal overflow`);
      await page.screenshot({ path: path.join(output, `${item.name}.png`), fullPage: true });
      await page.emulateMedia({ media: "print" });
      const pdf = await page.pdf({ path: path.join(output, `${item.name}.pdf`), printBackground: true, preferCSSPageSize: true, format: "A4" });
      const boxes = [...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
      assert(boxes.length > 0);
      assert(boxes.every((box) => Math.abs(Number(box[1]) - 595) < 2 && Math.abs(Number(box[2]) - 842) < 2));
      documents.push({ html, code: item.name });
      const sentinels = item.model.sections.flatMap((section) => section.clauses.map((_c, i) => `CLAUSE-${i + 1}-END`));
      manifest.push({ name: item.name, expected_sentinels: [...sentinels, "EXTRA-END", ...(item.name === "reference-large-font" ? ["ASSET-DESCRIPTION-END"] : []), ...(item.name === "reference-rental-long" ? ["AGREEMENT-END"] : [])], legal_clause_count: sentinels.length });
    }
    assert.deepEqual(errors, []);
    await context.close();
    await verifyElectronContracts(documents, temporary, output);
    await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  } finally {
    await browser.close();
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    assert(path.basename(temporary).startsWith("dalaly-reference-test-"));
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
