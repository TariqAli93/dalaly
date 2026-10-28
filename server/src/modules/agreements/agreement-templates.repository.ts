import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import type { Transaction } from "../../infrastructure/database/record-codes.js";
import {
  agreementTemplateVersions,
  agreementTemplates,
  officeProfiles,
  users,
} from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import { DomainError } from "../../shared/errors.js";
import {
  TEMPLATES,
  TEMPLATE_KEYS,
  pickCompany,
  type ContractDocument,
  type TemplateKey,
} from "../../shared/contract-document/index.js";
import { recordAudit } from "../audit/audit.service.js";
import { documentSchema } from "./agreements.schema.js";
import {
  FACTORY_REVISION,
  factoryDocument,
  withFactoryDesign,
} from "./agreements.templates.js";

type Executor = typeof db | Transaction;
type ChangeType = "saved" | "design_reset" | "full_reset" | "restored";

/**
 * The four template rows always exist: created on first use (and again after
 * a restore of an archive that predates them). No route adds or deletes one,
 * and the table's CHECK allows only the four keys.
 */
async function ensureTemplates(executor: Executor = db) {
  await executor
    .insert(agreementTemplates)
    .values(TEMPLATE_KEYS.map((templateKey) => ({ templateKey })))
    .onConflictDoNothing();
}

async function templateRow(key: TemplateKey, executor: Executor, lock = false) {
  await ensureTemplates(executor);
  const query = executor
    .select()
    .from(agreementTemplates)
    .where(eq(agreementTemplates.templateKey, key))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new DomainError(404, "القالب غير موجود.");
  return row;
}

/** A stored definition, or the factory one when it is null or unreadable. */
function effective(key: TemplateKey, stored: unknown): ContractDocument {
  if (stored === null || stored === undefined) return factoryDocument(key);
  const parsed = documentSchema.safeParse(stored);
  return parsed.success
    ? (parsed.data as ContractDocument)
    : factoryDocument(key);
}

function summary(
  row: typeof agreementTemplates.$inferSelect,
  updatedBy?: string | null,
) {
  const key = row.templateKey as TemplateKey;
  return {
    key,
    title: TEMPLATES[key].title,
    kind: TEMPLATES[key].kind,
    category: TEMPLATES[key].category,
    description: TEMPLATES[key].description,
    is_customized: row.definition !== null,
    version: row.version,
    factory_revision: FACTORY_REVISION,
    updated_at: row.updatedAt,
    updated_by_name: updatedBy ?? null,
  };
}

