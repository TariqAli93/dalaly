import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { getTableColumns } from "drizzle-orm";
import { config } from "../../infrastructure/config.js";
import { db } from "../../infrastructure/database/db.js";
import { pool } from "../../infrastructure/database/pool.js";
import { resolveManagedFile } from "../documents/documents.storage.js";
import { getSetting, setSetting } from "../settings/settings.repository.js";
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
  favoriteProperties,
  rentalImages,
  rentalFollowups,
  favoriteRentals,
  rentalRequests,
  purchaseRequests,
  documentTypes,
  identityDocuments,
  officeProfiles,
  auditLogs,
  appSettings,
} from "../../infrastructure/database/schema.js";
import {
  isActivePermissionKey,
  isActiveSettingKey,
} from "../rbac/key-policy.js";
const BACKUP_VERSION = 3;
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
    dates: ["scheduledAt", "createdAt"],
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
    dates: ["scheduledAt", "createdAt"],
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
  settings: ["app_settings", "office_profiles", "document_types"],
  rentals: [
    "governorates",
    "districts",
    "neighborhoods",
    "rentals",
    "rental_images",
    "rental_followups",
    "favorite_rentals",
  ],
  crm: [
    "people",
    "rental_requests",
    "purchase_requests",
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
  "document_types",
  "identity_documents",
  "audit_logs",
]);
function specByName(name: TableName) {
  return TABLE_SPECS.find((spec) => spec.name === name)!;
}

function configJsonPath() {
  // config.json يقع في جذر userData (appDataDir).
  return path.join(config.appDataDir, "config.json");
}

