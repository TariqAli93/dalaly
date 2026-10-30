import fs from "node:fs";
import path from "node:path";
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";
import { config } from "../../infrastructure/config.js";
import { db } from "../../infrastructure/database/db.js";
import { pool } from "../../infrastructure/database/pool.js";
import type { Transaction } from "../../infrastructure/database/record-codes.js";
import { ensureDefaultChart } from "../accounting/default-chart.js";
import { ensureDefaultExpenseCategories } from "../accounting/cash.service.js";
import { resolveManagedFile } from "../documents/documents.storage.js";
import { getSetting, setSetting } from "../settings/settings.repository.js";
import { DomainError } from "../../shared/errors.js";
import {
  backupJobs,
  backupLogs,
  governorates,
  districts,
  neighborhoods,
  users,
  roles,
  permissions,
  rolePermissions,
  userRoles,
  people,
  properties,
  rentals,
  propertyImages,
  propertyFollowups,
  accounts,
  accountingPeriods,
  cashReconciliations,
  cashTransfers,
  expenseCategories,
  activities,
  deals,
  dealOffers,
  dealStageHistory,
  favoriteProperties,
  rentalImages,
  rentalFollowups,
  favoriteRentals,
  rentalRequests,
  purchaseRequests,
  documentTypes,
  identityDocuments,
  journalEntries,
  journalLines,
  commissions,
  commissionSplits,
  vouchers,
  leases,
  leaseInstallments,
  officeProfiles,
  auditLogs,
  appSettings,
  agreementTemplates,
  agreementTemplateVersions,
  agreements,
  agreementParties,
  agreementRevisions,
  agreementExports,
} from "../../infrastructure/database/schema.js";
import {
  isActivePermissionKey,
  isActiveSettingKey,
} from "../rbac/key-policy.js";
import {
  type ArchiveEntry,
  type BackupArchive,
  openArchive,
  writeArchive,
  zipBuffers,
} from "./backup.archive.js";
import {
  decryptBackup,
  encryptBackup,
  ENCRYPTED_BACKUP_EXTENSION,
  ENCRYPTED_BACKUP_MAGIC_BYTES,
  isEncryptedBackup,
} from "./backup.crypto.js";
const BACKUP_VERSION = 3;
/** manifest.json `contents` of an archive without images and documents. */
const DATABASE_ONLY = "database";
/** PostgreSQL's limit on bind parameters in one statement is 65535. */
const MAX_BIND_PARAMETERS = 60_000;

/** Another backup, export or restore is already running. */
export class BackupBusyError extends DomainError {
  constructor() {
    super(
      409,
      "عملية نسخ احتياطي أو استرجاع أخرى قيد التنفيذ. أعد المحاولة بعد انتهائها.",
    );
    this.name = "BackupBusyError";
  }
}

let operationRunning = false;
/**
 * Runs one backup, export or restore at a time: a backup reads every table
 * and file while a restore rewrites them.
 */
