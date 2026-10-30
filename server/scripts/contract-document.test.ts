import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";
import {
  TEMPLATE_KEYS,
  amountInWords,
  arabicOrdinal,
  decimalAmountInWords,
  clauseNumbers,
  emptyTerms,
  findIssues,
  formatDuration,
  installmentSchedule,
  numberToArabicWords,
  para,
  pickListing,
  printableHtml,
  rentSchedule,
  resolveValues,
  safeColor,
  safeFontName,
  scheduleFor,
  usedFields,
  type AgreementContext,
  type ContractDocument,
  type TemplateKey,
} from "../src/shared/contract-document/index.js";
import { documentSchema, termsSchema } from "../src/modules/agreements/agreements.schema.js";
import { factoryDocument, withFactoryDesign } from "../src/modules/agreements/agreements.templates.js";
import { renderDocx } from "../src/modules/agreements/agreements.docx.js";

// The contract document model shared by the API and the renderer: number
// words, schedules, field resolution, issue checks, and both renderers.

const party = (id: number, name: string) => ({
  id, code: `P-${id}`, full_name: name, phone_primary: "07701234567", phone_secondary: null, email: null,
  address: null, national_id: "199012345678", residence_card_number: null, governorate: "بغداد", district: "الكرخ",
  neighborhood: "المنصور", alley: "12", house_number: "7", person_type: "individual",
});
const listing = pickListing("property", {
  id: 1, code: "H-0005", name: "عقار H-0005", property_type: "بيت", legal_type: "طابو ملك صرف", area_value: "180.00",
  area_unit: "متر", total_price: "126000000.00", governorate: "بغداد", district: "الكرخ", neighborhood: "اليرموك",
  plot_number: "415", plot_letter: "ج", subdistrict_number: "15", subdistrict_name: "الداودي", owner_name: "x",
  owner_phone: "1", owner_notes: "سري", notes: "سري", owner_person_id: 3,
});
const context: AgreementContext = {
  parties: { seller: party(1, "علي حسين"), buyer: party(2, "زينب كريم"), landlord: party(1, "علي حسين"), tenant: party(2, "زينب كريم") },
  listing,
  company: { company_name: "مكتب دلالي", owner_name: null, phone_primary: "07700000000", phone_secondary: null, email: null, address: "بغداد", additional_contact: null, license_number: null },
};
const terms = {
  ...emptyTerms("2026-10-26"), contract_place: "بغداد", sale_price: 126_000_000, payment_terms: "نقداً",
  delivery_date: "2026-12-15", down_payment: 26_000_000, installment_count: 10, first_due_date: "2027-01-01",
  rent_amount: 750_000, start_date: "2026-11-01", end_date: "2027-10-31", payment_due: "مقدماً",
  permitted_use: "محل ألبسة",
};

test("amounts in Arabic words and clause ordinals", () => {
  assert.equal(numberToArabicWords(0), "صفر");
  assert.equal(numberToArabicWords(1000), "ألف");
  assert.equal(numberToArabicWords(2000), "ألفان");
  assert.equal(numberToArabicWords(3000), "ثلاثة آلاف");
  assert.equal(numberToArabicWords(11000), "أحد عشر ألفاً");
  assert.equal(numberToArabicWords(21), "واحد وعشرون");
  assert.equal(numberToArabicWords(1_500_000), "مليون وخمسمئة ألف");
  assert.equal(numberToArabicWords(350_000_000), "ثلاثمئة وخمسون مليوناً");
  assert.equal(amountInWords(250_000, "IQD"), "فقط مئتان وخمسون ألفاً دينار عراقي لا غير");
  assert.equal(decimalAmountInWords("1500000.50", "IQD"), "فقط مليون وخمسمئة ألف دينار عراقي وخمسون فلساً لا غير");
  assert.equal(decimalAmountInWords("250.05", "USD"), "فقط مئتان وخمسون دولار أمريكي وخمسة سنتات لا غير");
  assert.equal(decimalAmountInWords("750000.00", "IQD"), "فقط سبعمئة وخمسون ألفاً دينار عراقي لا غير");
  // Past 2^53, where a number would lose units: read from the digits.
  assert.equal(
    decimalAmountInWords("9007199254740993.00", "IQD"),
    "فقط تسعة كوادريليونات وسبعة ترليونات ومئة وتسعة وتسعون ملياراً ومئتان وأربعة وخمسون مليوناً وسبعمئة وأربعون ألفاً وتسعمئة وثلاثة وتسعون دينار عراقي لا غير",
  );
  assert.equal(arabicOrdinal(1), "الأول");
  assert.equal(arabicOrdinal(11), "الحادي عشر");
  assert.equal(arabicOrdinal(21), "الحادي والعشرون");
});

