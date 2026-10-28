/**
 * Renders a contract document to HTML and CSS. The editor canvas, the
 * read-only preview, printing and the PDF all use this output (the editor
 * swaps in contenteditable areas with the same classes), so text, spacing
 * and page breaks match. Word files have their own renderer on the API.
 *
 * Flow units: every element marked `data-unit` is kept whole on a page
 * (`break-inside: avoid` when printing; the editor's paginator moves it to
 * the next page the same way). `data-keep` keeps a unit with the next one.
 */
import { arabicOrdinal, formatAmount, formatContractDate } from "./format.js";
import {
  PAGE_SIZES,
  TEMPLATES,
  type Align,
  type Block,
  type BlockStyle,
  type Clause,
  type ClauseSettings,
  type ContractDocument,
  type PageBand,
  type Paragraph,
  type RichText,
  type Run,
  type Theme,
  type TemplateKey,
} from "./model.js";
import { paragraphText } from "./rich-text.js";
import {
  FIELD_BY_KEY,
  fieldLabel,
  type FieldValues,
  type ScheduleRow,
} from "./variables.js";

export type RenderContext = {
  template: TemplateKey;
  values: FieldValues;
  /**
   * A field without a value: "label" shows «its name» (editing, templates),
   * "blank" a dotted line to fill in by hand (a printed draft).
   */
  missing: "label" | "blank";
  /** data: URL (or an API URL in the editor) of the office logo */
  logo: string | null;
  schedule: ScheduleRow[];
  /** Field tokens become non-editable atoms (the editor canvas). */
  editable?: boolean;
  /** Printed across every page: «مسودة» for a draft, «ملغى» once cancelled. */
  watermark?: string | null;
};

// ─── Escaping and sanitizing ────────────────────────────────────────────

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A CSS string literal (margin-box content). */
function cssString(value: string) {
  return `"${value.replace(/[\\"]/g, "\\$&").replace(/[\n\r\f]/g, " ")}"`;
}

const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
export function safeColor(value: string | null | undefined) {
  return value && COLOR.test(value) ? value : null;
}

/** #abc → #aabbcc, and drops an alpha channel, so a suffix like "14" is a tint. */
export function sixDigit(color: string) {
  const hex = color.slice(1);
  if (hex.length === 3 || hex.length === 4)
    return `#${[...hex.slice(0, 3)].map((c) => c + c).join("")}`;
  return `#${hex.slice(0, 6)}`;
}

/** Letters, digits, spaces and hyphens only, so a name cannot break out of CSS. */
export function safeFontName(value: string | null | undefined) {
  const cleaned = (value ?? "").replace(/[^\p{L}\p{N} -]/gu, "").trim();
  return cleaned.slice(0, 60) || null;
}

export function fontStack(value: string | null | undefined) {
  const name = safeFontName(value);
  return `${name ? `"${name}", ` : ""}"IBM Plex Sans Arabic", Tahoma, Arial, sans-serif`;
}

const IMAGE_DATA = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i;
export function safeImageSource(value: string | null | undefined) {
  if (!value) return null;
  if (IMAGE_DATA.test(value)) return value;
  // The editor shows the logo from the API itself.
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(value)) return value;
  return null;
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
};

// ─── Styles ─────────────────────────────────────────────────────────────

function textAlign(align: Align | undefined) {
  if (!align) return null;
  return align === "justify" ? "justify" : align;
}

