import { z } from "zod";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  auditLogs,
  legalFormulations,
} from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import { DocumentError } from "../../shared/errors.js";
import { DEFAULT_FORMULATIONS } from "./document-defaults.js";
import {
  decodeUpload,
  documentError,
  inspectDocx,
  validateVariables,
  validateContractVariables,
} from "./docx.engine.js";

export const formulationInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    contract_type: z.enum(["sale", "rental", "general"]),
    content: z.string().trim().min(1).max(100000),
    version: z.number().int().positive().optional(),
  })
  .strict();
type Input = z.infer<typeof formulationInput>;
export async function listFormulations() {
  const rows = await db
    .select()
    .from(legalFormulations)
    .where(isNull(legalFormulations.deletedAt))
    .orderBy(asc(legalFormulations.contractType), asc(legalFormulations.title));
  return rows.map((row) => toApiObject(row));
}
async function event(
  tx: any,
  id: number,
  action: string,
  actor: number,
  oldValue: unknown,
  newValue: unknown,
) {
  await tx
    .insert(auditLogs)
    .values({
      entityType: "legal_formulation",
      entityId: id,
      action,
      userId: actor,
      oldValue,
      newValue,
    });
}
export async function saveFormulation(
  input: Input,
  actor: number,
  id?: number,
) {
  validateVariables(input.content);
  validateContractVariables(
    [...input.content.matchAll(/{{\s*([a-zA-Z][\w.]*)\s*}}/g)].map(
      (match) => match[1],
    ),
    input.contract_type,
  );
  return db.transaction(async (tx) => {
    if (!id) {
      const [row] = await tx
        .insert(legalFormulations)
        .values({
          title: input.title,
          content: input.content,
          contractType: input.contract_type,
        })
        .returning();
      await event(tx, row.id, "created", actor, null, row);
      return toApiObject(row);
    }
    const [old] = await tx
      .select()
      .from(legalFormulations)
      .where(
        and(eq(legalFormulations.id, id), isNull(legalFormulations.deletedAt)),
      )
      .for("update");
    if (!old) throw documentError("الصيغة غير موجودة.");
    if (input.version !== old.version)
      throw new DocumentError(
        "عُدلت الصيغة من جلسة أخرى؛ حدّث القائمة قبل الحفظ.",
        409,
      );
    const [row] = await tx
      .update(legalFormulations)
      .set({
        title: input.title,
        content: input.content,
        contractType: input.contract_type,
        isDefault: old.contractType === input.contract_type && old.isDefault,
        version: old.version + 1,
        updatedAt: new Date(),
        legacyMetadata: old.legacyMetadata,
      })
      .where(eq(legalFormulations.id, id))
      .returning();
    await event(tx, id, "updated", actor, old, row);
    return toApiObject(row);
  });
}
export async function defaultFormulation(id: number, actor: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(192820)`);
    const [row] = await tx
      .select()
      .from(legalFormulations)
      .where(
        and(eq(legalFormulations.id, id), isNull(legalFormulations.deletedAt)),
      )
      .for("update");
    if (!row) throw documentError("الصيغة غير موجودة.");
    validateVariables(row.content);
    await tx
      .update(legalFormulations)
      .set({ isDefault: false })
      .where(eq(legalFormulations.contractType, row.contractType));
    await tx
      .update(legalFormulations)
      .set({ isDefault: true })
      .where(eq(legalFormulations.id, id));
    await event(tx, id, "default", actor, null, {
      contract_type: row.contractType,
    });
    return { ok: true };
  });
}
export async function deleteFormulation(id: number, actor: number) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(legalFormulations)
      .set({ deletedAt: new Date(), isDefault: false, updatedAt: new Date() })
      .where(
        and(eq(legalFormulations.id, id), isNull(legalFormulations.deletedAt)),
      )
      .returning();
    if (!row) throw documentError("الصيغة غير موجودة.");
    await event(tx, id, "deleted", actor, row, null);
    return { ok: true };
  });
}
export async function copyFormulation(id: number, actor: number) {
  const [row] = await db
    .select()
    .from(legalFormulations)
    .where(
      and(eq(legalFormulations.id, id), isNull(legalFormulations.deletedAt)),
    );
  if (!row) throw documentError("الصيغة غير موجودة.");
  return saveFormulation(
    {
      title: `${row.title.slice(0, 185)} · نسخة`,
      content: row.content,
      contract_type: row.contractType as Input["contract_type"],
    },
    actor,
  );
}
export async function restoreFormulations(
  actor: number,
  kind: "sale" | "rental",
) {
  const source = DEFAULT_FORMULATIONS[kind];
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(192820)`);
    const [old] = await tx
      .select()
      .from(legalFormulations)
      .where(eq(legalFormulations.systemKey, source.systemKey))
      .for("update");
    await tx
      .update(legalFormulations)
      .set({ isDefault: false })
      .where(eq(legalFormulations.contractType, kind));
    const [row] = old
      ? await tx
          .update(legalFormulations)
          .set({
            ...source,
            contractType: kind,
            isDefault: true,
            deletedAt: null,
            version: old.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(legalFormulations.id, old.id))
          .returning()
      : await tx
          .insert(legalFormulations)
          .values({ ...source, contractType: kind, isDefault: true })
          .returning();
    await event(tx, row.id, "restore", actor, old ?? null, row);
    return toApiObject(row);
  });
}
export function importFormulation(filename: string, data: string) {
  const buffer = decodeUpload(data);
  let content: string;
  if (/\.docx$/i.test(filename)) content = inspectDocx(buffer).text;
  else if (/\.txt$/i.test(filename)) {
    if (buffer.length > 512 * 1024)
      throw documentError("ملف النص يتجاوز ٥١٢ كيلوبايت.");
    try {
      content = new TextDecoder("utf-8", { fatal: true })
        .decode(buffer)
        .replace(/^\uFEFF/, "");
    } catch {
      throw documentError("احفظ ملف TXT بترميز UTF-8.");
    }
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content))
      throw documentError("ملف النص يحتوي على بيانات غير نصية.");
  } else throw documentError("الاستيراد يدعم DOCX وTXT فقط.");
  if (!content.trim() || content.length > 100000)
    throw documentError("النص فارغ أو يتجاوز الحد المسموح.");
  validateVariables(content);
  return {
    title: filename
      .replace(/^.*[\\/]/, "")
      .replace(/\.(txt|docx)$/i, "")
      .slice(0, 200),
    content,
  };
}
