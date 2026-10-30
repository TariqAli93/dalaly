/**
 * Turning a contract into a PDF, a printout or a Word file. PDF and print use
 * the shared HTML renderer with the bundled fonts embedded as data: URLs (the
 * print window loads nothing from disk); Word files are made by the API.
 * A successful export is recorded on the contract.
 */
import {
  emptyTerms,
  printableHtml,
  resolveValues,
  scheduleFor,
  usedFonts,
  type AgreementContext,
  type AgreementTerms,
  type ContractDocument,
  type RenderContext,
  type TemplateKey,
} from "@contract-document/index";
import { platform } from "../platform";
import { API_BASE, getToken } from "../services/api.service";
import * as agreementsService from "../services/agreements.service";
import type {
  AgreementRecord,
  AgreementRevisionRecord,
  AgreementTemplateRecord,
} from "../types";

type FontFile = { weight: string; load: () => Promise<{ default: string }> };

// ?inline turns a font into a data: URL in its own chunk, loaded only when
// a contract is exported or printed.
const FONT_FILES: Record<string, FontFile[]> = {
  "IBM Plex Sans Arabic": [
    {
      weight: "400",
      load: () =>
        import("../assets/fonts/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf?inline"),
    },
    {
      weight: "600 900",
      load: () =>
        import("../assets/fonts/ibmplexsansarabic/IBMPlexSansArabic-Bold.ttf?inline"),
    },
  ],
  Tajawal: [
    {
      weight: "400",
      load: () => import("../assets/fonts/tajawal/Tajawal-Regular.ttf?inline"),
    },
    {
      weight: "600 900",
      load: () => import("../assets/fonts/tajawal/Tajawal-Bold.ttf?inline"),
    },
  ],
  Almarai: [
    {
      weight: "400",
      load: () => import("../assets/fonts/almarai/Almarai-Regular.ttf?inline"),
    },
    {
      weight: "600 900",
      load: () => import("../assets/fonts/almarai/Almarai-Bold.ttf?inline"),
    },
  ],
  Cairo: [
    {
      weight: "200 1000",
      load: () => import("../assets/fonts/Cairo.ttf?inline"),
    },
  ],
};
const faceCache = new Map<string, string>();

async function fontFaces(document: ContractDocument) {
  // The fallback in every font stack is always embedded too.
  return fontFacesFor([...usedFonts(document), "IBM Plex Sans Arabic"]);
}

/** @font-face rules embedding the bundled fonts of these families. */
export async function fontFacesFor(names: string[]) {
  const families = new Set(names);
  const faces: string[] = [];
  for (const family of families) {
    const files = FONT_FILES[family];
    if (!files) continue;
    for (const file of files) {
      const key = `${family}|${file.weight}`;
      let face = faceCache.get(key);
      if (!face) {
        const { default: url } = await file.load();
        face = `@font-face{font-family:"${family}";src:url(${url}) format("truetype");font-weight:${file.weight};font-style:normal}`;
        faceCache.set(key, face);
      }
      faces.push(face);
    }
  }
  return faces.join("\n");
}

/** The office logo as a data: URL (the print window cannot call the API). */
export async function officeLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/office/logo`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > 2_000_000) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** The logo URL the editor canvas shows (with the session token, like images). */
export { logoUrl as officeLogoUrl } from "../services/company-settings.service";

/**
 * What a template shows while it is designed: the contract type and the
 * office details are known; the rest show their field names.
 */
export function templateValues(template: AgreementTemplateRecord) {
  return resolveValues(
    { template: template.key, number: null, revision: null },
    { parties: {}, listing: null, company: template.company },
    emptyTerms(null),
  );
}

export type ExportSource = {
  agreementId: number;
  /** null: the draft as it is now */
  revision: number | null;
  document: ContractDocument;
  ctx: RenderContext;
  title: string;
  fileBase: string;
};

/** The values a draft shows now, from its linked records and terms. */
export function draftValues(
  template: TemplateKey,
  number: string,
  revision: number,
  context: AgreementContext,
  terms: AgreementTerms,
) {
  return resolveValues({ template, number, revision }, context, terms);
}

function safeFileName(value: string) {
  // eslint-disable-next-line no-control-regex -- Windows file names cannot hold control characters
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim();
}

/** What to export for a contract: a stored revision, or the current draft. */
export async function exportSourceFor(
  record: AgreementRecord,
  revision?: AgreementRevisionRecord | null,
): Promise<ExportSource> {
  if (revision) {
    return {
      agreementId: record.id,
      revision: revision.revision,
      document: revision.document,
      title: record.title,
      fileBase: safeFileName(
        `${record.title} ${record.code}${revision.revision > 1 ? ` - مراجعة ${revision.revision}` : ""}`,
      ),
      ctx: {
        template: record.template_key,
        values: revision.values,
        missing: "blank",
        logo: revision.logo,
        schedule: scheduleFor(record.template_key, revision.terms),
        watermark: record.status === "cancelled" ? "ملغى" : null,
      },
    };
  }
  return {
    agreementId: record.id,
    revision: null,
    document: record.document,
    title: record.title,
    fileBase: safeFileName(`${record.title} ${record.code} - مسودة`),
    ctx: {
      template: record.template_key,
      values: draftValues(
        record.template_key,
        record.code,
        record.current_revision + 1,
        record.context,
        record.terms,
      ),
      missing: "blank",
      logo: await officeLogoDataUrl(),
      schedule: scheduleFor(record.template_key, record.terms),
      watermark: record.status === "cancelled" ? "ملغى" : "مسودة",
    },
  };
}

export async function buildPrintableHtml(
  source: Pick<ExportSource, "document" | "ctx" | "title">,
) {
  return printableHtml(source.document, source.ctx, {
    title: source.title,
    fontFaces: await fontFaces(source.document),
  });
}

function baseName(path: string | undefined, fallback: string) {
  return path?.split(/[\\/]/).pop() || fallback;
}

export async function exportContractPdf(source: ExportSource) {
  const html = await buildPrintableHtml(source);
  const result = await platform.exportPdf({
    html,
    suggestedName: `${source.fileBase}.pdf`,
    title: source.title,
    text: "",
  });
  if (result.ok && !result.fallback)
    await agreementsService.recordAgreementExport(source.agreementId, {
      format: "pdf",
      revision: source.revision,
      file_name: baseName(result.path, `${source.fileBase}.pdf`),
    });
  return result;
}

export async function printContract(source: ExportSource) {
  const html = await buildPrintableHtml(source);
  const result = await platform.printHtml({
    html,
    suggestedName: source.fileBase,
  });
  if (result.ok && !result.fallback)
    await agreementsService.recordAgreementExport(source.agreementId, {
      format: "print",
      revision: source.revision,
      file_name: null,
    });
  return result;
}

export async function exportContractDocx(
  agreementId: number,
  revision: number | null,
) {
  const file = await agreementsService.getAgreementDocx(agreementId, revision);
  const bytes = Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0));
  const result = await platform.saveFile({
    data: bytes,
    suggestedName: file.file_name,
    title: "حفظ مستند Word",
    filters: [{ name: "مستند Word", extensions: ["docx"] }],
  });
  if (result.ok && !result.fallback)
    await agreementsService.recordAgreementExport(agreementId, {
      format: "docx",
      revision: file.revision,
      file_name: baseName(result.path, file.file_name),
    });
  return result;
}

/** Print a template as a blank form (fields show their names). */
export async function printTemplate(
  document: ContractDocument,
  ctx: RenderContext,
  title: string,
) {
  const html = await buildPrintableHtml({ document, ctx, title });
  return platform.printHtml({ html, suggestedName: title });
}
