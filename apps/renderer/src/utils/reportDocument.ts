/**
 * A report as the screen, the Excel file, the PDF and the printout all show
 * it: titled sections (one per currency) of summary figures and tables.
 * Each report's response is mapped to this once (utils/financialReports.ts),
 * so the four never disagree. Amounts stay decimal strings until they are
 * shown; nothing here does arithmetic on them.
 */
import { platform } from "../platform";
import { fontFacesFor, officeLogoDataUrl } from "./contractExport";
import { formatAmount, formatDate, formatDateTime } from "./format";
import { signedAmountToMinor } from "./money";
import type { Currency } from "../types";

export type ReportCell = string | number | null;
/** percent: a share already in percent (33.3), shown «33.3%». */
export type ReportColumnKind = "text" | "money" | "number" | "percent" | "date";

/** Columns lined up at the end, as figures. */
export const numericKind = (kind?: ReportColumnKind) =>
  kind === "money" || kind === "number" || kind === "percent";

export interface ReportColumn {
  key: string;
  title: string;
  kind?: ReportColumnKind;
  /** Its amounts' currency, where columns of one row differ. */
  currency?: Currency;
}

/** A row's cells by column key, and where some of them lead. */
export interface ReportRow {
  cells: Record<string, ReportCell | undefined>;
  /** Column key to route, only where the viewer may open it. */
  links?: Record<string, string>;
  /** A row that reads apart: a heading's subtotal, a cancelled document. */
  tone?: "muted" | "strong";
  /** Its amounts' currency, where a table mixes them. */
  currency?: Currency;
}

export interface ReportTable {
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** The footer: totals by column key. */
  total?: Record<string, ReportCell | undefined>;
  /** Shown when there are no rows. */
  empty?: string;
}

export interface ReportFigure {
  label: string;
  value: string;
  kind?: ReportColumnKind;
  tone?: "good" | "bad" | "warn";
}

export interface ReportSection {
  /** Its amounts' currency. */
  currency: Currency;
  /** A heading other than the currency's (an operational report). */
  title?: string;
  figures: ReportFigure[];
  tables: ReportTable[];
  /** A check that failed (an unbalanced trial balance): never expected. */
  warning?: string | null;
}

export interface ReportDocument {
  title: string;
  /** «من 1/1/2026 إلى 31/10/2026» or «في 31/10/2026». */
  period: string;
  sections: ReportSection[];
  notes: string[];
  /** The file name, without extension. */
  fileName: string;
}

export const currencyTitle = (currency: Currency) =>
  currency === "USD" ? "بالدولار" : "بالدينار";
export const sectionTitle = (section: ReportSection) =>
  section.title ?? currencyTitle(section.currency);

/** A cell as the screen and the printout show it. */
export function cellText(
  value: ReportCell | undefined,
  kind: ReportColumnKind | undefined,
  currency: Currency,
) {
  if (value === null || value === undefined || value === "") return "";
  if (kind === "money") return formatAmount(String(value), currency);
  if (kind === "date") return formatDate(String(value));
  if (kind === "percent") return `${value}%`;
  return String(value);
}