/** Inline CSS for a block style. Space before goes through --dc-mt (see css). */
export function blockStyleCss(style: BlockStyle | undefined) {
  if (!style) return "";
  const css: string[] = [];
  const font = safeFontName(style.font_family);
  if (font) css.push(`font-family:${fontStack(font)}`);
  if (style.font_size)
    css.push(`font-size:${clamp(style.font_size, 6, 48, 12)}pt`);
  if (style.bold) css.push("font-weight:700");
  const color = safeColor(style.color);
  if (color) css.push(`color:${color}`);
  const align = textAlign(style.align);
  if (align) css.push(`text-align:${align}`);
  if (style.line_height)
    css.push(`line-height:${clamp(style.line_height, 0.8, 3, 1.6)}`);
  if (style.space_before !== undefined)
    css.push(`--dc-mt:${clamp(style.space_before, 0, 72, 0)}pt`);
  if (style.space_after !== undefined)
    css.push(`margin-bottom:${clamp(style.space_after, 0, 72, 0)}pt`);
  if (style.indent)
    css.push(`margin-inline-start:${clamp(style.indent, 0, 80, 0)}mm`);
  if (style.padding) css.push(`padding:${clamp(style.padding, 0, 30, 0)}mm`);
  const background = safeColor(style.background);
  if (background) css.push(`background:${background}`);
  if (style.border) {
    const width = clamp(style.border.width, 0.25, 6, 1);
    const borderColor = safeColor(style.border.color) ?? "#333333";
    const kind = ["solid", "dashed", "double"].includes(style.border.style)
      ? style.border.style
      : "solid";
    const value = `${style.border.style === "double" ? Math.max(width, 2.25) : width}pt ${kind} ${borderColor}`;
    const sides = style.border.sides;
    if (sides === "all") css.push(`border:${value}`);
    else if (sides === "top") css.push(`border-top:${value}`);
    else if (sides === "bottom") css.push(`border-bottom:${value}`);
    else css.push(`border-block:${value}`);
  }
  if (style.width) css.push(`width:${clamp(style.width, 20, 100, 100)}%`);
  return css.join(";");
}

function attr(name: string, value: string | null | undefined) {
  return value ? ` ${name}="${escapeHtml(value)}"` : "";
}

// ─── Inline content ─────────────────────────────────────────────────────

export function fieldDisplay(key: string, ctx: RenderContext) {
  const value = ctx.values[key];
  if (value !== undefined) return { text: value, missing: false };
  const def = FIELD_BY_KEY.get(key);
  if (def?.optional) return { text: "—", missing: false };
  return {
    text:
      ctx.missing === "label" ? `«${fieldLabel(key)}»` : "..................",
    missing: true,
  };
}

function wrapMarks(html: string, run: Run) {
  let out = html;
  if (run.bold) out = `<strong>${out}</strong>`;
  if (run.italic) out = `<em>${out}</em>`;
  if (run.underline) out = `<u>${out}</u>`;
  return out;
}

export function runsHtml(paragraph: Paragraph, ctx: RenderContext) {
  let html = "";
  for (const run of paragraph) {
    if (run.type === "text") {
      html += wrapMarks(escapeHtml(run.text).replaceAll("\n", "<br>"), run);
    } else {
      const shown = fieldDisplay(run.key, ctx);
      html += wrapMarks(
        `<span class="dc-field${shown.missing ? " dc-field--missing" : ""}" data-key="${escapeHtml(run.key)}"${ctx.editable ? ' contenteditable="false"' : ""}>${escapeHtml(shown.text)}</span>`,
        run,
      );
    }
  }
  return html || "<br>";
}

function paragraphsHtml(text: RichText, ctx: RenderContext, unit = true) {
  return text
    .map(
      (paragraph) =>
        `<div class="dc-p"${unit ? " data-unit" : ""}>${runsHtml(paragraph, ctx)}</div>`,
    )
    .join("");
}

// ─── Clauses ────────────────────────────────────────────────────────────

/** "البند الأول" / "البند (1)" for each visible numbered clause, by id. */
export function clauseNumbers(clauses: Clause[], settings: ClauseSettings) {
  const labels = new Map<string, string>();
  let count = 0;
  for (const clause of clauses) {
    if (clause.hidden || !clause.numbered || settings.numbering === "none")
      continue;
    count += 1;
    const prefix = settings.prefix.trim();
    labels.set(
      clause.id,
      settings.numbering === "ordinal"
        ? `${prefix} ${arabicOrdinal(count)}`.trim()
        : `${prefix} (${count})`.trim(),
    );
  }
  return labels;
}

