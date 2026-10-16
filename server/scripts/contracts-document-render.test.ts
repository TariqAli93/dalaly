import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import AdmZip from "adm-zip";
import { config } from "../src/infrastructure/config.js";
import { DEFAULT_DOCX } from "../src/modules/contracts/default-docx.assets.js";
import { fillDocx, annotateDocx } from "../src/modules/contracts/docx.engine.js";
import { expandDocumentValues } from "../src/modules/contracts/document-generation.service.js";
import { officeRenderer, renderDocxPdf } from "../src/modules/contracts/docx-render.service.js";
test("local office engine renders sale, rental and landscape templates; Electron prints the produced PDF", async t => {
  assert(await officeRenderer(), "Run pnpm prepare:documents before testing document rendering");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dalaly-document-render-"));
  const previous = config.documentsDir; config.documentsDir = path.join(root, "documents");
  const output = path.resolve("../test-results/document-rendering");
  await fs.mkdir(output, { recursive: true });
  const values = expandDocumentValues({
    "seller.full_name": "أحمد صالح البغدادي", "buyer.full_name": "علي حسن الكرخي", "lessor.full_name": "أحمد صالح البغدادي", "lessee.full_name": "علي حسن الكرخي",
    "office.name": "مكتب دلالي للاختبار", "office.address": "بغداد — المنصور", "office.phone": "07700000000", "contract.code": "TEST-2026", "contract.date": "2026/10/12", "contract.start_date": "2026/10/12", "contract.end_date": "2027/10/12", "contract.amount": "1000000", "contract.paid_amount": "200000", "contract.remaining_amount": "800000",
    parties_summary: "البائع: أحمد صالح البغدادي\nالمشتري: علي حسن الكرخي", assets_summary: "بيت اختبار\nالعنوان: بغداد\nالمساحة: ٢٠٠ متر", legal_formulation: "بند أول عربي للاختبار\nبند ثان يحافظ على التنسيق", additional_conditions: "شروط إضافية متفق عليها", agreement_terms: "شروط الدفع: حسب الاتفاق", witnesses: "الشاهد الأول: محمد", office_role: "الوسيط العقاري",
  });
  const documents: Array<{ html: string; code: string; pdf: string }> = [];
  try {
    for (const kind of ["sale", "rental"]) {
      const docx = fillDocx(Buffer.from(DEFAULT_DOCX[kind], "base64"), values);
      const pdf = await renderDocxPdf(docx);
      assert(pdf.subarray(0, 5).equals(Buffer.from("%PDF-")));
      await fs.writeFile(path.join(output, `${kind}.docx`), docx); await fs.writeFile(path.join(output, `${kind}.pdf`), pdf);
      assert.deepEqual(await renderDocxPdf(docx), pdf, "cache returns the same rendered bytes");
      const canceled = await renderDocxPdf(annotateDocx(docx, "ملغى — نسخة أرشيفية"));
      assert(!pdf.equals(canceled));
      documents.push({ html: '<!doctype html><html dir="rtl"><meta charset="utf-8"><style>@page{size:A4}body{font-family:Arial}</style><body>اختبار عربي</body></html>', code: kind, pdf: pdf.toString("base64") });
    }
    const complex = await fs.readFile("scripts/fixtures/complex-contract.docx");
    const landscape = await renderDocxPdf(fillDocx(complex, values));
    await fs.writeFile(path.join(output, "landscape.pdf"), landscape);
    const poppler = process.env.PDFINFO_PATH ?? "C:/Users/dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdfinfo.exe";
    try {
      const { stdout } = await promisify(execFile)(poppler, [path.join(output, "landscape.pdf")], { windowsHide: true });
      assert.match(stdout, /Page size:\s+841[\d.]* x 595[\d.]*/);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (process.env.DOCUMENT_ELECTRON_TEST === "1") {
      const { verifyElectronContracts } = await import("./contracts-electron.js");
      await t.test("isolated Electron bridge preserves PDF bytes and print cancellation", () => verifyElectronContracts(documents, root, output));
    }
  } finally { config.documentsDir = previous; await fs.rm(root, { recursive: true, force: true }); }
});
