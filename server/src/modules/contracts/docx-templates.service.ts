import fs from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../infrastructure/database/db.js";
import {
  auditLogs,
  contractTemplates,
} from "../../infrastructure/database/schema.js";
import {
  resolveManagedFile,
  saveManagedFile,
} from "../documents/documents.storage.js";
import { DEFAULT_DOCX } from "./default-docx.assets.js";
import {
  decodeUpload,
  documentError,
  DOCX_MIME,
  inspectDocx,
  sha256,
  validateContractVariables,
} from "./docx.engine.js";
import { toApiObject } from "../../shared/utils/case.js";
import { DocumentError } from "../../shared/errors.js";
export const templateUpload = z
  .object({
    filename: z
      .string()
      .min(1)
      .max(255)
      .regex(/\.docx$/i),
    data: z.string().max(17 * 1024 * 1024),
    version: z.number().int().positive().optional(),
  })
  .strict();
export async function templateDocx(id: number) {
  const [row] = await db
    .select()
    .from(contractTemplates)
    .where(eq(contractTemplates.id, id));
  if (!row?.docxFilePath) throw documentError("قالب DOCX غير موجود.");
  const buffer = await fs.readFile(resolveManagedFile(row.docxFilePath));
  if (sha256(buffer) !== row.docxHash)
    throw documentError("تغير ملف القالب خارج التطبيق؛ أعد استيراده.");
  return { row, buffer };
}
export async function replaceDocxTemplate(
  id: number,
  input: z.infer<typeof templateUpload> | null,
  actor: number,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(192820)`);
    const [old] = await tx
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.id, id))
      .for("update");
    if (
      !old ||
      !["sale", "rental"].includes(old.contractType) ||
      !old.docxFilePath
    )
      throw documentError("قالب DOCX غير موجود.");
    if (input && input.version !== old.version)
      throw new DocumentError("تغير القالب من جلسة أخرى؛ أعد تحميله.", 409);
    const data = input?.data ?? DEFAULT_DOCX[old.contractType];
    const filename =
      input?.filename.replace(/^.*[\\/]/, "") ?? `${old.contractType}.docx`;
    const buffer = decodeUpload(data);
    const inspected = inspectDocx(buffer, true);
    validateContractVariables(inspected.variables, old.contractType);
    const file = saveManagedFile(
      "contract-templates",
      buffer.toString("base64"),
      filename,
      DOCX_MIME,
    );
    await tx
      .update(contractTemplates)
      .set({ isDefault: false })
      .where(
        and(
          eq(contractTemplates.contractType, old.contractType),
          eq(contractTemplates.isDefault, true),
        ),
      );
    const [row] = await tx
      .update(contractTemplates)
      .set({
        docxFilePath: file.filePath,
        docxFileName: filename,
        docxHash: inspected.hash,
        docxVariables: inspected.variables,
        isDefault: true,
        isActive: true,
        version: old.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(contractTemplates.id, id))
      .returning();
    // Old immutable files remain available to snapshots/backups; never unlink.
    await tx
      .insert(auditLogs)
      .values({
        entityType: "contract_template",
        entityId: id,
        action: input ? "import_docx" : "restore_docx",
        oldValue: {
          version: old.version,
          hash: old.docxHash,
          file_path: old.docxFilePath,
        },
        newValue: {
          version: row.version,
          hash: row.docxHash,
          file_path: row.docxFilePath,
        },
        userId: actor,
      });
    return toApiObject(row);
  });
}