/** "-1,250.50" sorts below "300.00": compared exactly, as hundredths. */
export function compareCells(a: ReportCell, b: ReportCell, kind?: string) {
  if (kind === "money") {
    const difference =
      (signedAmountToMinor(a) ?? 0n) - (signedAmountToMinor(b) ?? 0n);
    return difference === 0n ? 0 : difference < 0n ? -1 : 1;
  }
  if (kind === "number" || kind === "percent")
    return Number(a ?? -Infinity) - Number(b ?? -Infinity) || 0;
  return String(a ?? "").localeCompare(String(b ?? ""), "ar");
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

/** The printable page: A4 landscape, the office's header, every table. */
export async function reportHtml(report: ReportDocument) {
  const [faces, logo] = await Promise.all([
    fontFacesFor(["IBM Plex Sans Arabic"]),
    officeLogoDataUrl(),
  ]);
  const align = (kind?: ReportColumnKind) => (numericKind(kind) ? "num" : "");
  const table = (item: ReportTable, currency: Currency) => {
    const head = item.columns
      .map(
        (column) =>
          `<th class="${align(column.kind)}">${escapeHtml(column.title)}</th>`,
      )
      .join("");
    const body = item.rows.length
      ? item.rows
          .map(
            (row) =>
              `<tr class="${row.tone ?? ""}">${item.columns
                .map(
                  (column) =>
                    `<td class="${align(column.kind)}">${escapeHtml(cellText(row.cells[column.key] ?? null, column.kind, column.currency ?? row.currency ?? currency))}</td>`,
                )
                .join("")}</tr>`,
          )
          .join("")
      : `<tr><td colspan="${item.columns.length}" class="empty">${escapeHtml(item.empty ?? "لا بيانات.")}</td></tr>`;
    const foot = item.total
      ? `<tfoot><tr>${item.columns
          .map(
            (column) =>
              `<td class="${align(column.kind)}">${escapeHtml(cellText(item.total![column.key] ?? null, column.kind, currency))}</td>`,
          )
          .join("")}</tr></tfoot>`
      : "";
    return `<h3>${escapeHtml(item.title)}</h3><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
  };
  const sections = report.sections
    .map(
      (section) => `<section>
  <h2>${escapeHtml(sectionTitle(section))}</h2>
  ${section.warning ? `<p class="warning">${escapeHtml(section.warning)}</p>` : ""}
  <div class="figures">${section.figures
    .map(
      (figure) =>
        `<div><span>${escapeHtml(figure.label)}</span><strong>${escapeHtml(cellText(figure.value, figure.kind ?? "money", section.currency))}</strong></div>`,
    )
    .join("")}</div>
  ${section.tables.map((item) => table(item, section.currency)).join("")}
</section>`,
    )
    .join("");
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(report.title)}</title>
<style>
${faces}
@page { size: A4 landscape; margin: 12mm; }
body { margin: 0; font-family: "IBM Plex Sans Arabic", Tahoma, sans-serif; color: #111; font-size: 9.5pt; }
header { display: flex; align-items: center; gap: 4mm; border-bottom: 1.5pt solid #222; padding-bottom: 3mm; margin-bottom: 4mm; }
header img { height: 14mm; }
header h1 { font-size: 15pt; margin: 0; }
header .period { margin-inline-start: auto; font-size: 10pt; }
h2 { font-size: 12pt; margin: 5mm 0 2mm; }
h3 { font-size: 10.5pt; margin: 4mm 0 1.5mm; }
.figures { display: flex; flex-wrap: wrap; gap: 2mm 8mm; margin-bottom: 2mm; }
.figures div { display: flex; flex-direction: column; }
.figures span { font-size: 8.5pt; color: #444; }
.figures strong { font-size: 11pt; }
table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th, td { border-bottom: 0.5pt solid #bbb; padding: 1.2mm 1.5mm; text-align: start; }
th { background: #eee; font-weight: 700; }
td.num, th.num { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
tfoot td { font-weight: 700; border-top: 1pt solid #222; border-bottom: none; }
tr.muted td { color: #777; }
tr.strong td { font-weight: 700; }
td.empty { color: #777; text-align: center; }
.warning { color: #a00; font-weight: 700; }
.notes { margin-top: 5mm; font-size: 8pt; color: #555; }
footer { margin-top: 4mm; font-size: 8pt; color: #666; }
</style>
</head>
<body>
<header>
  ${logo ? `<img src="${logo}" alt="">` : ""}
  <h1>${escapeHtml(report.title)}</h1>
  <span class="period">${escapeHtml(report.period)}</span>
</header>
${sections || '<p class="empty">لا بيانات في هذه المدة.</p>'}
${report.notes.length ? `<div class="notes">${report.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}</div>` : ""}
<footer>استُخرج في ${escapeHtml(formatDateTime(new Date()))}</footer>
</body>
</html>`;
}

export async function printReport(report: ReportDocument) {
  return platform.printHtml({
    html: await reportHtml(report),
    suggestedName: report.fileName,
  });
}

export async function exportReportPdf(report: ReportDocument) {
  return platform.exportPdf({
    html: await reportHtml(report),
    suggestedName: `${report.fileName}.pdf`,
    title: report.title,
    text: "",
  });
}

/**
 * A spreadsheet cell: amounts and counts as numbers, so they can be summed
 * in Excel. An amount beyond what a double holds to the hundredth stays
 * text rather than lose its cents.
 */
function sheetCell(value: ReportCell, kind?: ReportColumnKind) {
  if (value === null || value === "") return null;
  if (numericKind(kind)) {
    const number = Number(value);
    if (Number.isFinite(number) && Math.abs(number) < 9e13) return number;
  }
  return kind === "date" ? formatDate(String(value)) : value;
}

/** A sheet's name: the section's title, else its currency; 31 characters, unique. */
function sheetName(section: ReportSection, book: { SheetNames: string[] }) {
  const base = (
    section.title ?? (section.currency === "USD" ? "دولار" : "دينار")
  )
    .replace(/[\\/?*[\]:]/g, " ")
    .slice(0, 28);
  let name = base;
  for (let index = 2; book.SheetNames.includes(name); index++)
    name = `${base} ${index}`;
  return name;
}

/** One sheet per currency, its tables one under another, right to left. */
export async function exportReportExcel(report: ReportDocument) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  for (const section of report.sections) {
    const rows: Array<Array<string | number | null>> = [
      [report.title],
      [report.period],
    ];
    const money: Array<{ r: number; c: number }> = [];
    for (const figure of section.figures) {
      if ((figure.kind ?? "money") === "money")
        money.push({ r: rows.length, c: 1 });
      rows.push([
        figure.label,
        sheetCell(figure.value, figure.kind ?? "money"),
      ]);
    }
    for (const table of section.tables) {
      rows.push(
        [],
        [table.title],
        table.columns.map((column) => column.title),
      );
      const add = (cells: Record<string, ReportCell | undefined>) => {
        rows.push(
          table.columns.map((column) => {
            if (column.kind === "money")
              money.push({ r: rows.length, c: table.columns.indexOf(column) });
            return sheetCell(cells[column.key] ?? null, column.kind);
          }),
        );
      };
      for (const row of table.rows) add(row.cells);
      if (table.total) add(table.total);
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    for (const { r, c } of money) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = "#,##0.00";
    }
    XLSX.utils.book_append_sheet(book, sheet, sheetName(section, book));
  }
  if (!report.sections.length)
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([[report.title], [report.period], ["لا بيانات"]]),
      "التقرير",
    );
  book.Workbook = { Views: [{ RTL: true }] };
  const data = XLSX.write(book, { type: "array", bookType: "xlsx" });
  return platform.saveFile({
    data: new Uint8Array(data as ArrayBuffer),
    suggestedName: `${report.fileName}.xlsx`,
    title: "حفظ التقرير",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
}