export function clauseHeadingHtml(
  clause: Clause,
  label: string | undefined,
  ctx: RenderContext,
) {
  const title = clause.title.length ? runsHtml(clause.title, ctx) : "";
  if (label && title)
    return `<span class="dc-clause-no">${escapeHtml(label)}:</span> ${title}`;
  if (label) return `<span class="dc-clause-no">${escapeHtml(label)}</span>`;
  return title;
}

function clausesHtml(document: ContractDocument, ctx: RenderContext) {
  const numbers = clauseNumbers(document.clauses, document.clause_settings);
  const titleStyle = blockStyleCss(document.clause_settings.title_style);
  const bodyStyle = blockStyleCss(document.clause_settings.body_style);
  return document.clauses
    .filter((clause) => !clause.hidden)
    .map((clause) => {
      const heading = clauseHeadingHtml(clause, numbers.get(clause.id), ctx);
      return (
        `<div class="dc-clause" data-clause-id="${escapeHtml(clause.id)}">` +
        (heading
          ? `<div class="dc-clause-title dc-p" data-unit data-keep${attr("style", titleStyle)}>${heading}</div>`
          : "") +
        `<div class="dc-clause-body"${attr("style", bodyStyle)}>${paragraphsHtml(clause.body, ctx)}</div>` +
        "</div>"
      );
    })
    .join("");
}

// ─── Blocks ─────────────────────────────────────────────────────────────

export function scheduleHeaders(template: TemplateKey) {
  return TEMPLATES[template].kind === "rent"
    ? ["الدفعة", "تاريخ الاستحقاق", "عن المدة حتى", "المبلغ"]
    : ["القسط", "تاريخ الاستحقاق", "المبلغ"];
}

export function scheduleCells(row: ScheduleRow, template: TemplateKey) {
  const due = formatContractDate(row.due_date) ?? "—";
  const amount = formatAmount(row.amount);
  return TEMPLATES[template].kind === "rent"
    ? [
        String(row.index),
        due,
        formatContractDate(row.period_end) ?? "—",
        amount,
      ]
    : [String(row.index), due, amount];
}

function scheduleHtml(ctx: RenderContext) {
  const headers = scheduleHeaders(ctx.template);
  const columns = `grid-template-columns:${headers.map((_, i) => (i === 0 ? "0.6fr" : "1fr")).join(" ")}`;
  const head = `<div class="dc-sched-row dc-sched-head" data-unit data-keep style="${columns}">${headers.map((h) => `<div>${escapeHtml(h)}</div>`).join("")}</div>`;
  if (!ctx.schedule.length)
    return `${head}<div class="dc-sched-empty dc-p" data-unit>${escapeHtml(
      ctx.missing === "label"
        ? "«يُحسب الجدول من المبلغ والعدد والتواريخ في تفاصيل العقد»"
        : "—",
    )}</div>`;
  return (
    head +
    ctx.schedule
      .map(
        (row) =>
          `<div class="dc-sched-row" data-unit style="${columns}">${scheduleCells(
            row,
            ctx.template,
          )
            .map((cell) => `<div>${escapeHtml(cell)}</div>`)
            .join("")}</div>`,
      )
      .join("")
  );
}

export function signerColumns(count: number) {
  return count <= 3 ? Math.max(1, count) : 2;
}