async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  if (operationRunning) throw new BackupBusyError();
  operationRunning = true;
  try {
    return await operation();
  } finally {
    operationRunning = false;
  }
}
const TABLE_SPECS = [
  {
    name: "governorates",
    table: governorates,
    dates: ["createdAt", "updatedAt"],
  },
  { name: "districts", table: districts, dates: ["createdAt", "updatedAt"] },
  {
    name: "neighborhoods",
    table: neighborhoods,
    dates: ["createdAt", "updatedAt"],
  },
  { name: "users", table: users, dates: ["createdAt", "updatedAt"] },
  { name: "roles", table: roles, dates: ["createdAt", "updatedAt"] },
  {
    name: "permissions",
    table: permissions,
    dates: ["createdAt", "updatedAt"],
  },
  { name: "role_permissions", table: rolePermissions, dates: [] },
  { name: "user_roles", table: userRoles, dates: [] },
  { name: "people", table: people, dates: ["createdAt", "updatedAt"] },
  {
    name: "properties",
    table: properties,
    dates: ["createdAt", "updatedAt", "archivedAt"],
  },
  {
    name: "rentals",
    table: rentals,
    dates: ["createdAt", "updatedAt", "archivedAt"],
  },
  { name: "property_images", table: propertyImages, dates: ["createdAt"] },
  {
    name: "property_followups",
    table: propertyFollowups,
    dates: ["scheduledAt", "createdAt", "completedAt", "updatedAt"],
  },
  {
    name: "favorite_properties",
    table: favoriteProperties,
    dates: ["createdAt"],
  },
  { name: "rental_images", table: rentalImages, dates: ["createdAt"] },
  {
    name: "rental_followups",
    table: rentalFollowups,
    dates: ["scheduledAt", "createdAt", "completedAt", "updatedAt"],
  },
  { name: "favorite_rentals", table: favoriteRentals, dates: ["createdAt"] },
  {
    name: "rental_requests",
    table: rentalRequests,
    dates: ["createdAt", "updatedAt"],
  },
  {
    name: "purchase_requests",
    table: purchaseRequests,
    dates: ["createdAt", "updatedAt"],
  },
  {
    name: "document_types",
    table: documentTypes,
    dates: ["createdAt", "updatedAt"],
  },
  // Contract tables came after backup version 3 was defined: an archive from
  // an older build has none of them, and restores them as empty tables.
  {
    name: "agreement_templates",
    table: agreementTemplates,
    dates: ["createdAt", "updatedAt"],
    optional: true,
  },
  {
    name: "agreement_template_versions",
    table: agreementTemplateVersions,
    dates: ["createdAt"],
    optional: true,
  },
  {
    name: "agreements",
    table: agreements,
    dates: ["issuedAt", "cancelledAt", "createdAt", "updatedAt"],
    optional: true,
  },
  {
    name: "agreement_parties",
    table: agreementParties,
    dates: ["createdAt"],
    optional: true,
  },
  {
    name: "agreement_revisions",
    table: agreementRevisions,
    dates: ["issuedAt"],
    optional: true,
  },
  {
    name: "agreement_exports",
    table: agreementExports,
    dates: ["createdAt"],
    optional: true,
  },
  // Deals reference contracts and requests; activities may name a deal.
  {
    name: "deals",
    table: deals,
    dates: ["stageChangedAt", "closedAt", "createdAt", "updatedAt"],
    optional: true,
  },
  {
    name: "deal_stage_history",
    table: dealStageHistory,
    dates: ["createdAt"],
    optional: true,
  },
  {
    name: "deal_offers",
    table: dealOffers,
    dates: ["createdAt", "updatedAt"],
    optional: true,
  },
  // The chart of accounts (Phase 4a). Only a full restore replaces it; an
  // archive from before it restores an empty table, and the default
  // accounts are added again afterwards.
  {
    name: "accounts",
    table: accounts,
    dates: ["createdAt", "updatedAt"],
    optional: true,
  },
  // Expense categories (Phase 4e) name accounts; vouchers name them.
  {
    name: "expense_categories",
    table: expenseCategories,
    dates: ["createdAt", "updatedAt"],
    optional: true,
  },
  // The ledger (Phase 4b), after the accounts, customers and deals its lines
  // name. Its triggers refuse changes to posted entries; a restore passes them
  // (dalaly.ledger_restore) because it replaces the tables whole.
  {
    name: "journal_entries",
    table: journalEntries,
    dates: ["postedAt", "createdAt", "updatedAt"],
    optional: true,
  },
  { name: "journal_lines", table: journalLines, dates: [], optional: true },
  {
    name: "accounting_periods",
    table: accountingPeriods,
    dates: ["closedAt"],
    optional: true,
  },
  // Transfers and reconciliations (Phase 4e), after the entries they posted.
  {
    name: "cash_transfers",
    table: cashTransfers,
    dates: ["voidedAt", "createdAt"],
    optional: true,
  },
  {
    name: "cash_reconciliations",
    table: cashReconciliations,
    dates: ["createdAt"],
    optional: true,
  },
  // Commissions (Phase 4d), after their entries; vouchers name them.
  {
    name: "commissions",
    table: commissions,
    dates: ["cancelledAt", "createdAt"],
    optional: true,
  },
  {
    name: "commission_splits",
    table: commissionSplits,
    dates: ["createdAt"],
    optional: true,
  },
  // Receipts and payments (Phase 4c), after the entries they posted.
  {
    name: "vouchers",
    table: vouchers,
    dates: ["voidedAt", "createdAt"],
    optional: true,
  },
  // Leases (Phase 5a), after the contracts, listings and customers they
  // name; only a full restore replaces them.
  {
    name: "leases",
    table: leases,
    dates: ["cancelledAt", "createdAt"],
    optional: true,
  },
  {
    name: "lease_installments",
    table: leaseInstallments,
    dates: [],
    optional: true,
  },
  // Added after backup version 3, like the contract tables above.
  {
    name: "activities",
    table: activities,
    dates: ["scheduledAt", "createdAt", "completedAt", "updatedAt"],
    optional: true,
  },
  {
    name: "identity_documents",
    table: identityDocuments,
    dates: ["uploadedAt", "updatedAt", "expiresAt", "createdAt"],
  },
  {
    name: "office_profiles",
    table: officeProfiles,
    dates: ["createdAt", "updatedAt"],
  },
  { name: "audit_logs", table: auditLogs, dates: ["createdAt"] },
  { name: "app_settings", table: appSettings, dates: ["updatedAt"] },
] as const;
type TableName = (typeof TABLE_SPECS)[number]["name"];
const SCOPE_TABLES: Record<string, TableName[]> = {
  full: TABLE_SPECS.map((s) => s.name),
  properties: [
    "governorates",
    "districts",
    "neighborhoods",
    "properties",
    "property_images",
    "property_followups",
  ],
  images: ["property_images"],
  users: ["users", "roles", "permissions", "role_permissions", "user_roles"],
  settings: [
    "app_settings",
    "office_profiles",
    "document_types",
    "agreement_templates",
    "agreement_template_versions",
  ],
  rentals: [
    "governorates",
    "districts",
    "neighborhoods",
    "rentals",
    "rental_images",
    "rental_followups",
    "favorite_rentals",
  ],
  // Contracts reference customers (and customer documents reference
  // contracts), so they are restored with them.
  crm: [
    "people",
    "agreements",
    "agreement_parties",
    "agreement_revisions",
    "agreement_exports",
    "rental_requests",
    "purchase_requests",
    // Rows go in in this order: deals after the contracts and requests they
    // name, activities after the deals.
    "deals",
    "deal_stage_history",
    "deal_offers",
    "activities",
    "document_types",
    "identity_documents",
    "office_profiles",
  ],
};
const SERIAL_TABLES = new Set<TableName>([
  "governorates",
  "districts",
  "neighborhoods",
  "users",
  "roles",
  "permissions",
  "people",
  "properties",
  "rentals",
  "property_images",
  "property_followups",
  "rental_images",
  "rental_followups",
  "rental_requests",
  "purchase_requests",
  "deals",
  "deal_stage_history",
  "deal_offers",
  "activities",
  "accounts",
  "journal_entries",
  "journal_lines",
  "commissions",
  "commission_splits",
  "vouchers",
  "expense_categories",
  "cash_transfers",
  "cash_reconciliations",
  "leases",
  "lease_installments",
  "document_types",
  "identity_documents",
  "audit_logs",
  "agreement_templates",
  "agreement_template_versions",
  "agreements",
  "agreement_parties",
  "agreement_revisions",
  "agreement_exports",
]);
function specByName(name: TableName) {
  return TABLE_SPECS.find((spec) => spec.name === name)!;
}
/** A table older archives may lack (added after their build). */
function isOptional(spec: (typeof TABLE_SPECS)[number]) {
  return "optional" in spec && spec.optional === true;
}

