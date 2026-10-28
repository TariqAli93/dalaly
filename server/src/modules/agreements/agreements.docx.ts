/**
 * Word (.docx) renderer for a contract document: real paragraphs with
 * right-to-left settings, real tables, a header and a footer with page
 * fields, and images as embedded pictures. Written as WordprocessingML and
 * zipped with yazl (already a dependency for backups), so no Office or
 * converter is needed. Word paginates the result itself, so its page breaks
 * may fall a little differently from the PDF's.
 *
 * Element order inside pPr, rPr, tblPr and sectPr follows the schema; Word
 * refuses files where it does not.
 */
import { zipBuffers } from "../backup/backup.archive.js";
import {
  BUNDLED_FONTS,
  PAGE_SIZES,
  clauseNumbers,
  fieldDisplay,
  safeColor,
  safeFontName,
  scheduleCells,
  scheduleHeaders,
  signerColumns,
  usedFonts,
  type Align,
  type Block,
  type BlockStyle,
  type ContractDocument,
  type PageBand,
  type Paragraph,
  type RenderContext,
  type RichText,
} from "../../shared/contract-document/index.js";

const TWIPS_PER_MM = 56.6929;
const EMU_PER_MM = 36000;
const twip = (mm: number) => Math.round(mm * TWIPS_PER_MM);

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const ARABIC = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufefe]/;
const hex = (color: string | null | undefined, fallback: string) =>
  (safeColor(color) ?? fallback).slice(1, 7).padEnd(6, "0").toUpperCase();

type RunStyle = {
  font: string;
  size: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
};

type ParaStyle = {
  align?: Align;
  before?: number;
  after?: number;
  line?: number;
  indent?: number;
  keepNext?: boolean;
  keepLines?: boolean;
  border?: BlockStyle["border"];
  bottomRule?: string;
  shading?: string | null;
};

class DocxWriter {
  private images: Array<{
    id: string;
    name: string;
    data: Buffer;
    type: string;
  }> = [];
  private drawingId = 1;

  constructor(
    private readonly document: ContractDocument,
    private readonly ctx: RenderContext,
  ) {}

  get media() {
    return this.images;
  }

  get theme() {
    return this.document.theme;
  }

  baseRun(style?: BlockStyle): RunStyle {
    return {
      font:
        safeFontName(style?.font_family) ??
        safeFontName(this.theme.font_family) ??
        "Arial",
      size: style?.font_size ?? this.theme.font_size,
      bold: style?.bold,
      color: style?.color ?? this.theme.color,
    };
  }

  baseParagraph(style?: BlockStyle): ParaStyle {
    return {
      align: style?.align,
      before: style?.space_before,
      after: style?.space_after ?? this.theme.paragraph_spacing,
      line: style?.line_height ?? this.theme.line_height,
      indent: style?.indent,
      border: style?.border,
      shading: style?.background ?? null,
    };
  }

  rPr(style: RunStyle, rtl: boolean) {
    const size = Math.round(style.size * 2);
    return (
      "<w:rPr>" +
      `<w:rFonts w:ascii="${xml(style.font)}" w:hAnsi="${xml(style.font)}" w:cs="${xml(style.font)}"/>` +
      (style.bold ? "<w:b/><w:bCs/>" : "") +
      (style.italic ? "<w:i/><w:iCs/>" : "") +
      `<w:color w:val="${hex(style.color, "#1a1a1a")}"/>` +
      `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` +
      (style.underline ? '<w:u w:val="single"/>' : "") +
      (rtl ? "<w:rtl/>" : "") +
      "</w:rPr>"
    );
  }

  textRun(text: string, style: RunStyle) {
    const rtl = ARABIC.test(text);
    const parts = text.split("\n");
    const body = parts
      .map(
        (part, index) =>
          (index ? "<w:br/>" : "") +
          `<w:t xml:space="preserve">${xml(part)}</w:t>`,
      )
      .join("");
    return `<w:r>${this.rPr(style, rtl)}${body}</w:r>`;
  }

