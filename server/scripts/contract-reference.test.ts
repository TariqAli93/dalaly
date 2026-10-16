import assert from "node:assert/strict";
import { test } from "node:test";
import { documentText } from "../src/modules/contracts/legal-content.engine.js";
import { htmlEscape, renderVisual } from "../src/modules/contracts/contract-visual.engine.js";
import { referenceFixture, referenceVisual } from "./fixtures/contract-reference.js";

test("reference design preserves all legal text, facts, amounts and document models for both domains", () => {
  for (const kind of ["sale", "rental"] as const) {
    const model = referenceFixture(kind, true), before = structuredClone(model);
    const result = renderVisual(model, referenceVisual());
    assert.deepEqual(model, before);
    assert.equal(result.content, `مسودة — لم يتم إصدار العقد\n\n${documentText(model)}`);
    assert(result.html.includes(kind === "rental" ? "عقد إيجار عقار" : "عقد بيع عقار"));
    assert(result.html.includes('data-renderer-version="2"'));
    for (const section of model.sections) for (const clause of section.clauses) {
      assert(result.html.includes(htmlEscape(clause.text)));
      assert(result.html.includes(htmlEscape(clause.title)));
    }
    for (const row of [...model.data.financial, ...model.data.dates, ...model.data.assets.flatMap((a) => a.details)]) assert(result.html.includes(htmlEscape(row.value)));
    for (const party of model.data.parties) for (const value of [party.name, party.phone, party.address, party.identity_number, party.residence_card_number]) assert(result.html.includes(htmlEscape(value)));
    const reversed = structuredClone(model);
    reversed.data.parties.reverse();
    assert.equal(renderVisual(reversed, referenceVisual()).html, result.html);
    assert.equal((result.html.match(/class="section-number"/g) ?? []).length, 6);
    assert.equal((result.html.match(/class="signature-panel /g) ?? []).length, 3);
    assert(result.html.includes(htmlEscape(model.data.explanation)));
    assert(!result.html.includes('class="property-photo"'));
    assert(!result.html.includes('qr-code'));
  }
});

test("legacy renderer snapshots remain compatible and visual settings remain validated", () => {
  const model = referenceFixture("sale");
  const legacy = renderVisual(model, { ...referenceVisual(), renderer_version: 1 });
  assert(!legacy.html.includes('data-renderer-version="2"'));
  assert(legacy.html.includes(`<h1>${model.data.title}</h1>`));
  assert.equal(legacy.content, renderVisual(model, referenceVisual()).content);
  const varied = renderVisual(model, referenceVisual({ font: "Arial", font_size: 20, margin_mm: 25, line_height: 2.5, accent_color: "#123456", signature_style: "stacked" }));
  assert(varied.html.includes("margin:25mm"));
  assert(varied.html.includes("#123456"));
  assert(varied.html.includes("font-size:20px"));
  assert.throws(() => renderVisual(model, { ...referenceVisual(), layout_config: { ...referenceVisual().layout_config, accent_color: 'red;}</style><script>' } }));
});

test("dynamic text and media cannot introduce HTML, remote images, scripts or forged QR verification", () => {
  const model = referenceFixture("rental");
  model.data.office.name = '</style><script>window.attacked=true</script>';
  model.data.office.logo_data_uri = 'data:image/svg+xml;base64,PHN2Zz4=';
  model.data.assets[0].image_data_uri = "https://example.test/remote.png";
  model.sections[0].clauses[0].text = '<script>alert(1)</script> & " محفوظ نصياً';
  const { html } = renderVisual(model, referenceVisual());
  assert(!html.includes("<script>"));
  assert(html.includes("&lt;script&gt;"));
  assert(!html.includes('<img'));
  assert(html.includes("default-src 'none'"));
  assert(html.includes("img-src data:"));
});

if (process.env.CONTRACT_REFERENCE_BROWSER_TEST === "1") {
  test("reference sale/rental layouts, long clauses and A4 PDFs in Chromium and Electron", async () => {
    const { captureReferenceContracts } = await import("./contracts-reference-capture.js");
    await captureReferenceContracts();
  });
}