export async function listTemplates() {
  await ensureTemplates();
  const rows = await db
    .select({ template: agreementTemplates, updatedBy: users.displayName })
    .from(agreementTemplates)
    .leftJoin(users, eq(agreementTemplates.updatedBy, users.id));
  const order = new Map(TEMPLATE_KEYS.map((key, index) => [key, index]));
  return rows
    .map((row) => summary(row.template, row.updatedBy))
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

export async function getTemplate(key: TemplateKey) {
  const row = await templateRow(key, db);
  const [office] = await db
    .select()
    .from(officeProfiles)
    .where(eq(officeProfiles.id, 1))
    .limit(1);
  return {
    ...summary(row),
    definition: effective(key, row.definition),
    // For restoring single clauses to their factory wording in the studio.
    factory: factoryDocument(key),
    // The office fields show real values while designing a template.
    company: office ? pickCompany(toApiObject(office)) : null,
  };
}

/** The definition a new contract copies, and the version it came from. */
export async function templateForNewContract(
  key: TemplateKey,
  executor: Executor,
) {
  const row = await templateRow(key, executor);
  return { definition: effective(key, row.definition), version: row.version };
}

async function writeVersion(
  tx: Transaction,
  row: typeof agreementTemplates.$inferSelect,
  baseVersion: number,
  definition: ContractDocument | null,
  changeType: ChangeType,
  userId: number,
  note: string | null = null,
) {
  if (row.version !== baseVersion)
    throw new DomainError(
      409,
      "عُدِّل هذا القالب من مكان آخر بعد فتحه. أعد فتحه لترى آخر نسخة ثم كرّر تعديلك.",
      "TEMPLATE_CONFLICT",
    );
  const version = row.version + 1;
  const [updated] = await tx
    .update(agreementTemplates)
    .set({
      definition,
      version,
      factoryRevision: FACTORY_REVISION,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(agreementTemplates.id, row.id))
    .returning();
  await tx.insert(agreementTemplateVersions).values({
    templateId: row.id,
    version,
    definition,
    changeType,
    note,
    createdBy: userId,
  });
  return updated!;
}

export async function saveTemplate(
  key: TemplateKey,
  baseVersion: number,
  definition: ContractDocument,
  note: string | null,
  userId: number,
) {
  const updated = await db.transaction(async (tx) => {
    const row = await templateRow(key, tx, true);
    // The first save of an untouched template keeps the factory state in the
    // history too, so "restore version" can always go back to it.
    if (row.version === 0 && row.definition === null)
      await tx
        .insert(agreementTemplateVersions)
        .values({
          templateId: row.id,
          version: 0,
          definition: null,
          changeType: "full_reset",
          note: "الإعداد الافتراضي",
          createdBy: userId,
        })
        .onConflictDoNothing();
    return writeVersion(
      tx,
      row,
      baseVersion,
      definition,
      "saved",
      userId,
      note,
    );
  });
  await recordAudit({
    entityType: "agreement_template",
    entityId: updated.id,
    action: "updated",
    newValue: { key, version: updated.version },
    userId,
  });
  return getTemplate(key);
}

/**
 * "design": the factory layout and styling with the current clauses.
 * "all": back to the factory definition (stored as null). The state before
 * the reset stays in the version history either way.
 */
export async function resetTemplate(
  key: TemplateKey,
  mode: "design" | "all",
  baseVersion: number,
  userId: number,
) {
  const updated = await db.transaction(async (tx) => {
    const row = await templateRow(key, tx, true);
    const next =
      mode === "all"
        ? null
        : withFactoryDesign(key, effective(key, row.definition));
    return writeVersion(
      tx,
      row,
      baseVersion,
      next,
      mode === "all" ? "full_reset" : "design_reset",
      userId,
    );
  });
  await recordAudit({
    entityType: "agreement_template",
    entityId: updated.id,
    action: "restored",
    newValue: { key, mode, version: updated.version },
    userId,
  });
  return getTemplate(key);
}

export async function listTemplateVersions(key: TemplateKey) {
  const row = await templateRow(key, db);
  return db
    .select({
      version: agreementTemplateVersions.version,
      change_type: agreementTemplateVersions.changeType,
      note: agreementTemplateVersions.note,
      is_factory: sql<boolean>`${agreementTemplateVersions.definition} is null`,
      created_at: agreementTemplateVersions.createdAt,
      created_by_name: users.displayName,
    })
    .from(agreementTemplateVersions)
    .leftJoin(users, eq(agreementTemplateVersions.createdBy, users.id))
    .where(eq(agreementTemplateVersions.templateId, row.id))
    .orderBy(desc(agreementTemplateVersions.version))
    .limit(200);
}

async function versionRow(
  templateId: number,
  version: number,
  executor: Executor,
) {
  const [found] = await executor
    .select()
    .from(agreementTemplateVersions)
    .where(
      and(
        eq(agreementTemplateVersions.templateId, templateId),
        eq(agreementTemplateVersions.version, version),
      ),
    )
    .limit(1);
  if (!found) throw new DomainError(404, "هذه النسخة من القالب غير موجودة.");
  return found;
}

export async function getTemplateVersion(key: TemplateKey, version: number) {
  const row = await templateRow(key, db);
  const found = await versionRow(row.id, version, db);
  return {
    version: found.version,
    change_type: found.changeType,
    created_at: found.createdAt,
    definition: effective(key, found.definition),
  };
}

export async function restoreTemplateVersion(
  key: TemplateKey,
  version: number,
  baseVersion: number,
  userId: number,
) {
  const updated = await db.transaction(async (tx) => {
    const row = await templateRow(key, tx, true);
    const found = await versionRow(row.id, version, tx);
    const definition =
      found.definition === null ? null : effective(key, found.definition);
    return writeVersion(
      tx,
      row,
      baseVersion,
      definition,
      "restored",
      userId,
      `استرجاع النسخة ${version}`,
    );
  });
  await recordAudit({
    entityType: "agreement_template",
    entityId: updated.id,
    action: "restored",
    newValue: { key, from_version: version, version: updated.version },
    userId,
  });
  return getTemplate(key);
}