  runs(paragraph: Paragraph, style: RunStyle) {
    return paragraph
      .map((run) => {
        const runStyle: RunStyle = {
          ...style,
          bold: style.bold || run.bold,
          italic: style.italic || run.italic,
          underline: style.underline || run.underline,
        };
        const text =
          run.type === "text" ? run.text : fieldDisplay(run.key, this.ctx).text;
        return text ? this.textRun(text, runStyle) : "";
      })
      .join("");
  }

  pPr(style: ParaStyle) {
    const border = style.border
      ? (() => {
          const kind =
            style.border.style === "double"
              ? "double"
              : style.border.style === "dashed"
                ? "dashed"
                : "single";
          const size = Math.max(2, Math.round(style.border.width * 8));
          const line = `w:val="${kind}" w:sz="${size}" w:space="4" w:color="${hex(style.border.color, "#333333")}"`;
          const sides = style.border.sides;
          return (
            "<w:pBdr>" +
            (sides === "all" || sides === "top" || sides === "block"
              ? `<w:top ${line}/>`
              : "") +
            (sides === "all" ? `<w:left ${line}/>` : "") +
            (sides === "all" || sides === "bottom" || sides === "block"
              ? `<w:bottom ${line}/>`
              : "") +
            (sides === "all" ? `<w:right ${line}/>` : "") +
            "</w:pBdr>"
          );
        })()
      : style.bottomRule
        ? `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="${style.bottomRule}"/></w:pBdr>`
        : "";
    const shading = safeColor(style.shading)
      ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(style.shading, "#ffffff")}"/>`
      : "";
    const spacing = `<w:spacing w:before="${Math.round((style.before ?? 0) * 20)}" w:after="${Math.round((style.after ?? 0) * 20)}" w:line="${Math.round((style.line ?? 1.6) * 240)}" w:lineRule="auto"/>`;
    const indent = style.indent
      ? `<w:ind w:start="${twip(style.indent)}"/>`
      : "";
    // A right-to-left paragraph starts on the right; jc omitted = start.
    const jc =
      style.align === "center"
        ? '<w:jc w:val="center"/>'
        : style.align === "justify"
          ? '<w:jc w:val="both"/>'
          : style.align === "end"
            ? '<w:jc w:val="end"/>'
            : "";
    return (
      "<w:pPr>" +
      (style.keepNext ? "<w:keepNext/>" : "") +
      (style.keepLines ? "<w:keepLines/>" : "") +
      border +
      shading +
      "<w:bidi/>" +
      spacing +
      indent +
      jc +
      "</w:pPr>"
    );
  }

  paragraph(paragraph: Paragraph, run: RunStyle, para: ParaStyle) {
    return `<w:p>${this.pPr({ keepLines: true, ...para })}${this.runs(paragraph, run)}</w:p>`;
  }

  rich(text: RichText, run: RunStyle, para: ParaStyle) {
    if (!text.length) return `<w:p>${this.pPr(para)}</w:p>`;
    return text
      .map((paragraph) => this.paragraph(paragraph, run, para))
      .join("");
  }

  textWidth() {
    const size = PAGE_SIZES[this.document.page.size] ?? PAGE_SIZES.A4;
    const margins = this.document.page.margins;
    return twip(size.width - margins.start - margins.end);
  }

  table(
    rows: string[][],
    options: {
      widths: number[];
      borders: boolean;
      header?: boolean;
      widthPercent?: number;
      bottomRule?: string;
      cellPadding?: number;
    },
  ) {
    const total = options.widths.reduce((sum, width) => sum + width, 0) || 1;
    const tableWidth = Math.round(
      this.textWidth() * ((options.widthPercent ?? 100) / 100),
    );
    const columns = options.widths.map((width) =>
      Math.round((width / total) * tableWidth),
    );
    const line = (side: string, value: string) => `<w:${side} ${value}/>`;
    const thin = 'w:val="single" w:sz="6" w:space="0" w:color="9AA5AB"';
    const none = 'w:val="nil"';
    const borders = options.borders
      ? ["top", "left", "bottom", "right", "insideH", "insideV"]
          .map((side) => line(side, thin))
          .join("")
      : options.bottomRule
        ? [
            line("top", none),
            line("left", none),
            line(
              "bottom",
              `w:val="single" w:sz="12" w:space="0" w:color="${options.bottomRule}"`,
            ),
            line("right", none),
            line("insideH", none),
            line("insideV", none),
          ].join("")
        : ["top", "left", "bottom", "right", "insideH", "insideV"]
            .map((side) => line(side, none))
            .join("");
    const padding = Math.round((options.cellPadding ?? 1.6) * TWIPS_PER_MM);
    const header = this.document.theme.accent;
    return (
      "<w:tbl><w:tblPr><w:bidiVisual/>" +
      `<w:tblW w:w="${tableWidth}" w:type="dxa"/>` +
      `<w:tblBorders>${borders}</w:tblBorders>` +
      '<w:tblLayout w:type="fixed"/>' +
      `<w:tblCellMar><w:top w:w="${Math.round(padding / 2)}" w:type="dxa"/><w:left w:w="${padding}" w:type="dxa"/><w:bottom w:w="${Math.round(padding / 2)}" w:type="dxa"/><w:right w:w="${padding}" w:type="dxa"/></w:tblCellMar>` +
      "</w:tblPr>" +
      `<w:tblGrid>${columns.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>` +
      rows
        .map((cells, rowIndex) => {
          const isHeader = options.header && rowIndex === 0;
          return (
            "<w:tr>" +
            `<w:trPr><w:cantSplit/>${isHeader ? "<w:tblHeader/>" : ""}</w:trPr>` +
            cells
              .map(
                (cell, cellIndex) =>
                  `<w:tc><w:tcPr><w:tcW w:w="${columns[cellIndex] ?? columns[0]}" w:type="dxa"/>` +
                  (isHeader
                    ? `<w:shd w:val="clear" w:color="auto" w:fill="${tint(header)}"/>`
                    : "") +
                  `</w:tcPr>${cell || "<w:p/>"}</w:tc>`,
              )
              .join("") +
            "</w:tr>"
          );
        })
        .join("") +
      "</w:tbl>"
    );
  }

  image(data: string | null, widthMm: number, align: Align) {
    const parsed = data ? decodeImage(data) : null;
    if (!parsed) return "";
    const index = this.images.length + 1;
    const id = `rIdImg${index}`;
    this.images.push({
      id,
      name: `image${index}.${parsed.extension}`,
      data: parsed.data,
      type: parsed.type,
    });
    const cx = Math.round(widthMm * EMU_PER_MM);
    const cy = Math.round(cx * (parsed.height / parsed.width));
    const docPr = this.drawingId++;
    const drawing =
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:docPr id="${docPr}" name="Picture ${docPr}"/>` +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      `<pic:nvPicPr><pic:cNvPr id="${docPr}" name="image${index}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>";
    return `<w:p>${this.pPr({ align, after: 0 })}${drawing}</w:p>`;
  }

  block(block: Block): string {
    const style = block.style;
    const run = this.baseRun(style);
    const para = this.baseParagraph(style);
    const accent = hex(this.theme.accent, "#1f4e5f");
    switch (block.type) {
      case "letterhead": {
        const small = { ...para, after: 1, line: 1.35 };
        const logo = block.logo
          ? this.image(this.ctx.logo, block.logo_width, "center")
          : "";
        return (
          this.table(
            [
              [
                this.rich(block.start, run, small),
                logo || "<w:p/>",
                this.rich(block.end, run, { ...small, align: "end" }),
              ],
            ],
            {
              widths: [2, 1.2, 2],
              borders: false,
              bottomRule: accent,
              cellPadding: 1,
            },
          ) +
          `<w:p>${this.pPr({ after: this.theme.paragraph_spacing * 2 })}</w:p>`
        );
      }
      case "heading": {
        const scale = block.level === 1 ? 1.75 : block.level === 2 ? 1.3 : 1.1;
        return this.paragraph(
          block.text,
          {
            ...run,
            size:
              (style?.font_size ?? this.theme.font_size) *
              (style?.font_size ? 1 : scale),
            bold: true,
            color: style?.color ?? this.theme.accent,
          },
          {
            ...para,
            align: style?.align ?? (block.level === 1 ? "center" : undefined),
            before: style?.space_before ?? (block.level === 1 ? 4 : 8),
            after: style?.space_after ?? this.theme.paragraph_spacing * 1.5,
            keepNext: true,
          },
        );
      }
      case "text":
        return this.rich(block.text, run, para);
      case "clauses":
        return this.clauses();
      case "table": {
        const rows = block.rows.map((cells, rowIndex) =>
          cells.map((cell) =>
            this.rich(
              cell,
              {
                ...run,
                bold: run.bold || (block.header_row && rowIndex === 0),
              },
              { ...para, after: 0, before: 0, border: null, shading: null },
            ),
          ),
        );
        return (
          this.table(rows, {
            widths: block.widths,
            borders: block.borders,
            header: block.header_row,
            widthPercent: style?.width,
          }) + `<w:p>${this.pPr({ after: this.theme.paragraph_spacing })}</w:p>`
        );
      }
      case "schedule": {
        const headers = scheduleHeaders(this.ctx.template);
        const cellPara = {
          ...para,
          after: 0,
          before: 0,
          border: null,
          shading: null,
        };
        const rows = [
          headers.map((title) =>
            this.paragraph(
              [{ type: "text", text: title }],
              { ...run, bold: true },
              cellPara,
            ),
          ),
          ...this.ctx.schedule.map((row) =>
            scheduleCells(row, this.ctx.template).map((cell) =>
              this.paragraph([{ type: "text", text: cell }], run, cellPara),
            ),
          ),
        ];
        if (!this.ctx.schedule.length)
          rows.push(
            headers.map(() =>
              this.paragraph([{ type: "text", text: "—" }], run, cellPara),
            ),
          );
        return (
          this.table(rows, {
            widths: headers.map((_, i) => (i === 0 ? 0.6 : 1)),
            borders: true,
            header: true,
          }) + `<w:p>${this.pPr({ after: this.theme.paragraph_spacing })}</w:p>`
        );
      }
      case "signatures": {
        const columns = signerColumns(block.signers.length);
        const center = { ...para, align: "center" as const, after: 4 };
        const cells = block.signers.map(
          (signer) =>
            this.paragraph(signer.title, { ...run, bold: true }, center) +
            this.paragraph(signer.name, run, center) +
            this.paragraph(
              [
                {
                  type: "text",
                  text: "التوقيع: ...............................",
                },
              ],
              run,
              center,
            ) +
            (block.show_date
              ? this.paragraph(
                  [{ type: "text", text: "التاريخ: ....../....../........." }],
                  run,
                  center,
                )
              : ""),
        );
        const rows: string[][] = [];
        for (let i = 0; i < cells.length; i += columns) {
          const row = cells.slice(i, i + columns);
          while (row.length < columns) row.push("<w:p/>");
          rows.push(row);
        }
        return (
          `<w:p>${this.pPr({ after: this.theme.paragraph_spacing * 3, keepNext: true })}</w:p>` +
          this.table(rows, {
            widths: Array(columns).fill(1),
            borders: false,
            cellPadding: 3,
          }) +
          "<w:p/>"
        );
      }
      case "image":
        return this.image(
          block.source === "logo" ? this.ctx.logo : (block.data ?? null),
          block.width,
          block.align,
        );
      case "separator":
        return `<w:p>${this.pPr({ ...para, bottomRule: accent, after: this.theme.paragraph_spacing })}</w:p>`;
      case "page_break":
        return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    }
  }

  clauses() {
    const settings = this.document.clause_settings;
    const numbers = clauseNumbers(this.document.clauses, settings);
    const titleRun = { ...this.baseRun(settings.title_style), bold: true };
    const titlePara = {
      ...this.baseParagraph(settings.title_style),
      before: settings.title_style.space_before ?? this.theme.paragraph_spacing,
      after:
        settings.title_style.space_after ?? this.theme.paragraph_spacing / 2,
      keepNext: true,
    };
    const bodyRun = this.baseRun(settings.body_style);
    const bodyPara = {
      ...this.baseParagraph(settings.body_style),
      align: settings.body_style.align ?? ("justify" as const),
    };
    return this.document.clauses
      .filter((clause) => !clause.hidden)
      .map((clause) => {
        const label = numbers.get(clause.id);
        const title = clause.title.length
          ? this.runs(clause.title, titleRun)
          : "";
        const heading =
          label || title
            ? `<w:p>${this.pPr(titlePara)}` +
              (label
                ? this.textRun(title ? `${label}: ` : label, {
                    ...titleRun,
                    color: this.theme.accent,
                  })
                : "") +
              title +
              "</w:p>"
            : "";
        return heading + this.rich(clause.body, bodyRun, bodyPara);
      })
      .join("");
  }

  band(band: PageBand, kind: "hdr" | "ftr", extra?: string) {
    const run: RunStyle = {
      font: safeFontName(this.theme.font_family) ?? "Arial",
      size: band.font_size,
      color: "#555555",
    };
    const content = band.enabled ? this.runs(band.text, run) : "";
    let fields = "";
    if (kind === "ftr" && band.enabled && band.page_numbers) {
      const field = (instr: string) =>
        `<w:fldSimple w:instr=" ${instr} ">${this.textRun("1", run)}</w:fldSimple>`;
      fields =
        (content ? this.textRun("   —   ", run) : "") +
        this.textRun("صفحة ", run) +
        field("PAGE") +
        this.textRun(" من ", run) +
        field("NUMPAGES");
    }
    const paragraphs = [
      extra
        ? `<w:p>${this.pPr({ align: "center", after: 0 })}${this.textRun(extra, { ...run, bold: true, color: "#9A5B00" })}</w:p>`
        : "",
      content || fields
        ? `<w:p>${this.pPr({ align: band.align, after: 0, line: 1.2 })}${content}${fields}</w:p>`
        : "",
    ].join("");
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${kind} ${NAMESPACES}>` +
      (paragraphs || "<w:p/>") +
      `</w:${kind}>`
    );
  }
}

function tint(color: string) {
  // The accent mixed 8% into white: the same light header fill as the PDF.
  const value = hex(color, "#1f4e5f");
  const channel = (offset: number) =>
    Math.round(
      255 - (255 - parseInt(value.slice(offset, offset + 2), 16)) * 0.08,
    )
      .toString(16)
      .padStart(2, "0");
  return `${channel(0)}${channel(2)}${channel(4)}`.toUpperCase();
}

function decodeImage(dataUrl: string) {
  const match = /^data:image\/(png|jpeg);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  const data = Buffer.from(match[2]!, "base64");
  const size = match[1] === "png" ? pngSize(data) : jpegSize(data);
  if (!size || !size.width || !size.height) return null;
  return {
    data,
    type: `image/${match[1]}`,
    extension: match[1] === "png" ? "png" : "jpeg",
    ...size,
  };
}

function pngSize(data: Buffer) {
  if (data.length < 24 || data.readUInt32BE(12) !== 0x49484452) return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function jpegSize(data: Buffer) {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1]!;
    const length = data.readUInt16BE(offset + 2);
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the size.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    )
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
      };
    offset += 2 + length;
  }
  return null;
}

const NAMESPACES = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
].join(" ");

/** Builds the .docx file of a contract document with resolved values. */
export async function renderDocx(
  document: ContractDocument,
  ctx: RenderContext,
  meta: { title: string; number: string | null },
) {
  const writer = new DocxWriter(document, ctx);
  const body = document.blocks
    .filter((block) => !block.hidden)
    .map((block) => writer.block(block))
    .join("");
  const page = PAGE_SIZES[document.page.size] ?? PAGE_SIZES.A4;
  const margins = document.page.margins;
  const hasHeader = document.header.enabled || Boolean(ctx.watermark);
  const hasFooter = document.footer.enabled;
  const header = hasHeader
    ? writer.band(document.header, "hdr", ctx.watermark ?? undefined)
    : null;
  const footer = hasFooter ? writer.band(document.footer, "ftr") : null;
  const sectPr =
    "<w:sectPr>" +
    (header ? '<w:headerReference w:type="default" r:id="rIdHeader"/>' : "") +
    (footer ? '<w:footerReference w:type="default" r:id="rIdFooter"/>' : "") +
    `<w:pgSz w:w="${twip(page.width)}" w:h="${twip(page.height)}"/>` +
    `<w:pgMar w:top="${twip(margins.top)}" w:right="${twip(margins.start)}" w:bottom="${twip(margins.bottom)}" w:left="${twip(margins.end)}" w:header="${twip(Math.max(5, margins.top / 2))}" w:footer="${twip(Math.max(5, margins.bottom / 2))}" w:gutter="0"/>` +
    "<w:bidi/></w:sectPr>";
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NAMESPACES}><w:body>` +
    body +
    "<w:p/>" +
    sectPr +
    "</w:body></w:document>";

  const theme = document.theme;
  const font = safeFontName(theme.font_family) ?? "Arial";
  const size = Math.round(theme.font_size * 2);
  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:docDefaults><w:rPrDefault><w:rPr>" +
    `<w:rFonts w:ascii="${xml(font)}" w:hAnsi="${xml(font)}" w:cs="${xml(font)}"/>` +
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="ar-IQ" w:bidi="ar-IQ"/>` +
    "</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/>" +
    `<w:spacing w:after="${Math.round(theme.paragraph_spacing * 20)}" w:line="${Math.round(theme.line_height * 240)}" w:lineRule="auto"/>` +
    "</w:pPr></w:pPrDefault></w:docDefaults>" +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:bidi/></w:pPr><w:rPr><w:rtl/></w:rPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:bidiVisual/><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    "</w:styles>";

  const fonts = new Set<string>([font, ...usedFonts(document)]);
  const fontTableXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    [...fonts]
      .map(
        (name) =>
          `<w:font w:name="${xml(name)}">` +
          // Fonts bundled with Dalaly may be missing where the file is opened.
          ((BUNDLED_FONTS as readonly string[]).includes(name)
            ? '<w:altName w:val="Arial"/>'
            : "") +
          '<w:charset w:val="B2"/><w:family w:val="auto"/><w:pitch w:val="variable"/></w:font>',
      )
      .join("") +
    "</w:fonts>";

  const settingsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>' +
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    '<w:themeFontLang w:val="ar-IQ" w:bidi="ar-IQ"/>' +
    "</w:settings>";

  const relationships = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
    '<Relationship Id="rIdFonts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>',
    ...(header
      ? [
          '<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
        ]
      : []),
    ...(footer
      ? [
          '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
        ]
      : []),
    ...writer.media.map(
      (image) =>
        `<Relationship Id="${image.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.name}"/>`,
    ),
  ];
  const documentRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>`;

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
    (header
      ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
      : "") +
    (footer
      ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
      : "") +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    "</Types>";

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    "</Relationships>";

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${xml(`${meta.title}${meta.number ? ` ${meta.number}` : ""}`)}</dc:title>` +
    "<dc:language>ar-IQ</dc:language><dc:creator>دلالي</dc:creator>" +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    "</cp:coreProperties>";
  const app =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Dalaly</Application></Properties>';

  const utf8 = (value: string) => Buffer.from(value, "utf8");
  return zipBuffers([
    { name: "[Content_Types].xml", data: utf8(contentTypes) },
    { name: "_rels/.rels", data: utf8(rootRels) },
    { name: "docProps/core.xml", data: utf8(core) },
    { name: "docProps/app.xml", data: utf8(app) },
    { name: "word/document.xml", data: utf8(documentXml) },
    { name: "word/styles.xml", data: utf8(stylesXml) },
    { name: "word/settings.xml", data: utf8(settingsXml) },
    { name: "word/fontTable.xml", data: utf8(fontTableXml) },
    { name: "word/_rels/document.xml.rels", data: utf8(documentRels) },
    ...(header ? [{ name: "word/header1.xml", data: utf8(header) }] : []),
    ...(footer ? [{ name: "word/footer1.xml", data: utf8(footer) }] : []),
    ...writer.media.map((image) => ({
      name: `word/media/${image.name}`,
      data: image.data,
    })),
  ]);
}