async function exportDatabase() {
  return db.transaction(
    async (tx) => {
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

function addImagesToZip(zip: AdmZip) {
  if (fs.existsSync(config.imagesDir)) {
    zip.addLocalFolder(config.imagesDir, "images/properties");
  }
  if (fs.existsSync(config.documentsDir)) {
    zip.addLocalFolder(config.documentsDir, "documents");
  }
}

function timestampLabel(now: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

async function logBackup(jobId: number | null, level: string, message: string) {
  try {
    await db.insert(backupLogs).values({ jobId, level, message });
  } catch {
    // تجاهل
  }
}

export async function listBackupJobs(limit = 50) {
  const { desc } = await import("drizzle-orm");
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
  const { eq } = await import("drizzle-orm");
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

/** يبني أرشيف ZIP كامل: JSON منطقي + صور + config + metadata. */
async function assembleBackupZip(backupType: string) {
  const database = await exportDatabase();
  const manifest = {
    version: BACKUP_VERSION,
    app_version: config.appVersion,
    created_at: new Date().toISOString(),
    backup_type: backupType,
    tables_count: Object.keys(database).length,
  };

  const zip = new AdmZip();
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
  zip.addFile("data.json", Buffer.from(JSON.stringify(database)));

  const cfgPath = configJsonPath();
  if (fs.existsSync(cfgPath)) {
    zip.addLocalFile(cfgPath, "", "config.json");
  }

  addImagesToZip(zip);
  return zip;
}

/** المنطق المشترك: يبني الأرشيف ويكتبه إلى المسار ويسجّل النتيجة في backup_jobs/backup_logs. */
async function writeBackupTo(
  filePath: string,
  type: string,
  userId?: number,
): Promise<CreateBackupResult> {
  const startedAt = Date.now();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const zip = await assembleBackupZip(type);
    zip.writeZip(filePath);

    const fileSize = fs.statSync(filePath).size;
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
    throw error;
  }
}

/** ينشئ نسخة احتياطية ويحفظها في مجلد النسخ الافتراضي. */
export async function createBackup(
  type: "manual" | "scheduled" | "email",
  userId?: number,
): Promise<CreateBackupResult> {
  const dir = await getBackupDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(
    dir,
    `Dalaly_Backup_${timestampLabel(new Date())}.zip`,
  );
  return writeBackupTo(filePath, type, userId);
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
    throw new Error("لم يتم تحديد مسار الحفظ.");
  }
  if (!path.isAbsolute(target)) {
    throw new Error("مسار الحفظ غير صالح.");
  }
  return writeBackupTo(target, "manual_export", userId);
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

function extractImagesFromZip(zip: AdmZip) {
  const entries = zip
    .getEntries()
    .filter(
      (e) => e.entryName.startsWith("images/properties/") && !e.isDirectory,
    );
  if (!entries.length) return 0;
  fs.mkdirSync(config.imagesDir, { recursive: true });
  for (const entry of entries) {
    const relative = entry.entryName.replace(/^images\/properties\//, "");
    const target = path.resolve(config.imagesDir, relative);
    if (!target.startsWith(path.resolve(config.imagesDir) + path.sep))
      throw new Error("مسار صورة في النسخة غير صالح.");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
  }
  return entries.length;
}

function extractDocumentsFromZip(zip: AdmZip) {
  const entries = zip
    .getEntries()
    .filter((e) => e.entryName.startsWith("documents/") && !e.isDirectory);
  if (!entries.length) return 0;
  fs.mkdirSync(config.documentsDir, { recursive: true });
  for (const entry of entries) {
    const relative = entry.entryName.replace(/^documents\//, "");
    const target = resolveManagedFile(relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
  }
  return entries.length;
}

export type RestoreScope =
  "full" | "properties" | "images" | "users" | "settings" | "rentals" | "crm";

function validateBackupSchema(
  zip: AdmZip,
  database: Record<string, Record<string, unknown>[]>,
) {
  const manifestEntry = zip.getEntry("manifest.json");
  if (!manifestEntry) throw new Error("بيانات تعريف النسخة الاحتياطية مفقودة.");
  const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
  if (!manifest || manifest.version !== BACKUP_VERSION)
    throw new Error(
      "صيغة النسخة لا تتوافق مع مخطط هذا الإصدار. استعد النسخ السابقة باستخدام إصدارها في بيئة معزولة.",
    );
  if (!database || typeof database !== "object" || Array.isArray(database))
    throw new Error("بيانات النسخة الاحتياطية غير صالحة.");
  const tableNames = new Set<string>(TABLE_SPECS.map((spec) => spec.name));
  if (
    Object.keys(database).some((name) => !tableNames.has(name)) ||
    TABLE_SPECS.some((spec) => !Object.hasOwn(database, spec.name))
  )
    throw new Error("مخطط جداول النسخة الاحتياطية لا يطابق هذا الإصدار.");
  for (const spec of TABLE_SPECS) {
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
      throw new Error("حقول النسخة الاحتياطية لا تطابق المخطط الحالي.");
  }
  if (
    database.permissions.some(
      (row) => typeof row.key !== "string" || !isActivePermissionKey(row.key),
    ) ||
    database.app_settings.some(
      (row) => typeof row.key !== "string" || !isActiveSettingKey(row.key),
    )
  )
    throw new Error(
      "تحتوي النسخة على صلاحيات أو إعدادات ضمن مساحات أسماء متقاعدة.",
    );
  const permissionIds = new Set(database.permissions.map((row) => row.id));
  if (
    database.role_permissions.some(
      (row) => !permissionIds.has(row.permissionId),
    )
  )
    throw new Error("تحتوي النسخة على علاقات صلاحيات غير صالحة.");
}

/** يسترجع نسخة احتياطية من محتوى ZIP حسب النطاق المحدد. */
export async function restoreBackup(
  zipBuffer: Buffer,
  scope: RestoreScope,
  userId?: number,
) {
  const startedAt = Date.now();
  let schemaValidated = false;
  try {
    const zip = new AdmZip(zipBuffer);
    const dataEntry = zip.getEntry("data.json");
    if (!dataEntry) {
      throw new Error("ملف النسخة الاحتياطية غير صالح (data.json مفقود).");
    }
    const database = JSON.parse(dataEntry.getData().toString("utf8")) as Record<
      string,
      Record<string, unknown>[]
    >;

    validateBackupSchema(zip, database);
    schemaValidated = true;
    const tablesToRestore = SCOPE_TABLES[scope] ?? SCOPE_TABLES.full;
    let documentsRestored = 0;
    if (scope === "full" || scope === "crm") {
      // Restore managed documents before publishing rows that reference them.
      documentsRestored = extractDocumentsFromZip(zip);
    }

    await db.transaction(async (tx) => {
      // حذف بترتيب عكسي (الابن قبل الأب) لتفادي قيود المفاتيح الأجنبية.
      for (const name of [...tablesToRestore].reverse()) {
        if (scope === "users" && name === "users") continue;
        await tx.delete(specByName(name).table);
      }
      // إدراج بترتيب الأب قبل الابن.
      for (const name of tablesToRestore) {
        const spec = specByName(name);
        const rows = (database[name] ?? []).map((row) =>
          coerceRow(row, spec.dates),
        );
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
          } else await tx.insert(spec.table).values(rows as never);
        }
      }
    });

    for (const name of tablesToRestore) {
      await resetSequence(name);
    }

    let imagesRestored = 0;
    if (scope === "full" || scope === "images" || scope === "properties") {
      imagesRestored = extractImagesFromZip(zip);
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
      `تم الاسترجاع (${scope}). الجداول: ${tablesToRestore.join(", ")}. صور: ${imagesRestored}`,
    );

    return {
      ok: true,
      scope,
      tables: tablesToRestore,
      images_restored: imagesRestored,
      documents_restored: documentsRestored,
    };
  } catch (error) {
    if (!schemaValidated) throw error;
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
  }
}
