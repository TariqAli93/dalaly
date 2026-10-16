import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const { Document, Packer, Paragraph, TextRun, Header, Footer, ImageRun, PageNumber, PageBreak, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, PageOrientation } = process.env.DOCX_MODULE_DIR ? require(path.join(process.env.DOCX_MODULE_DIR, "docx")) : require("docx");
const p = text => new Paragraph({ bidirectional: true, alignment: AlignmentType.START, spacing: { after: 180 }, children: [new TextRun({ text, font: "Arial", size: 24, rightToLeft: true })] });
const logo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1cAAAAASUVORK5CYII=", "base64");
const border = { style: BorderStyle.DOUBLE, size: 8, color: "116466" };
const doc = new Document({ sections: [{
  properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 1100, right: 800, left: 800, bottom: 1100 } } },
  headers: { default: new Header({ children: [new Paragraph({ children: [new ImageRun({ type: "png", data: logo, transformation: { width: 24, height: 24 } }), new TextRun({ text: "  {{office_name}}", bold: true, font: "Arial", size: 26, rightToLeft: true })] })] }) },
  footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("{{contract_code}} · "), new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
  children: [
    new Paragraph({ bidirectional: true, spacing: { after: 240 }, children: [new TextRun({ text: "البائع: {{sel", color: "116466", font: "Arial", size: 30, bold: true }), new TextRun({ text: "ler_name}}", italics: true, font: "Arial" })] }),
    p("المشتري: {{buyer_name}} · تاريخ العقد: {{contract_date}}"),
    new Table({ columnWidths: [6000, 6000], rows: [new TableRow({ children: ["{{contract_amount}}", "{{paid_amount}} / {{remaining_amount}}"].map(text => new TableCell({ width: { size: 6000, type: WidthType.DXA }, borders: { top: border, bottom: border, left: border, right: border }, children: [p(text)] })) })] }),
    p("{{legal_formulation}}"), new Paragraph({ children: [new PageBreak()] }),
    p("{{additional_conditions}}"), p("التواقيع: __________________________"),
  ],
}] });
await fs.mkdir("scripts/fixtures", { recursive: true });
await fs.writeFile("scripts/fixtures/complex-contract.docx", await Packer.toBuffer(doc));
