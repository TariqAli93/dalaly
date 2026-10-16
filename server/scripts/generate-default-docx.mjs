import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = process.env.DOCX_MODULE_DIR
  ? require(path.join(process.env.DOCX_MODULE_DIR, "docx")) : require("docx");
const paragraph = (text, bold = false, center = false) => new Paragraph({
  bidirectional: true, alignment: center ? AlignmentType.CENTER : AlignmentType.START,
  spacing: { after: 140, line: 340 },
  children: [new TextRun({ text, bold, rightToLeft: true, font: "Arial", size: bold ? 30 : 24 })],
});
const buffers = {};
for (const kind of ["sale", "rental"]) {
  const doc = new Document({
    creator: "Dalaly", title: kind === "sale" ? "اتفاق بيع عقار" : "اتفاق إيجار عقار",
    styles: { default: { document: { run: { font: "Arial", size: 24 }, paragraph: { bidirectional: true } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      headers: { default: new Header({ children: [paragraph("{{office_name}}", true, true), paragraph("{{office.address}} · {{office.phone}}", false, true)] }) },
      footers: { default: new Footer({ children: [paragraph("{{contract_code}} · {{contract_date}}", false, true)] }) },
      children: [
        paragraph(kind === "sale" ? "اتفاق بيع عقار" : "اتفاق إيجار عقار", true, true),
        paragraph("رقم العقد: {{contract_code}}                 التاريخ: {{contract_date}}"),
        paragraph("{{parties_summary}}"), paragraph("{{office_role}}"),
        paragraph("بيانات العقار", true), paragraph("{{assets_summary}}"),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [3100, 3100, 3100],
          rows: [new TableRow({ children: ["المبلغ: {{contract_amount}} د.ع", "المدفوع: {{paid_amount}} د.ع", "المتبقي: {{remaining_amount}} د.ع"].map(text => new TableCell({ width: { size: 3100, type: WidthType.DXA }, children: [paragraph(text)], borders: Object.fromEntries(["top", "bottom", "left", "right"].map(side => [side, { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" }])) })) })] }),
        ...(kind === "rental" ? [paragraph("مدة الإيجار: {{start_date}} إلى {{end_date}}")] : []),
        paragraph("الشروط والبنود", true), paragraph("{{legal_formulation}}"),
        paragraph("{{agreement_terms}}"), paragraph("{{additional_conditions}}"),
        paragraph("{{witnesses}}"), paragraph("التواقيع", true),
        paragraph(kind === "sale" ? "البائع: {{seller_name}}                    المشتري: {{buyer_name}}" : "المؤجر: {{landlord_name}}                    المستأجر: {{tenant_name}}"),
        paragraph("التوقيع: __________________         التوقيع: __________________"),
      ],
    }],
  });
  buffers[kind] = await Packer.toBuffer(doc);
}
const directory = path.resolve("assets/contracts");
await fs.mkdir(directory, { recursive: true });
for (const [kind, buffer] of Object.entries(buffers)) await fs.writeFile(path.join(directory, `${kind}.docx`), buffer);
await fs.writeFile("src/modules/contracts/default-docx.assets.ts", "// Generated from server/assets/contracts; embedded for offline packaged builds.\nexport const DEFAULT_DOCX: Record<string, string> = " + JSON.stringify(Object.fromEntries(Object.entries(buffers).map(([kind, buffer]) => [kind, buffer.toString("base64")]))) + ";\n");