export function blockHtml(
  block: Block,
  document: ContractDocument,
  ctx: RenderContext,
): string {
  const style = blockStyleCss(block.style);
  const id = ` data-block-id="${escapeHtml(block.id)}"`;
  switch (block.type) {
    case "letterhead": {
      const logo = block.logo ? safeImageSource(ctx.logo) : null;
      return (
        `<div class="dc-block dc-letterhead" data-unit${id}${attr("style", style)}>` +
        `<div class="dc-lh-start">${paragraphsHtml(block.start, ctx, false)}</div>` +
        `<div class="dc-lh-logo">${logo ? `<img src="${escapeHtml(logo)}" alt="" style="width:${clamp(block.logo_width, 10, 80, 30)}mm">` : ""}</div>` +
        `<div class="dc-lh-end">${paragraphsHtml(block.end, ctx, false)}</div>` +
        "</div>"
      );
    }
    case "heading":
      return `<div class="dc-block dc-h dc-h${block.level}" data-unit data-keep${id}${attr("style", style)}>${runsHtml(block.text, ctx)}</div>`;
    case "text":
      return `<div class="dc-block dc-text"${id}${attr("style", style)}>${paragraphsHtml(block.text, ctx)}</div>`;
    case "clauses":
      return `<div class="dc-block dc-clauses"${id}${attr("style", style)}>${clausesHtml(document, ctx)}</div>`;
    case "table": {
      const total = block.widths.reduce((sum, width) => sum + width, 0) || 1;
      const cols = block.widths
        .map(
          (width) =>
            `<col style="width:${((width / total) * 100).toFixed(2)}%">`,
        )
        .join("");
      const rows = block.rows
        .map((row, index) => {
          const tag = block.header_row && index === 0 ? "th" : "td";
          return `<tr>${row.map((cell) => `<${tag}>${paragraphsHtml(cell, ctx, false)}</${tag}>`).join("")}</tr>`;
        })
        .join("");
      return (
        `<div class="dc-block dc-table-wrap" data-unit${id}${attr("style", style)}>` +
        `<table class="dc-table${block.borders ? " dc-table--borders" : ""}"><colgroup>${cols}</colgroup><tbody>${rows}</tbody></table></div>`
      );
    }
    case "schedule":
      return `<div class="dc-block dc-schedule"${id}${attr("style", style)}>${scheduleHtml(ctx)}</div>`;
    case "signatures": {
      const columns = signerColumns(block.signers.length);
      const date = block.show_date
        ? `<div class="dc-sign-line">التاريخ: ....../....../.........</div>`
        : "";
      return (
        `<div class="dc-block dc-signatures" data-unit${id} style="grid-template-columns:repeat(${columns},1fr)${style ? `;${style}` : ""}">` +
        block.signers
          .map(
            (signer) =>
              `<div class="dc-signer"><div class="dc-signer-title">${runsHtml(signer.title, ctx)}</div>` +
              `<div class="dc-signer-name">${runsHtml(signer.name, ctx)}</div>` +
              `<div class="dc-sign-line">التوقيع: ...............................</div>${date}</div>`,
          )
          .join("") +
        "</div>"
      );
    }
    case "image": {
      const source = safeImageSource(
        block.source === "logo" ? ctx.logo : (block.data ?? null),
      );
      const align = textAlign(block.align) ?? "center";
      return (
        `<div class="dc-block dc-image" data-unit${id} style="text-align:${align}${style ? `;${style}` : ""}">` +
        (source
          ? `<img src="${escapeHtml(source)}" alt="" style="width:${clamp(block.width, 5, 180, 40)}mm">`
          : ctx.missing === "label"
            ? `<span class="dc-image-missing">${block.source === "logo" ? "«شعار المكتب غير مُعدّ في الإعدادات»" : "«صورة»"}</span>`
            : "") +
        "</div>"
      );
    }
    case "separator":
      return `<div class="dc-block dc-sep" data-unit${id}${attr("style", style)}><div class="dc-sep-line"></div></div>`;
    case "page_break":
      return `<div class="dc-pagebreak" data-break${id}></div>`;
  }
}

export function bodyHtml(document: ContractDocument, ctx: RenderContext) {
  return document.blocks
    .filter((block) => !block.hidden)
    .map((block) => blockHtml(block, document, ctx))
    .join("");
}

// ─── Page bands ─────────────────────────────────────────────────────────

export function bandText(band: PageBand, ctx: RenderContext) {
  return paragraphText(band.text, (key) => fieldDisplay(key, ctx).text).trim();
}

function marginBox(
  position: "top" | "bottom",
  align: Align,
  content: string,
  band: PageBand,
  theme: Theme,
) {
  // RTL page: the start edge is on the right.
  const side =
    align === "start" ? "right" : align === "end" ? "left" : "center";
  return `@${position}-${side}{content:${content};font-family:${fontStack(theme.font_family)};font-size:${clamp(band.font_size, 6, 14, 8.5)}pt;color:#555;direction:rtl;vertical-align:${position === "top" ? "bottom" : "top"};padding-${position === "top" ? "bottom" : "top"}:4mm}`;
}

