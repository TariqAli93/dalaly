import pg from "pg";
import {
  getSetupStatus,
  markMigrationsFailed,
  markMigrationsSucceeded,
} from "../../infrastructure/database/health.js";
import {
  applyMigrations,
  getMigrationsFolder,
} from "../../infrastructure/database/run-migrations.js";
import { reconfigurePool } from "../../infrastructure/database/pool.js";
import {
  adminExists,
  createAdmin,
  getUserByUsername,
} from "../auth/auth.service.js";
import { assignSuperAdminRole, seedSystemRbac } from "../rbac/rbac.service.js";
import {
  DATABASE_NAME_PATTERN,
  type InitializeInput,
  type TestPostgresInput,
} from "./setup.schema.js";

type AdminConnectionInput = {
  host: string;
  port: number;
  adminUsername: string;
  adminPassword: string;
};

const ADMIN_DATABASE = "postgres";
const CONNECTION_TIMEOUT_MS = 5000;

export function isValidDatabaseName(name: string) {
  return DATABASE_NAME_PATTERN.test(name);
}

function createAdminPool(input: AdminConnectionInput) {
  return new pg.Pool({
    host: input.host,
    port: input.port,
    user: input.adminUsername,
    password: input.adminPassword,
    database: ADMIN_DATABASE,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
}

function buildConnectionString(input: AdminConnectionInput & { databaseName: string }) {
  const user = encodeURIComponent(input.adminUsername);
  const password = encodeURIComponent(input.adminPassword);
  return `postgres://${user}:${password}@${input.host}:${input.port}/${input.databaseName}`;
}

async function databaseExists(adminPool: pg.Pool, databaseName: string) {
  const result = await adminPool.query(
    "select 1 from pg_database where datname = $1",
    [databaseName],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * يفحص اتصال PostgreSQL admin دون إنشاء أي شيء.
 */
export async function testPostgresConnection(input: TestPostgresInput) {
  const adminPool = createAdminPool(input);
  try {
    await adminPool.query("select 1");
    const exists = await databaseExists(adminPool, input.databaseName);
    return {
      ok: true as const,
      database_exists: exists,
    };
  } finally {
    await adminPool.end().catch(() => undefined);
  }
}

/**
 * يُنشئ قاعدة البيانات (إن لم تكن موجودة)، يعيد تهيئة الـ pool، يشغّل
 * migrations، يبذر صلاحيات النظام، وينشئ أول Super Admin. العملية idempotent.
 */
export async function initializeSystem(input: InitializeInput) {
  if (!isValidDatabaseName(input.databaseName)) {
    throw new Error("اسم قاعدة البيانات غير صالح.");
  }

  // 1) إنشاء قاعدة البيانات عبر اتصال admin مؤقت بقاعدة postgres.
  const adminPool = createAdminPool(input);
  let databaseCreated = false;
  try {
    if (!(await databaseExists(adminPool, input.databaseName))) {
      // لا يمكن استخدام parameterized query لاسم القاعدة في CREATE DATABASE،
      // لذا نعتمد على التحقق الصارم من الاسم أعلاه.
      await adminPool.query(`CREATE DATABASE "${input.databaseName}"`);
      databaseCreated = true;
    }
  } finally {
    await adminPool.end().catch(() => undefined);
  }

  // 2) بناء DATABASE_URL للقاعدة الجديدة وإعادة تهيئة الـ pool الرئيسي.
  const connectionString = buildConnectionString(input);
  await reconfigurePool(connectionString);

  // 3) تشغيل migrations + بذر الصلاحيات. idempotent بطبيعته.
  let migrationsFolder: string | null = null;
  try {
    migrationsFolder = getMigrationsFolder();
    await applyMigrations(migrationsFolder);
    await seedSystemRbac();
    markMigrationsSucceeded(migrationsFolder);
  } catch (error) {
    markMigrationsFailed(error, migrationsFolder);
    throw error;
  }

  // 4) إنشاء أول Super Admin (idempotent: لا ينشئ تكراراً).
  const admin = await ensureFirstAdmin(input.firstAdminUsername, input.firstAdminPin);

  return {
    ok: true as const,
    database_created: databaseCreated,
    migrations_ok: true as const,
    database_url: connectionString,
    admin: {
      username: admin.username,
      // يُعرض الـ PIN مرة واحدة فقط، وفقط عند إنشاء مستخدم جديد فعلاً.
      pin: admin.created ? input.firstAdminPin : null,
    },
  };
}

/**
 * ينشئ أول مدير إن لم يكن موجوداً. إذا وُجد مستخدم بنفس الاسم يضمن ربطه
 * بدور Super Admin فقط (بدون تكرار).
 */
async function ensureFirstAdmin(username: string, pin: string) {
  const existing = await getUserByUsername(username);
  if (existing) {
    await assignSuperAdminRole(existing.id);
    return { username: existing.username, created: false as const };
  }

  // إذا كان هناك أي مستخدم آخر بالفعل، فالنظام مهيأ مسبقاً؛ لا ننشئ مديراً جديداً.
  if (await adminExists()) {
    return { username, created: false as const };
  }

  const user = await createAdmin(username, pin);
  return { username: user.username, created: true as const };
}

export { getSetupStatus };