test("durations, installments and rent payments", () => {
  assert.equal(formatDuration("2026-11-01", "2027-10-31"), "سنة واحدة");
  assert.equal(formatDuration("2026-01-01", "2026-07-01"), "6 أشهر");
  assert.equal(formatDuration("2026-01-01", "2027-07-01"), "سنة و6 أشهر");
  assert.equal(formatDuration("2026-01-01", "2026-01-15"), "14 يوماً");
  const installments = installmentSchedule(terms);
  assert.equal(installments.length, 10);
  assert.equal(installments.reduce((sum, row) => sum + row.amount, 0), 100_000_000);
  assert.equal(installments.at(-1)!.due_date, "2027-10-01");
  // Rounding goes to the last installment.
  const odd = installmentSchedule({ ...terms, sale_price: 100, down_payment: 0, installment_count: 3 });
  assert.deepEqual(odd.map((row) => row.amount), [33, 33, 34]);
  assert.equal(rentSchedule(terms).length, 12);
  assert.equal(rentSchedule({ ...terms, rent_period: "annual" }).length, 1);
  assert.equal(scheduleFor("sale", terms).length, 0);
});

test("fields resolve from the linked records and terms, never from notes", () => {
  const values = resolveValues({ template: "installment_sale", number: "CT-0001", revision: 1 }, context, terms);
  assert.equal(values["seller.full_name"], "علي حسين");
  assert.equal(values["seller.address"], "بغداد، الكرخ، المنصور، زقاق 12، دار 7");
  assert.equal(values["property.area"], "180 متر مربع");
  assert.equal(values["property.plot"], "415 ج");
  assert.equal(values["sale.price"], "126,000,000 دينار عراقي");
  assert.equal(values["installment.remaining"], "100,000,000 دينار عراقي");
  assert.equal(values["installment.last_due"], "2027/10/01");
  assert.equal(values["contract.date"], "2026/10/26");
  assert.equal(values["property.title"], undefined, "an unnamed listing has no title");
  assert.ok(!Object.values(values).includes("سري"), "notes never reach a contract");
  const rent = resolveValues({ template: "residential_rent", number: "CT-2", revision: 1 }, context, terms);
  assert.equal(rent["rent.duration"], "سنة واحدة");
  assert.equal(rent["rent.payments_count"], "12");
  assert.equal(rent["sale.price"], undefined);
});

test("the four factory templates are valid, distinct documents", () => {
  assert.deepEqual([...TEMPLATE_KEYS], ["sale", "installment_sale", "residential_rent", "commercial_rent"]);
  for (const key of TEMPLATE_KEYS) {
    const document = factoryDocument(key);
    const parsed = documentSchema.safeParse(document);
    assert.ok(parsed.success, `${key}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`);
    assert.equal(document.blocks.filter((block) => block.type === "clauses").length, 1);
    // Every field a template uses is one that template offers.
    const values = resolveValues({ template: key, number: "CT-1", revision: 1 }, context, termsSchema.parse(terms));
    const issues = findIssues(key, document, context, termsSchema.parse(terms), values);
    assert.deepEqual(issues.filter((issue) => issue.code === "UNKNOWN_FIELD"), [], key);
  }
  // A factory copy is mutable and does not change the factory.
  const copy = factoryDocument("sale");
  copy.clauses[0]!.title = para("معدّل");
  assert.notDeepEqual(factoryDocument("sale").clauses[0]!.title, copy.clauses[0]!.title);
});

test("restoring the default design keeps the clauses", () => {
  const custom: ContractDocument = factoryDocument("sale");
  custom.theme = { ...custom.theme, font_size: 16, accent: "#880000" };
  custom.clauses = custom.clauses.slice(0, 2);
  const restored = withFactoryDesign("sale", custom);
  assert.equal(restored.theme.font_size, factoryDocument("sale").theme.font_size);
  assert.equal(restored.clauses.length, 2);
});

