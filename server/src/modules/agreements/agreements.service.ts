import {
  TEMPLATES,
  resolveValues,
  scheduleFor,
  type AgreementContext,
  type ContractDocument,
  type RenderContext,
  type TemplateKey,
} from "../../shared/contract-document/index.js";
import { renderDocx } from "./agreements.docx.js";
import {
  getAgreementRow,
  getRevisionRow,
  liveContext,
  officeLogoData,
  readTerms,
} from "./agreements.repository.js";

/**
 * What an export renders: an issued revision exactly as stored, or a draft
 * with the linked records' current data and a «مسودة» watermark. A
 * cancelled contract renders its last revision marked «ملغى».
 */
async function exportSource(id: number, revision?: number) {
  const row = await getAgreementRow(id);
  const template = row.templateKey as TemplateKey;
  const issuedRevision =
    revision ??
    (row.status === "issued" || row.status === "cancelled"
      ? row.currentRevision || undefined
      : undefined);
  if (issuedRevision) {
    const stored = await getRevisionRow(id, issuedRevision);
    const terms = readTerms(stored.terms);
    return {
      row,
      template,
      revision: issuedRevision,
      document: stored.document as ContractDocument,
      ctx: {
        template,
        values: stored.values as Record<string, string>,
        missing: "blank",
        logo: stored.logo,
        schedule: scheduleFor(template, terms),
        watermark: row.status === "cancelled" ? "ملغى" : null,
      } satisfies RenderContext,
    };
  }
  const terms = readTerms(row.terms);
  const context: AgreementContext = await liveContext(row);
  return {
    row,
    template,
    revision: null,
    document: row.document as ContractDocument,
    ctx: {
      template,
      values: resolveValues(
        { template, number: row.code, revision: row.currentRevision + 1 },
        context,
        terms,
      ),
      missing: "blank",
      logo: await officeLogoData(),
      schedule: scheduleFor(template, terms),
      watermark: row.status === "cancelled" ? "ملغى" : "مسودة",
    } satisfies RenderContext,
  };
}

/** The contract as a Word file, base64 in JSON like the other file routes. */
export async function agreementDocx(id: number, revision?: number) {
  const source = await exportSource(id, revision);
  const title = TEMPLATES[source.template].title;
  const buffer = await renderDocx(source.document, source.ctx, {
    title,
    number: source.row.code,
  });
  const suffix = source.revision
    ? source.revision > 1
      ? ` - مراجعة ${source.revision}`
      : ""
    : " - مسودة";
  return {
    file_name: `${title} ${source.row.code}${suffix}.docx`,
    revision: source.revision,
    data: buffer.toString("base64"),
  };
}
