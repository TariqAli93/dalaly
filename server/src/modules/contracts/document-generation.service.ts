import fs from "node:fs/promises";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { legalFormulations } from "../../infrastructure/database/schema.js";
import { resolveManagedFile } from "../documents/documents.storage.js";
import {
  DOCUMENT_VARIABLES,
  VARIABLE_ALIASES,
  fillDocx,
  sha256,
  documentError,
  validateVariables,
} from "./docx.engine.js";
import {
  interpolateLegalText,
  type ContractDocument,
} from "./legal-content.engine.js";

export async function selectedFormulation(kind: string, executor: any = db) {
  const rows = await executor
    .select()
    .from(legalFormulations)
    .where(
      and(
        or(
          eq(
            legalFormulations.contractType,
            kind === "rental" ? "rental" : "sale",
          ),
          eq(legalFormulations.contractType, "general"),
        ),
        eq(legalFormulations.isDefault, true),
        isNull(legalFormulations.deletedAt),
      ),
    )
    .orderBy(
      asc(legalFormulations.contractType),
      desc(legalFormulations.updatedAt),
    );
  // A shared default is a fallback; a specific default always takes precedence.
  return (rows.find(
    (row: typeof legalFormulations.$inferSelect) =>
      row.contractType === (kind === "rental" ? "rental" : "sale"),
  ) ?? rows[0]) as typeof legalFormulations.$inferSelect | undefined;
}
export function expandDocumentValues(values: Record<string, string>) {
  return Object.fromEntries(
    DOCUMENT_VARIABLES.map((key) => [
      key,
      values[VARIABLE_ALIASES[key] ?? key] ?? values[key] ?? "",
    ]),
  );
}
export async function legalWording(
  kind: string,
  values: Record<string, string>,
  override: string | null | undefined,
  executor: any = db,
) {
  const row = await selectedFormulation(kind, executor);
  if (!row)
    throw documentError(
      "حدد صيغة افتراضية للبيع أو الإيجار من صفحة الصيغ القانونية.",
    );
  const source = override ?? row.content;
  validateVariables(source);
  return {
    row,
    source,
    text: interpolateLegalText(source, expandDocumentValues(values)),
  };
}
export async function generateDocumentFile(
  template: {
    id: number;
    version: number;
    name: string;
    docxFilePath: string | null;
    docxHash: string | null;
  },
  model: ContractDocument,
  values: Record<string, string>,
) {
  if (!template.docxFilePath)
    throw documentError("استورد قالب DOCX لهذا النوع أولاً.");
  const original = await fs.readFile(resolveManagedFile(template.docxFilePath));
  if (sha256(original) !== template.docxHash)
    throw documentError("تغير ملف القالب؛ أعد استيراده قبل إنشاء العقد.");
  const prepared = expandDocumentValues({
    ...values,
    "contract.code": model.data.code,
    legal_formulation: model.sections
      .flatMap((s) => s.clauses.map((c) => c.text))
      .join("\n\n"),
    additional_conditions: model.data.additional_conditions,
    assets_summary: model.data.assets
      .map((a) =>
        a.details
          .filter((d) => d.value)
          .map((d) => `${d.label}: ${d.value}`)
          .join("\n"),
      )
      .join("\n\n"),
    parties_summary: model.data.parties
      .map(
        (p) =>
          `${p.label}: ${p.name}\nرقم الهوية: ${p.identity_number} · بطاقة السكن: ${p.residence_card_number ?? ""}\nالعنوان: ${p.address} · الهاتف: ${p.phone}`,
      )
      .join("\n\n"),
    agreement_terms: [
      ...(model.data.agreement_terms ?? []).map(
        (r) => `${r.label}: ${r.value}`,
      ),
      model.data.explanation ?? "",
    ]
      .filter(Boolean)
      .join("\n"),
    witnesses: (model.data.witnesses ?? [])
      .map((w) => `الشاهد: ${w.name} · التوقيع: __________________`)
      .join("\n"),
    office_role: `${model.data.office.name} · ${model.data.office.role ?? ""}`,
  });
  const docx = fillDocx(original, prepared);
  return {
    docxData: docx.toString("base64"),
    docxHash: sha256(docx),
    documentTemplateSnapshot: {
      id: template.id,
      name: template.name,
      version: template.version,
      hash: template.docxHash,
      file_path: template.docxFilePath,
    },
  };
}
