import { and, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  contracts,
  contractProcedures,
  contractProcedureAttachments,
  auditLogs,
} from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import { ContractValidationError } from "../../shared/errors.js";
import {
  saveManagedFile,
  deleteManagedFile,
} from "../documents/documents.storage.js";
import {
  proceduresFor,
  procedureInputSchema,
  procedureAttachmentSchema,
} from "./agreement.schema.js";
function fail(message: string): never {
  throw new ContractValidationError([{ code: "agreement_procedure", message }]);
}
export async function getAgreementFollowup(id: number) {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, id));
  if (!contract) return null;
  const [rows, files] = await Promise.all([
    db
      .select()
      .from(contractProcedures)
      .where(eq(contractProcedures.contractId, id)),
    db
      .select()
      .from(contractProcedureAttachments)
      .where(eq(contractProcedureAttachments.contractId, id)),
  ]);
  const steps = proceduresFor(contract.contractType).map((def) => {
    const row = rows.find((r) => r.stepKey === def.key);
    return {
      ...def,
      ...(row ? toApiObject(row) : {}),
      step_key: def.key,
      status: row?.status ?? "pending",
      completed_on: row?.completedOn ?? null,
      reference: row?.reference ?? "",
      notes: row?.notes ?? "",
      updated_at: row?.updatedAt.toISOString() ?? null,
      attachments: files
        .filter((f) => f.stepKey === def.key)
        .map((f) => {
          const { file_path: _path, ...data } = toApiObject(f);
          return data;
        }),
    };
  });
  const signed = steps.some(
    (s) => s.key === "signed" && s.status === "completed",
  );
  const complete =
    signed &&
    steps.every(
      (s) =>
        s.status === "completed" ||
        ("optional" in s && s.optional && s.status === "not_applicable"),
    );
  return {
    status:
      contract.status === "cancelled"
        ? "cancelled"
        : contract.status === "draft"
          ? "draft"
          : complete
            ? "procedures_completed"
            : signed
              ? "signed"
              : "issued_unsigned",
    steps,
  };
}
export async function updateAgreementProcedure(
  id: number,
  raw: unknown,
  actorId: number,
) {
  const input = procedureInputSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [contract] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, id))
      .for("update");
    if (!contract) fail("الاتفاق غير موجود.");
    if (contract.status === "cancelled")
      fail("لا يمكن تعديل إجراءات عقد ملغى؛ السجل محفوظ للأرشيف.");
    const def = proceduresFor(contract.contractType).find(
      (s) => s.key === input.step_key,
    );
    if (!def) fail("الإجراء لا يطابق نوع الاتفاق.");
    if (
      input.status === "not_applicable" &&
      !("optional" in def && def.optional)
    )
      fail("هذا الإجراء أساسي ولا يمكن استبعاده.");
    if (input.status === "completed") {
      if (contract.status === "draft")
        fail(
          "أصدر نسخة الاتفاق للطباعة أولاً؛ الإصدار لا يعني توقيع الأطراف أو إكمال التسجيل.",
        );
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Baghdad",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      if (
        !input.completed_on ||
        Number.isNaN(Date.parse(input.completed_on)) ||
        new Date(input.completed_on).toISOString().slice(0, 10) !==
          input.completed_on ||
        input.completed_on > today
      )
        fail("تاريخ الإجراء غير صحيح أو لم يحن بعد.");
      const dependencies: Record<string, string[]> = {
        ownership_transferred: ["signed", "registered"],
        security_approved: ["signed", "security_requested"],
      };
      for (const key of dependencies[input.step_key] ??
        (input.step_key === "signed" ? [] : ["signed"])) {
        const [prior] = await tx
          .select()
          .from(contractProcedures)
          .where(
            and(
              eq(contractProcedures.contractId, id),
              eq(contractProcedures.stepKey, key),
            ),
          );
        if (prior?.status !== "completed")
          fail("سجّل الإجراء السابق وتاريخه قبل استكمال هذه الخطوة.");
        if (prior.completedOn! > input.completed_on)
          fail("تاريخ الإجراء يسبق تاريخ الخطوة السابقة.");
      }
      if (
        [
          "registered",
          "ownership_transferred",
          "notarized",
          "lease_registered",
          "security_approved",
        ].includes(input.step_key) &&
        !input.reference
      )
        fail("سجّل مرجع المستند أو الجهة لهذا الإجراء الرسمي.");
    }
    const [old] = await tx
      .select()
      .from(contractProcedures)
      .where(
        and(
          eq(contractProcedures.contractId, id),
          eq(contractProcedures.stepKey, input.step_key),
        ),
      );
    if (
      (old?.updatedAt.toISOString() ?? null) !==
      (input.expected_updated_at ?? null)
    )
      fail("تغير سجل الإجراء؛ أعد تحميل المتابعة.");
    // Completed downstream procedures must be reopened first, preserving chronology.
    if (
      old?.status === "completed" &&
      (input.status !== "completed" ||
        input.completed_on !== old.completedOn) &&
      ["signed", "registered", "security_requested"].includes(input.step_key)
    ) {
      const later = await tx
        .select()
        .from(contractProcedures)
        .where(eq(contractProcedures.contractId, id));
      if (
        later.some(
          (r) =>
            r.status === "completed" &&
            r.stepKey !== input.step_key &&
            (input.step_key === "signed" ||
              (input.step_key === "registered" &&
                r.stepKey === "ownership_transferred") ||
              (input.step_key === "security_requested" &&
                r.stepKey === "security_approved")),
        )
      )
        fail("عدّل الإجراءات التابعة أولاً للحفاظ على ترتيب المتابعة.");
    }
    const values = {
      contractId: id,
      stepKey: input.step_key,
      status: input.status,
      completedOn: input.completed_on,
      reference: input.reference,
      notes: input.notes,
      updatedBy: actorId,
      updatedAt: new Date(),
    };
    const [row] = await tx
      .insert(contractProcedures)
      .values(values)
      .onConflictDoUpdate({
        target: [contractProcedures.contractId, contractProcedures.stepKey],
        set: values,
      })
      .returning();
    await tx.insert(auditLogs).values({
      entityType: "contract_procedure",
      entityId: id,
      action: "update",
      oldValue: old ?? null,
      newValue: row,
      userId: actorId,
    });
  });
  return getAgreementFollowup(id);
}
export async function attachAgreementProcedure(
  id: number,
  raw: unknown,
  actorId: number,
) {
  const input = procedureAttachmentSchema.parse(raw);
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, id));
  if (
    !contract ||
    !proceduresFor(contract.contractType).some((s) => s.key === input.step_key)
  )
    fail("الإجراء أو الاتفاق غير موجود.");
  if (contract.status === "cancelled")
    fail("لا يمكن إضافة مرفقات إلى عقد ملغى.");
  const ext = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[input.file_type];
  const stored = saveManagedFile(
    `agreements-${id}`,
    input.data,
    `support.${ext}`,
    input.file_type,
  );
  try {
    if (stored.fileSize > 10 * 1024 * 1024)
      fail("الحد الأقصى للمرفق ١٠ ميغابايت.");
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, id))
        .for("update");
      if (!locked || locked.status === "cancelled")
        fail("لا يمكن إضافة مرفقات إلى عقد ملغى أو غير موجود.");
      const [file] = await tx
        .insert(contractProcedureAttachments)
        .values({
          contractId: id,
          stepKey: input.step_key,
          name: input.name,
          filePath: stored.filePath,
          fileType: input.file_type,
          fileSize: stored.fileSize,
          uploadedBy: actorId,
        })
        .returning();
      await tx.insert(auditLogs).values({
        entityType: "contract_procedure",
        entityId: id,
        action: "attachment",
        newValue: { id: file.id, step_key: input.step_key, name: input.name },
        userId: actorId,
      });
    });
  } catch (error) {
    deleteManagedFile(stored.filePath);
    throw error;
  }
  return getAgreementFollowup(id);
}
export async function agreementProcedureFile(id: number, fileId: number) {
  const [file] = await db
    .select()
    .from(contractProcedureAttachments)
    .where(
      and(
        eq(contractProcedureAttachments.contractId, id),
        eq(contractProcedureAttachments.id, fileId),
      ),
    );
  return file ?? null;
}