test("issuing needs both parties, the property, the terms and every shown field", () => {
  const template: TemplateKey = "installment_sale";
  const document = factoryDocument(template);
  const empty: AgreementContext = { parties: {}, listing: null, company: context.company };
  const blank = emptyTerms(null);
  const missing = findIssues(template, document, empty, blank, resolveValues({ template, number: "CT-1", revision: 1 }, empty, blank));
  for (const code of ["PARTY_MISSING", "PROPERTY_MISSING", "TERM_MISSING", "FIELD_EMPTY"])
    assert.ok(missing.some((issue) => issue.code === code), code);
  const full = termsSchema.parse(terms);
  const complete = findIssues(template, document, context, full, resolveValues({ template, number: "CT-1", revision: 1 }, context, full));
  assert.deepEqual(complete, []);
  // A field of another contract type cannot be issued.
  document.clauses[0]!.body = [[{ type: "field", key: "rent.amount" }]];
  assert.ok(findIssues(template, document, context, full, {}).some((issue) => issue.code === "UNKNOWN_FIELD"));
  // Hidden clauses are not checked.
  document.clauses[0]!.hidden = true;
  assert.ok(!usedFields(document).some((use) => use.clause_id === document.clauses[0]!.id));
});

test("clause numbering skips hidden and unnumbered clauses", () => {
  const document = factoryDocument("sale");
  document.clauses[1]!.hidden = true;
  document.clauses[2]!.numbered = false;
  const labels = clauseNumbers(document.clauses, document.clause_settings);
  assert.equal(labels.get(document.clauses[0]!.id), "البند الأول");
  assert.equal(labels.get(document.clauses[3]!.id), "البند الثاني");
  assert.equal(labels.has(document.clauses[2]!.id), false);
});

test("printable HTML escapes text and carries no script", () => {
  const document = factoryDocument("sale");
  document.clauses[0]!.body = [[{ type: "text", text: '<script>alert(1)</script> & "x"' }]];
  document.theme.font_family = 'Evil"}body{display:none';
  const html = printableHtml(document, { template: "sale", values: { "contract.title": "<b>x</b>" }, missing: "blank", logo: "javascript:alert(1)", schedule: [], watermark: "مسودة" }, { title: "<t>" });
  assert.ok(!/<script/i.test(html));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes('class="dc-watermark"'));
  assert.equal(safeFontName('Evil"}body{display:none'), "Evilbodydisplaynone");
  assert.equal(safeColor("red;background:url(x)"), null);
  assert.equal(safeColor("#1f4e5f"), "#1f4e5f");
});

/** The named entries of a zip, read from its central directory. */
function zipEntries(buffer: Buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extra = buffer.readUInt16LE(offset + 30);
    const comment = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(dataStart, dataStart + size);
    entries.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
    offset += 46 + nameLength + extra + comment;
  }
  return entries;
}

test("the Word file is a real document with right-to-left paragraphs and tables", async () => {
  const document = factoryDocument("installment_sale");
  document.clauses[0]!.body = [[{ type: "text", text: "نص <خاص> & مهم" }]];
  const full = termsSchema.parse(terms);
  const values = resolveValues({ template: "installment_sale", number: "CT-0001", revision: 1 }, context, full);
  const buffer = await renderDocx(
    document,
    { template: "installment_sale", values, missing: "blank", logo: null, schedule: scheduleFor("installment_sale", full), watermark: null },
    { title: "عقد", number: "CT-0001" },
  );
  const entries = zipEntries(buffer);
  for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/footer1.xml", "word/_rels/document.xml.rels"])
    assert.ok(entries.has(part), part);
  const xml = entries.get("word/document.xml")!;
  assert.ok(xml.includes("<w:bidi/>"));
  assert.ok(xml.includes("<w:tbl>") && xml.includes("<w:bidiVisual/>"));
  assert.ok(xml.includes("نص &lt;خاص&gt; &amp; مهم"));
  assert.ok(xml.includes("علي حسين"));
  // Ten installment rows plus the header row.
  assert.ok((xml.match(/2027\/\d\d\/01/g) ?? []).length >= 10);
  assert.ok(entries.get("word/footer1.xml")!.includes('w:instr=" PAGE "'));
});