// ─── CSS ────────────────────────────────────────────────────────────────

export function pageMetrics(document: ContractDocument) {
  const size = PAGE_SIZES[document.page.size] ?? PAGE_SIZES.A4;
  const margins = document.page.margins;
  return {
    width: size.width,
    height: size.height,
    top: clamp(margins.top, 5, 60, 20),
    bottom: clamp(margins.bottom, 5, 60, 20),
    start: clamp(margins.start, 5, 60, 18),
    end: clamp(margins.end, 5, 60, 18),
  };
}

/**
 * The document's CSS under `scope`. With `print`, adds the @page rules
 * (size, margins, the header and footer bands with page numbers) and the
 * break rules for flow units.
 */
export function documentCss(
  document: ContractDocument,
  options: { scope?: string; print?: boolean; ctx?: RenderContext } = {},
) {
  const scope = options.scope ?? ".dc-doc";
  const theme = document.theme;
  const accent = sixDigit(safeColor(theme.accent) ?? "#1f4e5f");
  const color = safeColor(theme.color) ?? "#1a1a1a";
  const spacing = clamp(theme.paragraph_spacing, 0, 36, 6);
  const rules: string[] = [];
  if (options.print && options.ctx) {
    const page = pageMetrics(document);
    const boxes: string[] = [];
    if (document.header.enabled) {
      const text = bandText(document.header, options.ctx);
      if (text)
        boxes.push(
          marginBox(
            "top",
            document.header.align,
            cssString(text),
            document.header,
            theme,
          ),
        );
    }
    if (document.footer.enabled) {
      const text = bandText(document.footer, options.ctx);
      const numbers = document.footer.page_numbers
        ? `"صفحة " counter(page) " من " counter(pages)`
        : "";
      const content = [text ? cssString(text) : "", numbers]
        .filter(Boolean)
        .join(' "   —   " ');
      if (content)
        boxes.push(
          marginBox(
            "bottom",
            document.footer.align,
            content,
            document.footer,
            theme,
          ),
        );
    }
    rules.push(
      `@page{size:A4;margin:${page.top}mm ${page.start}mm ${page.bottom}mm ${page.end}mm;${boxes.join("")}}`,
      "html,body{margin:0;padding:0;background:#fff}",
      "body{-webkit-print-color-adjust:exact;print-color-adjust:exact}",
      `${scope} [data-unit]{break-inside:avoid}`,
      `${scope} [data-keep]{break-after:avoid}`,
      `${scope} .dc-pagebreak{break-before:page;height:0}`,
      ".dc-watermark{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0}",
      `.dc-watermark span{transform:rotate(-30deg);font-family:${fontStack(theme.font_family)};font-size:110pt;font-weight:700;color:rgba(0,0,0,0.06)}`,
    );
  }
  rules.push(
    `${scope}{direction:rtl;text-align:start;font-family:${fontStack(theme.font_family)};font-size:${clamp(theme.font_size, 8, 24, 12)}pt;line-height:${clamp(theme.line_height, 1, 3, 1.7)};color:${color};font-kerning:normal;word-wrap:break-word;overflow-wrap:break-word}`,
    `${scope} [data-unit]{margin-top:calc(var(--dc-mt, 0pt) + var(--dc-gap, 0px))}`,
    `${scope} .dc-block{position:relative}`,
    `${scope} .dc-p{margin-bottom:${spacing}pt}`,
    `${scope} .dc-h{font-weight:700;color:${accent};margin-bottom:${spacing * 1.5}pt}`,
    `${scope} .dc-h1{font-size:1.75em;text-align:center;--dc-mt:4pt}`,
    `${scope} .dc-h2{font-size:1.3em;--dc-mt:8pt}`,
    `${scope} .dc-h3{font-size:1.1em;--dc-mt:6pt}`,
    `${scope} .dc-text{margin-bottom:${spacing}pt}`,
    `${scope} .dc-clause-title{font-weight:700;margin-bottom:${spacing / 2}pt;--dc-mt:${spacing}pt}`,
    `${scope} .dc-clause-no{color:${accent}}`,
    `${scope} .dc-clause-body .dc-p{text-align:justify}`,
    `${scope} .dc-letterhead{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6mm;padding-bottom:4mm;margin-bottom:${spacing * 2}pt;border-bottom:1.5pt solid ${accent}}`,
    `${scope} .dc-letterhead .dc-p{margin-bottom:1pt}`,
    `${scope} .dc-lh-end{text-align:end}`,
    `${scope} .dc-lh-logo img{display:block;max-height:40mm;object-fit:contain}`,
    `${scope} .dc-table-wrap{margin-bottom:${spacing * 1.5}pt}`,
    `${scope} .dc-table{width:100%;border-collapse:collapse;table-layout:fixed}`,
    `${scope} .dc-table td,${scope} .dc-table th{padding:1.6mm 2.4mm;vertical-align:top;text-align:start;font-weight:inherit}`,
    `${scope} .dc-table th{font-weight:700;background:${accent}14}`,
    `${scope} .dc-table--borders td,${scope} .dc-table--borders th{border:0.75pt solid #9aa5ab}`,
    `${scope} .dc-table .dc-p{margin-bottom:0}`,
    `${scope} .dc-schedule{margin-bottom:${spacing * 1.5}pt}`,
    `${scope} .dc-sched-row{display:grid;border:0.75pt solid #9aa5ab;border-top:0}`,
    `${scope} .dc-sched-row>div{padding:1.2mm 2.4mm;border-inline-start:0.75pt solid #9aa5ab}`,
    `${scope} .dc-sched-row>div:first-child{border-inline-start:0}`,
    `${scope} .dc-sched-head{border-top:0.75pt solid #9aa5ab;font-weight:700;background:${accent}14}`,
    `${scope} .dc-signatures{display:grid;gap:6mm 10mm;--dc-mt:${spacing * 3}pt;margin-bottom:${spacing * 2}pt}`,
    `${scope} .dc-signer{text-align:center;display:flex;flex-direction:column;gap:2.5mm}`,
    `${scope} .dc-signer-title{font-weight:700}`,
    `${scope} .dc-sign-line{color:#444}`,
    `${scope} .dc-image{margin-bottom:${spacing}pt}`,
    `${scope} .dc-image img{max-width:100%}`,
    `${scope} .dc-sep{padding-block:${spacing}pt}`,
    `${scope} .dc-sep-line{border-top:1pt solid ${accent}}`,
    `${scope} .dc-field--missing{color:#9a5b00}`,
    `${scope} strong{font-weight:700}`,
  );
  return rules.join("\n");
}

/**
 * A complete HTML page for printing or PDF: no scripts, every resource
 * inline. `fontFaces` is @font-face CSS with data: URLs.
 */
export function printableHtml(
  document: ContractDocument,
  ctx: RenderContext,
  options: { title: string; fontFaces?: string },
) {
  const csp =
    "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:";
  return (
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<title>${escapeHtml(options.title)}</title>` +
    `<style>${options.fontFaces ?? ""}\n${documentCss(document, { print: true, ctx })}</style></head><body>` +
    (ctx.watermark
      ? `<div class="dc-watermark"><span>${escapeHtml(ctx.watermark)}</span></div>`
      : "") +
    `<div class="dc-doc"><div class="dc-flow">${bodyHtml(document, ctx)}</div></div></body></html>`
  );
}

/** Font families a document uses, to embed only those. */
export function usedFonts(document: ContractDocument) {
  const fonts = new Set<string>();
  const add = (name: string | null | undefined) => {
    const safe = safeFontName(name);
    if (safe) fonts.add(safe);
  };
  add(document.theme.font_family);
  add(document.clause_settings.title_style.font_family);
  add(document.clause_settings.body_style.font_family);
  for (const block of document.blocks) add(block.style?.font_family);
  return [...fonts];
}