async function exportDatabase() {
  return db.transaction(
    async (tx) => {
      // Reading every table may take longer than a request is allowed.
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      const data: Record<string, unknown[]> = {};
      for (const spec of TABLE_SPECS)
        data[spec.name] = await tx.select().from(spec.table);
      const activePermissions = (
        data.permissions as Array<{ id: number; key: string }>
      ).filter((row) => isActivePermissionKey(row.key));
      const activePermissionIds = new Set(
        activePermissions.map((row) => row.id),
      );
      data.permissions = activePermissions;
      data.role_permissions = (
        data.role_permissions as Array<{ permissionId: number }>
      ).filter((row) => activePermissionIds.has(row.permissionId));
      data.app_settings = (data.app_settings as Array<{ key: string }>).filter(
        (row) => isActiveSettingKey(row.key),
      );
      return data;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

function timestampLabel(now: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/**
 * A new archive's path in `dir`: `<base>.zip`, or `<base>_2.zip`, … when a
 * backup was already written in the same second, so it never replaces that
 * one. Callers hold the operation lock, so no other backup takes the name.
 */
function newArchivePath(dir: string, base: string) {
  for (let n = 1; ; n += 1) {
    const candidate = path.join(dir, `${base}${n > 1 ? `_${n}` : ""}.zip`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

async function logBackup(jobId: number | null, level: string, message: string) {
  try {
    await db.insert(backupLogs).values({ jobId, level, message });
  } catch {
    // تجاهل
  }
}

export async function listBackupJobs(limit = 50) {
  const rows = await db
    .select()
    .from(backupJobs)
    .orderBy(desc(backupJobs.createdAt), desc(backupJobs.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    file_path: row.filePath,
    file_size: row.fileSize,
    duration_ms: row.durationMs,
    error: row.error,
    created_at: row.createdAt,
  }));
}

export async function getLastBackupAt() {
  return getSetting<string>("last_backup_at");
}

export async function getBackupJob(id: number) {
  const [row] = await db
    .select()
    .from(backupJobs)
    .where(eq(backupJobs.id, id))
    .limit(1);
  return row ?? null;
}

export async function getBackupDir() {
  const stored = await getSetting<string>("backup_dir");
  return stored || config.backupsDir;
}

export async function setBackupDir(dir: string) {
  await setSetting("backup_dir", dir);
}

export type CreateBackupResult = {
  ok: boolean;
  job_id: number;
  file_path: string;
  file_size: number;
  duration_ms: number;
};

/** manifest.json and data.json, the part of an archive every kind holds. */
async function databaseEntries(backupType: string, databaseOnly = false) {
  const database = await exportDatabase();
  const manifest = {
    version: BACKUP_VERSION,
    app_version: config.appVersion,
    created_at: new Date().toISOString(),
    backup_type: backupType,
    tables_count: Object.keys(database).length,
    // Absent from full archives, which older builds wrote the same way.
    ...(databaseOnly ? { contents: DATABASE_ONLY } : {}),
  };
  return [
    {
      name: "manifest.json",
      data: Buffer.from(JSON.stringify(manifest, null, 2)),
    },
    { name: "data.json", data: Buffer.from(JSON.stringify(database)) },
  ];
}

/**
 * يبني أرشيف ZIP كامل: JSON منطقي + صور + metadata. Electron's config.json is
 * deliberately left out: it holds the database URL with its password, and
 * restore never used it.
 */
async function writeBackupArchive(filePath: string, backupType: string) {
  await writeArchive(filePath, await databaseEntries(backupType), [
    { dir: config.imagesDir, prefix: "images/properties" },
    { dir: config.documentsDir, prefix: "documents" },
  ]);
}

/** A failed backup's job and log rows; the caller rethrows the error. */
async function recordFailure(
  type: string,
  startedAt: number,
  error: unknown,
  userId?: number,
) {
  const message = error instanceof Error ? error.message : String(error);
  const [job] = await db
    .insert(backupJobs)
    .values({
      type,
      status: "failure",
      durationMs: Date.now() - startedAt,
      error: message,
      userId: userId ?? null,
    })
    .returning();
  await logBackup(job?.id ?? null, "error", `فشل ${type}: ${message}`);
}

/** المنطق المشترك: يبني الأرشيف ويكتبه إلى المسار ويسجّل النتيجة في backup_jobs/backup_logs. */
async function writeBackupTo(
  filePath: string,
  type: string,
  userId?: number,
): Promise<CreateBackupResult> {
  const startedAt = Date.now();
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await writeBackupArchive(filePath, type);

    const { size: fileSize } = await fs.promises.stat(filePath);
    const durationMs = Date.now() - startedAt;

    const [job] = await db
      .insert(backupJobs)
      .values({
        type,
        status: "success",
        filePath,
        fileSize,
        durationMs,
        userId: userId ?? null,
      })
      .returning();

    await logBackup(
      job.id,
      "info",
      `${type}: ${path.basename(filePath)} (${fileSize} bytes) → ${filePath}`,
    );
    await setSetting("last_backup_at", new Date().toISOString());

    return {
      ok: true,
      job_id: job.id,
      file_path: filePath,
      file_size: fileSize,
      duration_ms: durationMs,
    };
  } catch (error) {
    await recordFailure(type, startedAt, error, userId);
    throw error;
  }
}

/**
 * The files the app deletes by itself (an owner decision): scheduled backups
 * and pre-restore copies beyond the newest `RETAINED_BACKUPS` of each. A file
 * goes only if a successful job of that kind recorded it, it is named the way
 * that kind is named, and it sits directly in the configured backup folder.
 * Manual backups, exports and every other file are never deleted.
 */
const RETENTION = {
  scheduled: {
    types: ["email", "scheduled"],
    name: /^Dalaly_Backup_\d{4}-\d{2}-\d{2}_\d{6}(?:_\d+)?\.zip$/,
  },
  pre_restore: {
    types: ["pre_restore"],
    name: /^Dalaly_Before_Restore_\d{4}-\d{2}-\d{2}_\d{6}(?:_\d+)?\.zip$/,
  },
} as const;
const RETAINED_BACKUPS = 10;
type RetentionKind = keyof typeof RETENTION;

/** One key per file: Windows paths differ only in letter case. */
function fileKey(file: string) {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * Deletes the `kind` backups older than the newest `RETAINED_BACKUPS` still
 * on disk, logs each deletion and marks its jobs `pruned` (rows are kept).
 * Runs after a backup of that kind succeeded, under the operation lock.
 */
async function pruneBackups(kind: RetentionKind) {
  const types: readonly string[] = RETENTION[kind].types;
  const dir = fileKey(await getBackupDir());
  const rows = await db
    .select({
      id: backupJobs.id,
      type: backupJobs.type,
      filePath: backupJobs.filePath,
    })
    .from(backupJobs)
    .where(
      and(eq(backupJobs.status, "success"), isNotNull(backupJobs.filePath)),
    )
    .orderBy(desc(backupJobs.createdAt), desc(backupJobs.id));
  // A file another kind of job also recorded (a manual backup written in the
  // same second by an older build) is that job's file and stays.
  const othersFiles = new Set(
    rows
      .filter((row) => !types.includes(row.type))
      .map((row) => fileKey(row.filePath!)),
  );
  // Newest first; several jobs may name one file.
  const backups = new Map<string, { file: string; ids: number[] }>();
  for (const row of rows) {
    const file = path.resolve(row.filePath!);
    const key = fileKey(file);
    if (
      !types.includes(row.type) ||
      othersFiles.has(key) ||
      path.dirname(key) !== dir ||
      !RETENTION[kind].name.test(path.basename(file))
    )
      continue;
    const known = backups.get(key);
    if (known) known.ids.push(row.id);
    else backups.set(key, { file, ids: [row.id] });
  }
  let retained = 0;
  for (const { file, ids } of backups.values()) {
    // Only copies still on disk count; a link is not a file the app wrote.
    const stat = await fs.promises.lstat(file).catch(() => null);
    if (!stat?.isFile()) continue;
    if (retained < RETAINED_BACKUPS) {
      retained += 1;
      continue;
    }
    try {
      await fs.promises.rm(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Backup retention could not delete ${file}: ${message}`);
      await logBackup(
        ids[0],
        "warn",
        `تعذر حذف نسخة قديمة: ${file} (${message})`,
      );
      continue;
    }
    await db
      .update(backupJobs)
      .set({ status: "pruned" })
      .where(inArray(backupJobs.id, ids));
    console.info(`Backup retention deleted ${file}`);
    await logBackup(
      ids[0],
      "info",
      `حُذفت نسخة قديمة (${kind}) للإبقاء على أحدث ${RETAINED_BACKUPS}: ${file}`,
    );
  }
}

/** Retention never fails the backup that triggered it. */
async function applyRetention(kind: RetentionKind) {
  try {
    await pruneBackups(kind);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Backup retention (${kind}) failed: ${message}`);
    await logBackup(
      null,
      "error",
      `تعذر تطبيق حد الاحتفاظ بالنسخ (${kind}): ${message}`,
    );
  }
}

/** ينشئ نسخة احتياطية ويحفظها في مجلد النسخ الافتراضي. */
export async function createBackup(
  type: "manual" | "scheduled" | "email",
  userId?: number,
): Promise<CreateBackupResult> {
  // Take the lock before the first await so overlapping calls are refused
  // however quickly the other operation finishes.
  return exclusive(async () => {
    const dir = await getBackupDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = newArchivePath(
      dir,
      `Dalaly_Backup_${timestampLabel(new Date())}`,
    );
    const result = await writeBackupTo(filePath, type, userId);
    if (type !== "manual") await applyRetention("scheduled");
    return result;
  });
}

export type EmailArchive = { file_name: string; data: Buffer };

/**
 * The scheduled email's attachment: the database alone (manifest.json and
 * data.json; no images or documents, so ID scans never leave the office and
 * the file stays far below mail size limits), encrypted with `password`.
 * Built in memory and never written to disk; full backups stay in the
 * backup folder.
 */
export async function createEmailArchive(
  password: string,
): Promise<EmailArchive> {
  return exclusive(async () => {
    const type = "email_encrypted";
    const startedAt = Date.now();
    try {
      const zip = await zipBuffers(await databaseEntries(type, true));
      const data = await encryptBackup(zip, password);
      const fileName = `Dalaly_Database_${timestampLabel(new Date())}${ENCRYPTED_BACKUP_EXTENSION}`;
      const [job] = await db
        .insert(backupJobs)
        .values({
          type,
          status: "success",
          fileSize: data.length,
          durationMs: Date.now() - startedAt,
        })
        .returning();
      await logBackup(
        job.id,
        "info",
        `${type}: ${fileName} (${data.length} bytes)، قاعدة البيانات فقط، مشفّرة`,
      );
      return { file_name: fileName, data };
    } catch (error) {
      await recordFailure(type, startedAt, error);
      throw error;
    }
  });
}

/**
 * يصدّر نسخة احتياطية كاملة إلى مسار يختاره المستخدم عبر حوار حفظ Electron.
 * المسار يجب أن يكون مطلقاً وغير فارغ.
 */
export async function exportBackup(
  outputPath: string,
  userId?: number,
): Promise<CreateBackupResult> {
  const target = (outputPath ?? "").trim();
  if (!target) {
    throw new DomainError(400, "لم يتم تحديد مسار الحفظ.");
  }
  if (!path.isAbsolute(target)) {
    throw new DomainError(400, "مسار الحفظ غير صالح.");
  }
  return exclusive(() => writeBackupTo(target, "manual_export", userId));
}

/**
 * Rows from an archive written before a column existed. A follow-up from
 * before tasks (no `status`) gets what migration 0005 gave the rows that
 * existed then: done unless its date is still ahead.
 */
/**
 * Rows of a table that refers to itself, each after its parent, so one
 * chunk never names a parent a later chunk inserts. A row whose parent is
 * not among them keeps its place (its link is checked like any other).
 */
function parentsFirst(rows: Record<string, unknown>[], key: string) {
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  const placed = new Set<number>();
  const out: Record<string, unknown>[] = [];
  const place = (row: Record<string, unknown>, path: Set<number>) => {
    const id = Number(row.id);
    if (placed.has(id) || path.has(id)) return;
    path.add(id);
    const parent = byId.get(Number(row[key]));
    if (row[key] !== null && row[key] !== undefined && parent)
      place(parent, path);
    placed.add(id);
    out.push(row);
  };
  for (const row of rows) place(row, new Set());
  return out;
}

function upgradeRow(name: TableName, row: Record<string, unknown>) {
  if (
    (name === "property_followups" || name === "rental_followups") &&
    !("status" in row)
  ) {
    const scheduledAt = row.scheduledAt as Date | null | undefined;
    const upcoming = scheduledAt instanceof Date && scheduledAt > new Date();
    return {
      ...row,
      status: upcoming ? "open" : "done",
      completedAt: upcoming ? null : (scheduledAt ?? row.createdAt ?? null),
      updatedAt: row.updatedAt ?? row.createdAt,
    };
  }
  return row;
}

/**
 * Nullable links from restored rows to tables a scoped restore leaves in
 * place. A row from the archive may point at a listing or user deleted since
 * the backup; the restore treats that link as ON DELETE SET NULL would.
 */
const OUTSIDE_LINKS: Array<{
  table: TableName;
  column: string;
  target: TableName;
}> = [
  { table: "agreements", column: "propertyId", target: "properties" },
  { table: "agreements", column: "rentalId", target: "rentals" },
  { table: "deals", column: "propertyId", target: "properties" },
  { table: "deals", column: "rentalId", target: "rentals" },
  { table: "deals", column: "assignedUserId", target: "users" },
  { table: "deals", column: "createdBy", target: "users" },
  { table: "deals", column: "updatedBy", target: "users" },
  { table: "deal_stage_history", column: "userId", target: "users" },
  { table: "deal_offers", column: "createdBy", target: "users" },
  { table: "activities", column: "userId", target: "users" },
  { table: "activities", column: "assignedUserId", target: "users" },
  { table: "people", column: "assignedUserId", target: "users" },
];

/**
 * Clears links in `rows` of `name` whose target is not restored with them
 * and no longer exists. Targets' ids are read once per restore.
 */
async function dropDanglingLinks(
  tx: Transaction,
  name: TableName,
  rows: Record<string, unknown>[],
  restoring: readonly TableName[],
  existing: Map<TableName, Set<number>>,
) {
  for (const link of OUTSIDE_LINKS) {
    if (link.table !== name || restoring.includes(link.target)) continue;
    let ids = existing.get(link.target);
    if (!ids) {
      const spec = specByName(link.target);
      const found = await tx
        .select({ id: (spec.table as typeof users).id })
        .from(spec.table as typeof users);
      ids = new Set(found.map((row) => Number(row.id)));
      existing.set(link.target, ids);
    }
    for (const row of rows) {
      const value = row[link.column];
      if (value != null && !ids.has(Number(value))) row[link.column] = null;
    }
  }
}

/**
 * Links into a table a scoped restore replaces, from tables it leaves in
 * place. Deleting the target rows sets these to null (ON DELETE SET NULL),
 * so they are saved first and put back where the target is in the restored
 * data: a customers-only restore keeps listing owners, a listings-only one
 * keeps the listing of a deal or a contract.
 */
const KEPT_LINKS = [
  { table: "properties", column: "owner_person_id", target: "people" },
  { table: "rentals", column: "owner_person_id", target: "people" },
  { table: "property_followups", column: "person_id", target: "people" },
  { table: "rental_followups", column: "person_id", target: "people" },
  { table: "deals", column: "property_id", target: "properties" },
  { table: "deals", column: "rental_id", target: "rentals" },
  { table: "agreements", column: "property_id", target: "properties" },
  { table: "agreements", column: "rental_id", target: "rentals" },
  { table: "journal_lines", column: "person_id", target: "people" },
  { table: "journal_lines", column: "deal_id", target: "deals" },
  { table: "vouchers", column: "person_id", target: "people" },
  { table: "vouchers", column: "held_for_person_id", target: "people" },
  { table: "vouchers", column: "deal_id", target: "deals" },
  { table: "commissions", column: "payer_person_id", target: "people" },
  { table: "commissions", column: "deal_id", target: "deals" },
  { table: "leases", column: "landlord_person_id", target: "people" },
  { table: "leases", column: "tenant_person_id", target: "people" },
  { table: "leases", column: "agreement_id", target: "agreements" },
  { table: "leases", column: "rental_id", target: "rentals" },
] as const;

function keptLinks(restoring: readonly string[]) {
  return KEPT_LINKS.filter(
    (link) =>
      restoring.includes(link.target) && !restoring.includes(link.table),
  );
}

async function saveKeptLinks(tx: Transaction, restoring: readonly string[]) {
  const links = keptLinks(restoring);
  if (!links.length) return;
  await tx.execute(
    sql.raw(`CREATE TEMP TABLE restore_kept_links ON COMMIT DROP AS
      ${links
        .map(
          ({ table, column }) =>
            `SELECT '${table}.${column}'::text AS link, id, ${column} AS target_id FROM ${table} WHERE ${column} IS NOT NULL`,
        )
        .join(" UNION ALL ")}`),
  );
}

/** Puts back each saved link whose target is in the restored data. */
async function restoreKeptLinks(tx: Transaction, restoring: readonly string[]) {
  for (const { table, column, target } of keptLinks(restoring))
    await tx.execute(
      sql.raw(`UPDATE ${table} t SET ${column} = k.target_id
        FROM restore_kept_links k JOIN ${target} x ON x.id = k.target_id
        WHERE k.link = '${table}.${column}' AND t.id = k.id AND t.${column} IS NULL`),
    );
}

function coerceRow(
  row: Record<string, unknown>,
  dateFields: readonly string[],
) {
  const next = { ...row };
  for (const field of dateFields) {
    if (typeof next[field] === "string") {
      const date = new Date(next[field] as string);
      if (!Number.isNaN(date.getTime())) next[field] = date;
    }
  }
  return next;
}

async function resetSequence(name: TableName) {
  if (!SERIAL_TABLES.has(name)) return;
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('"${name}"', 'id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM "${name}"), 1))`,
  );
}

/** The archive's files below `prefix`, without directory entries. */
function filesUnder(archive: BackupArchive, prefix: string) {
  return [...archive.entries.values()].filter(
    (entry) =>
      entry.fileName.startsWith(prefix) && !/[\\/]$/.test(entry.fileName),
  );
}

/**
 * Writes one entry to `target` after it has been read and verified, so a
 * damaged archive never replaces a good file; one file is in memory at a time.
 */
async function extractTo(
  archive: BackupArchive,
  entry: ArchiveEntry,
  target: string,
) {
  const data = await archive.read(entry);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, data);
}

async function extractImages(archive: BackupArchive) {
  const entries = filesUnder(archive, "images/properties/");
  if (!entries.length) return 0;
  await fs.promises.mkdir(config.imagesDir, { recursive: true });
  for (const entry of entries) {
    const relative = entry.fileName.replace(/^images\/properties\//, "");
    const target = path.resolve(config.imagesDir, relative);
    if (!target.startsWith(path.resolve(config.imagesDir) + path.sep))
      throw new DomainError(400, "مسار صورة في النسخة غير صالح.");
    await extractTo(archive, entry, target);
  }
  return entries.length;
}

async function extractDocuments(archive: BackupArchive) {
  const entries = filesUnder(archive, "documents/");
  if (!entries.length) return 0;
  await fs.promises.mkdir(config.documentsDir, { recursive: true });
  for (const entry of entries) {
    const relative = entry.fileName.replace(/^documents\//, "");
    await extractTo(archive, entry, resolveManagedFile(relative));
  }
  return entries.length;
}

export type RestoreScope =
  "full" | "properties" | "images" | "users" | "settings" | "rentals" | "crm";

async function validateBackupSchema(
  archive: BackupArchive,
  database: Record<string, Record<string, unknown>[]>,
) {
  const manifestEntry = archive.entries.get("manifest.json");
  if (!manifestEntry)
    throw new DomainError(400, "بيانات تعريف النسخة الاحتياطية مفقودة.");
  const manifest = JSON.parse(
    (await archive.read(manifestEntry)).toString("utf8"),
  );
  if (!manifest || manifest.version !== BACKUP_VERSION)
    throw new DomainError(
      400,
      "صيغة النسخة لا تتوافق مع مخطط هذا الإصدار. استعد النسخ السابقة باستخدام إصدارها في بيئة معزولة.",
    );
  if (!database || typeof database !== "object" || Array.isArray(database))
    throw new DomainError(400, "بيانات النسخة الاحتياطية غير صالحة.");
  const tableNames = new Set<string>(TABLE_SPECS.map((spec) => spec.name));
  if (
    Object.keys(database).some((name) => !tableNames.has(name)) ||
    TABLE_SPECS.some(
      (spec) => !isOptional(spec) && !Object.hasOwn(database, spec.name),
    )
  )
    throw new DomainError(
      400,
      "مخطط جداول النسخة الاحتياطية لا يطابق هذا الإصدار.",
    );
  for (const spec of TABLE_SPECS) {
    if (isOptional(spec) && !Object.hasOwn(database, spec.name)) continue;
    const rows = database[spec.name];
    const columns = new Set(Object.keys(getTableColumns(spec.table)));
    if (
      !Array.isArray(rows) ||
      rows.some(
        (row) =>
          !row ||
          typeof row !== "object" ||
          Array.isArray(row) ||
          Object.keys(row).some((key) => !columns.has(key)),
      )
    )
      throw new DomainError(
        400,
        "حقول النسخة الاحتياطية لا تطابق المخطط الحالي.",
      );
  }
  if (
    database.permissions.some(
      (row) => typeof row.key !== "string" || !isActivePermissionKey(row.key),
    ) ||
    database.app_settings.some(
      (row) => typeof row.key !== "string" || !isActiveSettingKey(row.key),
    )
  )
    throw new DomainError(
      400,
      "تحتوي النسخة على صلاحيات أو إعدادات ضمن مساحات أسماء متقاعدة.",
    );
  const permissionIds = new Set(database.permissions.map((row) => row.id));
  if (
    database.role_permissions.some(
      (row) => !permissionIds.has(row.permissionId),
    )
  )
    throw new DomainError(400, "تحتوي النسخة على علاقات صلاحيات غير صالحة.");
  return manifest as { contents?: unknown };
}

/**
 * يسترجع نسخة احتياطية حسب النطاق المحدد، من مسار ملف ZIP (يُقرأ من القرص
 * عند الحاجة) أو من محتواه المرفوع. An encrypted backup needs `password`.
 */
export async function restoreBackup(
  source: string | Buffer,
  scope: RestoreScope,
  userId?: number,
  password?: string,
) {
  return exclusive(() => restoreArchive(source, scope, userId, password));
}

/**
 * An encrypted backup decrypted in memory (it holds the database alone,
 * which restore reads whole anyway); a zip as it is.
 */
async function decryptedSource(source: string | Buffer, password?: string) {
  if (typeof source !== "string")
    return isEncryptedBackup(source) ? decryptBackup(source, password) : source;
  const head = Buffer.alloc(ENCRYPTED_BACKUP_MAGIC_BYTES);
  const file = await fs.promises.open(source, "r");
  try {
    await file.read(head, 0, head.length, 0);
  } finally {
    await file.close();
  }
  return isEncryptedBackup(head)
    ? decryptBackup(await fs.promises.readFile(source), password)
    : source;
}

async function restoreArchive(
  source: string | Buffer,
  scope: RestoreScope,
  userId?: number,
  password?: string,
) {
  const startedAt = Date.now();
  let schemaValidated = false;
  let archive: BackupArchive | undefined;
  try {
    archive = await openArchive(await decryptedSource(source, password));
    const dataEntry = archive.entries.get("data.json");
    if (!dataEntry) {
      throw new DomainError(
        400,
        "ملف النسخة الاحتياطية غير صالح (data.json مفقود).",
      );
    }
    const database = JSON.parse(
      (await archive.read(dataEntry)).toString("utf8"),
    ) as Record<string, Record<string, unknown>[]>;

    const manifest = await validateBackupSchema(archive, database);
    // A database-only archive (the emailed one) restores rows and writes no
    // files; the images and documents on disk stay as they are.
    const databaseOnly = manifest.contents === DATABASE_ONLY;
    if (databaseOnly && scope === "images")
      throw new DomainError(
        400,
        "هذه النسخة تحتوي على قاعدة البيانات فقط ولا تحتوي على صور. اختر نطاقاً آخر للاسترجاع.",
      );
    schemaValidated = true;
    // Restore replaces whole tables. Keep the current data first so a wrong
    // file can be undone; if that copy cannot be written, nothing is touched.
    const safetyBackup = await writeBackupTo(
      newArchivePath(
        await getBackupDir(),
        `Dalaly_Before_Restore_${timestampLabel(new Date())}`,
      ),
      "pre_restore",
      userId,
    );
    await applyRetention("pre_restore");
    const tablesToRestore = SCOPE_TABLES[scope] ?? SCOPE_TABLES.full;
    let documentsRestored = 0;
    if (scope === "full" || scope === "crm") {
      // Restore managed documents before publishing rows that reference them.
      documentsRestored = await extractDocuments(archive);
    }

    await db.transaction(async (tx) => {
      // Rewriting whole tables may take longer than a request is allowed.
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      // The ledger's triggers let this transaction replace posted entries
      // and clear the customer and deal links it puts back below.
      await tx.execute(
        sql`SELECT set_config('dalaly.ledger_restore', 'on', true)`,
      );
      // Replacing a table sets links to it from tables outside the scope to
      // null (ON DELETE SET NULL); keep those links to put them back.
      await saveKeptLinks(tx, tablesToRestore);
      const existingIds = new Map<TableName, Set<number>>();
      // حذف بترتيب عكسي (الابن قبل الأب) لتفادي قيود المفاتيح الأجنبية.
      for (const name of [...tablesToRestore].reverse()) {
        if (scope === "users" && name === "users") continue;
        await tx.delete(specByName(name).table);
      }
      // إدراج بترتيب الأب قبل الابن.
      for (const name of tablesToRestore) {
        const spec = specByName(name);
        let rows = (database[name] ?? []).map((row) =>
          upgradeRow(name, coerceRow(row, spec.dates)),
        );
        if (name === "accounts") rows = parentsFirst(rows, "parentId");
        if (name === "journal_entries")
          rows = parentsFirst(rows, "reversalOfId");
        await dropDanglingLinks(tx, name, rows, tablesToRestore, existingIds);
        if (rows.length) {
          if (scope === "users" && name === "users") {
            for (const row of rows)
              await tx
                .insert(spec.table)
                .values(row as never)
                .onConflictDoUpdate({
                  target: (spec.table as typeof users).id,
                  set: row,
                });
          } else {
            // One multi-row INSERT binds a parameter per column per row and
            // PostgreSQL allows 65535, so large tables go in chunks.
            const chunkSize = Math.max(
              1,
              Math.floor(
                MAX_BIND_PARAMETERS /
                  Object.keys(getTableColumns(spec.table)).length,
              ),
            );
            for (let start = 0; start < rows.length; start += chunkSize)
              await tx
                .insert(spec.table)
                .values(rows.slice(start, start + chunkSize) as never);
          }
        }
      }
      await restoreKeptLinks(tx, tablesToRestore);
    });

    for (const name of tablesToRestore) {
      await resetSequence(name);
    }
    if (tablesToRestore.includes("accounts")) {
      await ensureDefaultChart();
      await ensureDefaultExpenseCategories();
    }

    let imagesRestored = 0;
    if (scope === "full" || scope === "images" || scope === "properties") {
      imagesRestored = await extractImages(archive);
    }

    const durationMs = Date.now() - startedAt;
    const [job] = await db
      .insert(backupJobs)
      .values({
        type: "restore",
        status: "success",
        durationMs,
        userId: userId ?? null,
      })
      .returning();
    await logBackup(
      job.id,
      "info",
      `تم الاسترجاع (${scope}${databaseOnly ? "، قاعدة البيانات فقط" : ""}). الجداول: ${tablesToRestore.join(", ")}. صور: ${imagesRestored}`,
    );

    return {
      ok: true,
      scope,
      tables: tablesToRestore,
      images_restored: imagesRestored,
      documents_restored: documentsRestored,
      database_only: databaseOnly,
      safety_backup_path: safetyBackup.file_path,
    };
  } catch (error) {
    // Until the schema check passes, only the archive has been read: a
    // failure here means the file is not a readable Dalaly backup.
    if (!schemaValidated)
      throw error instanceof DomainError
        ? error
        : new DomainError(
            400,
            "تعذر قراءة ملف النسخة الاحتياطية. تأكد أنه نسخة من دلالي وأنه غير تالف.",
          );
    const message = error instanceof Error ? error.message : String(error);
    const [job] = await db
      .insert(backupJobs)
      .values({
        type: "restore",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error: message,
        userId: userId ?? null,
      })
      .returning();
    await logBackup(job?.id ?? null, "error", `فشل الاسترجاع: ${message}`);
    throw error;
  } finally {
    await archive?.close();
  }
}
