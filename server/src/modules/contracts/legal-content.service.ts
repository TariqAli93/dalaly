import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  legalContractTemplates as templates,
  legalContractClauses as clauses,
  legalContentEvents as events,
  legalReviewers,
  users,
  auditLogs,
  properties,
  rentals,
  legalTaskNotifications as notices,
} from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import {
  ContractValidationError,
  ForbiddenError,
} from "../../shared/errors.js";
import {
  legalDecisionSchema,
  legalRevisionSchema,
  reviewerSchema,
  type LegalRevisionPayload,
} from "./legal-content.schema.js";
import {
  allowedKeys,
  legalTerms,
  normalize,
  validateLegal,
  canonicalConditions,
} from "./legal-validation.js";
import { legalPropertyType } from "./legal-content.engine.js";

export function legalError(message: string) {
  return new ContractValidationError([{ code: "legal_content", message }]);
}
export async function requireLegalReviewer(userId: number, tx: any = db) {
  const [r] = await tx
    .select({ reviewer: legalReviewers })
    .from(legalReviewers)
    .innerJoin(users, eq(users.id, legalReviewers.userId))
    .where(
      and(
        eq(legalReviewers.userId, userId),
        eq(legalReviewers.isActive, true),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  if (!r)
    throw legalError("يجب توثيق أهلية محامٍ عراقي فعال قبل الاعتماد القانوني.");
  return toApiObject(r.reviewer);
}
export const scopeOf = (v: LegalRevisionPayload) =>
  and(
    eq(templates.contractType, v.contract_type),
    eq(templates.propertyType, v.property_type),
    eq(templates.jurisdiction, v.jurisdiction),
    eq(templates.transactionKind, v.transaction_kind),
  );
export function revisionPayload(
  row: Record<string, any>,
  contents: Record<string, any>[],
): LegalRevisionPayload {
  return {
    contract_type: row.contract_type,
    property_type: row.property_type,
    jurisdiction: row.jurisdiction,
    transaction_kind: row.transaction_kind,
    title: row.title,
    legal_basis: row.legal_basis,
    applicability_notes: row.applicability_notes,
    revision_note: "استعادة إصدار سابق",
    target_at: row.target_at ?? null,
    priority: row.priority ?? 1,
    clauses: contents.map((c) => ({
      clause_code: c.clause_code,
      clause_title: c.clause_title,
      clause_content_ar: c.clause_content_ar,
      clause_order: c.clause_order,
      is_required: c.is_required,
      conditions_json: { all: c.conditions_json?.all ?? [] },
      source_clause_id: c.id ?? c.source_clause_id ?? null,
    })),
  };
}
type LegalRow = Record<string, any> & { clauses: Record<string, any>[] };
async function fullRevision(id: number, tx: any = db): Promise<LegalRow> {
  const [row] = await tx.select().from(templates).where(eq(templates.id, id));
  if (!row) throw legalError("الصيغة غير موجودة.");
  const contents = await tx
    .select()
    .from(clauses)
    .where(eq(clauses.legalTemplateId, id))
    .orderBy(asc(clauses.clauseOrder), asc(clauses.clauseCode));
  return {
    ...toApiObject(row),
    clauses: contents.map((c: any) => toApiObject(c)),
  };
}
export function workflowStatus(row: Record<string, any>) {
  if (
    row.publication_status === "archived" ||
    row.approval_status === "rejected"
  )
    return "archived";
  if (row.publication_status === "active") return "active";
  if (row.approval_status === "pending")
    return row.review_required ? "specialist_review" : "ready";
  return row.approval_status;
}
export async function listLegalContent(
  activeOnly = false,
): Promise<LegalRow[]> {
  const [rows, contents] = await Promise.all([
    db
      .select()
      .from(templates)
      .orderBy(
        asc(templates.contractType),
        asc(templates.propertyType),
        desc(templates.version),
      ),
    db
      .select()
      .from(clauses)
      .orderBy(asc(clauses.clauseOrder), asc(clauses.clauseCode)),
  ]);
  const grouped = new Map<number, Record<string, any>[]>();
  for (const c of contents) {
    const list = grouped.get(c.legalTemplateId) ?? [];
    list.push(toApiObject(c));
    grouped.set(c.legalTemplateId, list);
  }
  return rows
    .filter((r) => !activeOnly || r.publicationStatus === "active")
    .map((r) => {
      const row = toApiObject(r);
      return {
        ...row,
        workflow_status: workflowStatus(row),
        clauses: grouped.get(r.id) ?? [],
      };
    });
}
export async function legalHistory() {
  return (await db.select().from(events).orderBy(desc(events.id))).map((r) =>
    toApiObject(r),
  );
}
export async function listLegalReviewers() {
  return (await db.select().from(legalReviewers)).map((r) => toApiObject(r));
}
export async function verifyReviewer(
  input: ReturnType<typeof reviewerSchema.parse>,
  actorId: number,
) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.user_id));
  if (!user) throw legalError("حساب المراجع غير موجود.");
  const values = {
    userId: input.user_id,
    lawyerName: input.lawyer_name,
    registrationNumber: input.registration_number,
    qualificationEvidence: input.qualification_evidence,
    isActive: input.is_active,
    verifiedBy: actorId,
    verifiedAt: new Date(),
  };
  return db.transaction(async (tx) => {
    const [old] = await tx
      .select()
      .from(legalReviewers)
      .where(eq(legalReviewers.userId, input.user_id));
    const [row] = await tx
      .insert(legalReviewers)
      .values(values)
      .onConflictDoUpdate({ target: legalReviewers.userId, set: values })
      .returning();
    await tx.insert(auditLogs).values({
      entityType: "legal_reviewer",
      entityId: input.user_id,
      action: "qualification",
      oldValue: old ?? null,
      newValue: row,
      userId: actorId,
    });
    return toApiObject(row);
  });
}
export async function validateRevision(
  input: LegalRevisionPayload,
  tx: any = db,
) {
  const [base] = await tx
    .select()
    .from(templates)
    .where(and(scopeOf(input), eq(templates.approvalStatus, "approved")))
    .orderBy(desc(templates.version))
    .limit(1);
  const baseline = base ? await fullRevision(base.id, tx) : null;
  const change_kind = !baseline
    ? "new_legal"
    : legalTerms(input) ===
        legalTerms(revisionPayload(baseline, baseline.clauses))
      ? "administrative"
      : "substantive";
  return {
    ...validateLegal(input),
    change_kind,
    review_required: change_kind !== "administrative",
    based_on_id: base?.id ?? null,
    baseline_version: base?.version ?? null,
  };
}
export async function legalOptions(activeOnly = false) {
  const [sale, rental, rows] = await Promise.all([
    db
      .selectDistinct({
        propertyType: properties.propertyType,
        legalType: properties.legalType,
      })
      .from(properties),
    db.selectDistinct({ propertyType: rentals.propertyType }).from(rentals),
    listLegalContent(activeOnly),
  ]);
  const types = [...sale, ...rental].map((r) => legalPropertyType(r));
  const scopes = [
    ...new Set(
      [...types, ...rows.map((r) => r.property_type), "office"].filter(
        (t) => t !== "*",
      ),
    ),
  ];
  const library = new Map<string, any>();
  for (const row of rows.filter((r) => r.approval_status === "approved"))
    for (const c of row.clauses) {
      const key = JSON.stringify([
        normalize(c.clause_content_ar),
        normalize(c.clause_title),
        c.is_required,
        c.conditions_json,
      ]);
      const item = library.get(key);
      if (item) {
        item.usage_count++;
        if (!item.contract_types.includes(row.contract_type))
          item.contract_types.push(row.contract_type);
        if (!item.scopes.includes(row.property_type))
          item.scopes.push(row.property_type);
      } else
        library.set(key, {
          ...c,
          source_clause_id: c.id,
          usage_count: 1,
          contract_type: row.contract_type,
          contract_types: [row.contract_type],
          scopes: [row.property_type],
        });
    }
  return {
    property_scopes: scopes,
    variables: allowedKeys,
    clause_library: [...library.values()],
  };
}
export async function saveLegalRevision(
  input: LegalRevisionPayload,
  actorId: number,
  previousId?: number,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${[input.contract_type, input.property_type, input.jurisdiction, input.transaction_kind].join(":")}))`,
    );
    const previous = previousId ? await fullRevision(previousId, tx) : null;
    if (
      previous &&
      [
        previous.contract_type,
        previous.property_type,
        previous.jurisdiction,
        previous.transaction_kind,
      ].join(":") !==
        [
          input.contract_type,
          input.property_type,
          input.jurisdiction,
          input.transaction_kind,
        ].join(":")
    )
      throw legalError(
        "لا يمكن تغيير نطاق الصيغة داخل سلسلة الإصدارات؛ استخدم النسخ.",
      );
    const [latest] = await tx
      .select()
      .from(templates)
      .where(scopeOf(input))
      .orderBy(desc(templates.version))
      .limit(1);
    if (previous && latest?.id !== previous.id)
      throw legalError("تم إنشاء إصدار أحدث؛ أعد تحميل الصيغ.");
    const check = await validateRevision(input, tx);
    for (const c of input.clauses.filter((c) => c.source_clause_id)) {
      const [source] = await tx
        .select()
        .from(clauses)
        .where(eq(clauses.id, c.source_clause_id!));
      if (
        !source ||
        normalize(source.clauseContentAr) !== normalize(c.clause_content_ar) ||
        normalize(source.clauseTitle) !== normalize(c.clause_title) ||
        source.isRequired !== c.is_required ||
        canonicalConditions(source.conditionsJson as any) !==
          canonicalConditions(c.conditions_json)
      )
        throw legalError(
          "البند المرتبط بالمكتبة تغير؛ احفظه كبند جديد للمراجعة.",
        );
    }
    const version = (latest?.version ?? 0) + 1;
    const [row] = await tx
      .insert(templates)
      .values({
        familyCode:
          latest?.familyCode ??
          [
            input.contract_type,
            input.property_type,
            input.jurisdiction,
            input.transaction_kind,
          ].join(":"),
        contractType: input.contract_type,
        propertyType: input.property_type,
        jurisdiction: input.jurisdiction,
        transactionKind: input.transaction_kind,
        title: input.title,
        version,
        legalBasis: input.legal_basis,
        applicabilityNotes: input.applicability_notes,
        parentId: latest?.id ?? null,
        basedOnId: check.based_on_id,
        changeKind: check.change_kind,
        reviewRequired: check.review_required,
        targetAt: input.target_at ? new Date(input.target_at) : null,
        priority: input.priority,
        createdBy: actorId,
      })
      .returning();
    if (input.clauses.length)
      await tx.insert(clauses).values(
        input.clauses.map((c) => ({
          legalTemplateId: row.id,
          clauseCode: c.clause_code,
          clauseTitle: c.clause_title,
          clauseContentAr: c.clause_content_ar,
          clauseOrder: c.clause_order,
          isRequired: c.is_required,
          conditionsJson: c.conditions_json,
          sourceClauseId: c.source_clause_id ?? null,
          version,
        })),
      );
    await tx.insert(events).values({
      legalTemplateId: row.id,
      action: "revision",
      actorId,
      comment: input.revision_note,
      details: {
        change_kind: check.change_kind,
        based_on_id: check.based_on_id,
        parent_id: latest?.id ?? null,
      },
    });
    return toApiObject(row);
  });
}
export async function restoreLegalRevision(id: number, actorId: number) {
  const source = await fullRevision(id);
  const result = await saveLegalRevision(
    {
      ...revisionPayload(source, source.clauses),
      target_at: null,
      revision_note: `استعادة الإصدار ${source.version} بإنشاء إصدار جديد`,
    },
    actorId,
  );
  await db.insert(events).values({
    legalTemplateId: Number(result.id),
    action: "restore",
    actorId,
    comment: `استعادة الإصدار ${source.version}`,
    details: { restored_from: id },
  });
  return result;
}
export async function compareLegalRevisions(left: number, right: number) {
  const [a, b] = await Promise.all([fullRevision(left), fullRevision(right)]);
  const differences: Array<{ field: string; before: string; after: string }> =
    [];
  for (const [field, label] of [
    ["title", "اسم الصيغة"],
    ["legal_basis", "الأساس القانوني"],
    ["applicability_notes", "نطاق التطبيق"],
    ["property_type", "جنس العقار"],
    ["transaction_kind", "المعاملة"],
    ["jurisdiction", "الاختصاص"],
  ])
    if (a[field] !== b[field])
      differences.push({ field: label, before: a[field], after: b[field] });
  const codes = new Set([...a.clauses, ...b.clauses].map((c) => c.clause_code));
  for (const code of codes) {
    const format = (c: any) =>
      c
        ? `${c.clause_order}. ${c.clause_title}\n${c.clause_content_ar}\n${c.is_required ? "أساسي" : "اختياري"} · ${JSON.stringify(c.conditions_json)}`
        : "—";
    const before = format(a.clauses.find((c) => c.clause_code === code)),
      after = format(b.clauses.find((c) => c.clause_code === code));
    if (before !== after)
      differences.push({ field: `البند ${code}`, before, after });
  }
  return {
    left: a,
    right: b,
    differences,
    legal_changed:
      legalTerms(revisionPayload(a, a.clauses)) !==
      legalTerms(revisionPayload(b, b.clauses)),
  };
}
type Authority = { manage?: boolean; publish?: boolean; specialist?: boolean };
export async function decideLegalRevision(
  id: number,
  input: ReturnType<typeof legalDecisionSchema.parse>,
  actorId: number,
  authority?: Authority,
) {
  return db.transaction(async (tx) => {
    const row = await fullRevision(id, tx);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${[row.contract_type, row.property_type, row.jurisdiction, row.transaction_kind].join(":")}))`,
    );
    const [locked] = await tx
      .select()
      .from(templates)
      .where(eq(templates.id, id))
      .for("update");
    row.approval_status = locked.approvalStatus;
    row.publication_status = locked.publicationStatus;
    const action = input.action;
    const check = await validateRevision(revisionPayload(row, row.clauses), tx);
    const approval = action === "approve" || action === "approve_publish";
    const publishing = [
      "approve_publish",
      "publish",
      "default",
      "archive",
    ].includes(action);
    if (
      authority &&
      ((action === "submit" && !authority.manage) ||
        (publishing && !authority.publish) ||
        (approval &&
          (check.review_required
            ? !authority.specialist
            : !authority.publish)) ||
        (action === "reject" && !authority.specialist))
    )
      throw new ForbiddenError("ليست لديك صلاحية تنفيذ هذه العملية.");
    let reviewer: any = null;
    if (
      ["submit", "approve", "approve_publish", "publish", "default"].includes(
        action,
      ) &&
      !check.valid
    )
      throw legalError(check.issues.join("\n"));
    if (action === "submit" && row.approval_status !== "draft")
      throw legalError("يمكن إرسال مسودة فقط.");
    if (approval) {
      if (!["draft", "pending"].includes(row.approval_status))
        throw legalError("حالة الصيغة لا تسمح بالاعتماد.");
      if (check.review_required || row.review_required) {
        if (row.approval_status !== "pending")
          throw legalError(
            "التغيير الجوهري أو النص الجديد يتطلب إرسالاً للمراجعة المختصة.",
          );
        reviewer = await requireLegalReviewer(actorId, tx);
      } else if (row.based_on_id !== check.based_on_id)
        throw legalError("تغير الإصدار المعتمد؛ أنشئ إصداراً جديداً للمقارنة.");
    }
    if (
      ["publish", "default"].includes(action) &&
      row.approval_status !== "approved"
    )
      throw legalError("لا يمكن تفعيل صيغة غير معتمدة.");
    if (action === "reject") {
      if (row.approval_status !== "pending")
        throw legalError("يمكن رفض صيغة مقدمة للاعتماد فقط.");
      reviewer = await requireLegalReviewer(actorId, tx);
    }
    if (action === "archive" && row.approval_status !== "approved")
      throw legalError("يمكن إيقاف إصدار معتمد فقط.");
    const activating = ["approve_publish", "publish", "default"].includes(
      action,
    );
    if (activating) {
      const old = await tx
        .select()
        .from(templates)
        .where(
          and(
            scopeOf(revisionPayload(row, row.clauses)),
            eq(templates.publicationStatus, "active"),
          ),
        );
      for (const r of old) {
        if (r.id === id) continue;
        await tx
          .update(templates)
          .set({
            publicationStatus: "archived",
            isDefault: false,
            updatedAt: new Date(),
          })
          .where(eq(templates.id, r.id));
        await tx.insert(events).values({
          legalTemplateId: r.id,
          action: "archive",
          actorId,
          comment: "استبدال بإصدار معتمد فعال",
          details: { replaced_by: id },
        });
      }
    }
    const [updated] = await tx
      .update(templates)
      .set({
        approvalStatus:
          action === "submit"
            ? "pending"
            : approval
              ? "approved"
              : action === "reject"
                ? "rejected"
                : row.approval_status,
        approvedBy: approval ? actorId : locked.approvedBy,
        approvedAt: approval ? new Date() : locked.approvedAt,
        publicationStatus: activating
          ? "active"
          : action === "archive"
            ? "archived"
            : row.publication_status,
        isDefault: activating
          ? true
          : action === "archive"
            ? false
            : locked.isDefault,
        updatedAt: new Date(),
        targetAt:
          action === "submit" && !locked.targetAt
            ? new Date(Date.now() + 86400000)
            : locked.targetAt,
      })
      .where(eq(templates.id, id))
      .returning();
    await tx.insert(events).values({
      legalTemplateId: id,
      action,
      actorId,
      comment: input.comment,
      reviewerSnapshot: reviewer,
      details: {
        change_kind: check.change_kind,
        based_on_id: check.based_on_id,
        review_required: check.review_required,
        target_at: updated.targetAt,
        priority: updated.priority,
      },
    });
    return toApiObject(updated);
  });
}
export async function scheduleLegalRevision(
  id: number,
  targetAt: string | null,
  priority: number,
  actorId: number,
) {
  return db.transaction(async (tx) => {
    const [old] = await tx
      .select()
      .from(templates)
      .where(eq(templates.id, id))
      .for("update");
    if (!old) throw legalError("الصيغة غير موجودة.");
    const [row] = await tx
      .update(templates)
      .set({
        targetAt: targetAt ? new Date(targetAt) : null,
        priority,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, id))
      .returning();
    await tx.insert(events).values({
      legalTemplateId: id,
      action: "schedule",
      actorId,
      comment: "تحديث الموعد التشغيلي والأولوية",
      details: {
        before: { target_at: old.targetAt, priority: old.priority },
        after: { target_at: row.targetAt, priority },
      },
    });
    return toApiObject(row);
  });
}
export async function legalNotifications(
  userId: number,
  manage: boolean,
  specialist: boolean,
  now = new Date(),
) {
  const tasks = await db
    .select()
    .from(templates)
    .where(eq(templates.approvalStatus, "pending"));
  const eligible = tasks.filter(
    (r) =>
      r.publicationStatus !== "archived" &&
      r.targetAt &&
      ((r.reviewRequired && specialist) ||
        (!r.reviewRequired && manage) ||
        r.createdBy === userId),
  );
  for (const r of eligible) {
    const ms = r.targetAt!.getTime() - now.getTime();
    if (ms > 86400000) continue;
    await db
      .insert(notices)
      .values({
        legalTemplateId: r.id,
        userId,
        kind: ms <= 0 ? "overdue" : "early",
        targetAt: r.targetAt!,
      })
      .onConflictDoNothing();
  }
  const rows = await db
    .select({
      notice: notices,
      title: templates.title,
      contractType: templates.contractType,
      propertyType: templates.propertyType,
    })
    .from(notices)
    .innerJoin(templates, eq(templates.id, notices.legalTemplateId))
    .where(
      and(eq(notices.userId, userId), eq(templates.approvalStatus, "pending")),
    )
    .orderBy(desc(notices.createdAt));
  return rows
    .filter((r) =>
      eligible.some(
        (t) =>
          t.id === r.notice.legalTemplateId &&
          t.targetAt!.getTime() === r.notice.targetAt.getTime(),
      ),
    )
    .map((r) => ({
      ...toApiObject(r.notice),
      title: r.title,
      contract_type: r.contractType,
      property_type: r.propertyType,
    }));
}
export async function readLegalNotification(id: number, userId: number) {
  await db
    .update(notices)
    .set({ readAt: new Date() })
    .where(and(eq(notices.id, id), eq(notices.userId, userId)));
  return { ok: true };
}
export { legalRevisionSchema };
