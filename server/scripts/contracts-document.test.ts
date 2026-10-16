import assert from "node:assert/strict";
import { test } from "node:test";
import AdmZip from "adm-zip";
import { DEFAULT_DOCX } from "../src/modules/contracts/default-docx.assets.js";
import { fillDocx, inspectDocx, openDocx, decodeUpload, parseXml, validateContractVariables } from "../src/modules/contracts/docx.engine.js";
import { expandDocumentValues } from "../src/modules/contracts/document-generation.service.js";
import { importFormulation } from "../src/modules/contracts/formulations.service.js";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function complexFixture() {
  const zip = new AdmZip(Buffer.from(DEFAULT_DOCX.sale, "base64"));
  zip.updateFile("word/document.xml", Buffer.from(`<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>
    <w:p><w:pPr><w:bidi/><w:spacing w:after="360"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="0055FF"/><w:rFonts w:ascii="Arial" w:cs="Arial"/><w:sz w:val="32"/></w:rPr><w:t>بداية {{sell</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>er_name}} / {{buyer_name}} نهاية</w:t></w:r></w:p>
    <w:tbl><w:tblPr><w:tblBorders><w:top w:val="double" w:sz="8"/></w:tblBorders></w:tblPr><w:tr><w:tc><w:p><w:r><w:t>{{contract_</w:t></w:r><w:r><w:t>amount}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:t>{{legal_formulation}}</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p><w:r><w:t>توقيع: _________________</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="920" w:right="700" w:left="700" w:bottom="920"/></w:sectPr>
    </w:body></w:document>`));
  for (const part of ["header1", "footer1"]) zip.updateFile(`word/${part}.xml`, Buffer.from(`<w:${part === "header1" ? "hdr" : "ftr"} xmlns:w="${W}"><w:p><w:r><w:t>{{contract_</w:t></w:r><w:r><w:t>date}}</w:t></w:r></w:p></w:${part === "header1" ? "hdr" : "ftr"}>`));
  zip.addFile("word/media/logo.png", Buffer.from("unchanged-logo-bytes"));
  return zip.toBuffer();
}
test("DOCX replacement spans runs, tables, headers and footers without replacing layout or resources", () => {
  const original = complexFixture();
  const before = new AdmZip(original);
  const values = expandDocumentValues({ "seller.full_name": "علي & حسن <اسم>", "buyer.full_name": "خالد", "contract.amount": "120000", "contract.date": "2026/10/12", legal_formulation: "بند أول\nبند ثان" });
  const result = fillDocx(original, values), after = new AdmZip(result);
  const main = after.readAsText("word/document.xml");
  assert(main.includes("علي &amp; حسن &lt;اسم&gt;"));
  assert(main.includes("خالد نهاية"));
  assert(main.includes("120000"));
  assert(main.includes("<w:br/>"));
  assert(!main.includes("{{"));
  for (const pattern of ['w:orient="landscape"', 'w:top="920"', 'w:val="double"', 'w:val="0055FF"', 'w:after="360"', '<w:br w:type="page"/>', 'توقيع: _________________']) assert(main.includes(pattern), pattern);
  for (const entry of before.getEntries().filter(e => !/^word\/(document|header1|footer1)\.xml$/.test(e.entryName))) assert.deepEqual(after.getEntry(entry.entryName)!.getData(), entry.getData(), entry.entryName);
  for (const part of ["header1", "footer1"]) { assert(after.readAsText(`word/${part}.xml`).includes("2026/10/12")); assert(!after.readAsText(`word/${part}.xml`).includes("{{")); }
  assert.deepEqual(inspectDocx(original, true).variables.sort(), ["seller_name", "buyer_name", "contract_amount", "legal_formulation", "contract_date"].sort());
  parseXml(main);
});
test("multiple placeholders in one run, XML entities and alternate namespace prefixes", () => {
  const zip = new AdmZip(Buffer.from(DEFAULT_DOCX.sale, "base64"));
  zip.updateFile("word/document.xml", Buffer.from(`<q:document xmlns:q="${W}"><q:body><q:p><q:r><q:t>A {{seller_name}} &amp; {{seller_name}} B {{buyer_name}}</q:t></q:r></q:p><q:p><q:r><q:t>{{legal_formulation}}</q:t></q:r></q:p></q:body></q:document>`));
  const filled = fillDocx(zip.toBuffer(), expandDocumentValues({ "seller.full_name": "X", "buyer.full_name": "Y", legal_formulation: "تم" }));
  assert(new AdmZip(filled).readAsText("word/document.xml").includes("A X &amp; X B Y"));
});
test("invalid, active and oversized DOCX packages fail safely", () => {
  for (const value of [Buffer.alloc(0), Buffer.from("P"), Buffer.from("PKnotzip")]) assert.throws(() => openDocx(value));
  assert.throws(() => decodeUpload("not-base64!"));
  const modify = (name: string, content: string) => { const zip = new AdmZip(Buffer.from(DEFAULT_DOCX.sale, "base64")); zip.addFile(name, Buffer.from(content)); return zip.toBuffer(); };
  assert.throws(() => openDocx(modify("word/vbaProject.bin", "macro")), /ماكرو/);
  assert.throws(() => openDocx(modify("word/activeX/control.xml", "<a/>")), /ماكرو/);
  assert.throws(() => openDocx(modify("word/media/active.svg", '<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///private"/></svg>')), /خارجية/);
  assert.throws(() => openDocx(modify("word/huge.txt", "a".repeat(17 * 1024 * 1024))), /فك الضغط/);
  assert.throws(() => openDocx(modify("word/_rels/evil.xml.rels", '<Relationships><Relationship TargetMode="External" Target="http://evil.invalid"/></Relationships>')), /خارجية/);
  assert.throws(() => openDocx(modify("word/_rels/evil.xml.rels", '<Relationships><Relationship Target="../../private"/></Relationships>')), /حزمة DOCX/);
  assert.throws(() => openDocx(modify("word/header9.xml", `<w:hdr xmlns:w="${W}"><w:p><w:fldSimple w:instr="DDEAUTO cmd.exe"/></w:p></w:hdr>`)), /حقول المستند/);
  assert.throws(() => openDocx(modify("word/header9.xml", `<w:hdr xmlns:w="${W}"><w:p><w:r><w:instrText>DD</w:instrText></w:r><w:r><w:instrText>EAUTO cmd.exe</w:instrText></w:r></w:p></w:hdr>`)), /حقول المستند/);
  assert.throws(() => openDocx(modify("word/header9.xml", '<!DOCTYPE w [<!ENTITY x SYSTEM "file:///private">]><w/>')), /كيانات/);
  assert.throws(() => inspectDocx(modify("word/header9.xml", `<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>{{unknown_key}}</w:t></w:r></w:p></w:hdr>`)), /غير معروف/);
  assert.throws(() => parseXml("<a>".repeat(130) + "</a>".repeat(130)), /متداخلة/);
  const zip = new AdmZip(Buffer.from(DEFAULT_DOCX.sale, "base64"));
  zip.updateFile("word/document.xml", Buffer.from(`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>{{seller_</w:t></w:r></w:p><w:p><w:r><w:t>name}}</w:t></w:r></w:p></w:body></w:document>`));
  assert.throws(() => inspectDocx(zip.toBuffer()), /متغير ناقص/);
  assert.throws(() => validateContractVariables(["tenant_name"], "sale"), /نوع العقد/);
  assert.throws(() => validateContractVariables(["seller_name"], "rental"), /نوع العقد/);
  assert.doesNotThrow(() => validateContractVariables(["seller_name", "tenant_name"], "general"));
});
test("legal import extracts text without changing uploaded bytes, validates UTF-8 and variables", () => {
  const content = "نص عربي {{seller_name}}\nبند آخر";
  assert.equal(importFormulation("صيغة.txt", Buffer.from(content).toString("base64")).content, content);
  assert.throws(() => importFormulation("bad.exe", Buffer.from(content).toString("base64")), /DOCX وTXT/);
  assert.throws(() => importFormulation("bad.txt", Buffer.from([0xff, 0xfe]).toString("base64")), /UTF-8/);
  assert.throws(() => importFormulation("bad.txt", Buffer.from("{{arbitrary_code}}").toString("base64")), /غير معروف/);
  const original = complexFixture();
  const wording = new AdmZip(original);
  wording.updateFile("word/document.xml", Buffer.from(wording.readAsText("word/document.xml").replace("{{legal_formulation}}", "نص صيغة للاستيراد")));
  assert(importFormulation("صيغة.docx", wording.toBuffer().toString("base64")).content.includes("{{seller_name}}"));
});
