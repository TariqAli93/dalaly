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
import {
  getActivePoolConfig,
  reconfigurePool,
} from "../../infrastructure/database/pool.js";
import {
  installationInitialized,
  markInstallationInitialized,
} from "../../infrastructure/database/setup-marker.js";
import { prepareDatabase } from "../../infrastructure/database/startup.js";
import { DomainError } from "../../shared/errors.js";
import { hashPin } from "../auth/crypto.js";
import { SUPER_ADMIN_ROLE } from "../rbac/rbac.constants.js";
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
let setupInProgress = false;

export class SetupError extends DomainError {
  constructor(message: string, statusCode = 409) {
    super(statusCode, message);
    this.name = "SetupError";
  }
}

/**
 * Setup is the one place that shows PostgreSQL's own reason for a failure
 * (wrong password, unreachable host, no CREATE DATABASE right): whoever
 * installs the app has to fix exactly that.
 */
function setupFailure(prefix: string, error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  return new SetupError(
    `${prefix}: ${reason}`,
    error instanceof DomainError ? error.statusCode : 400,
  );
}

export async function withSetupOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  if (setupInProgress)
    throw new SetupError(
      "عملية إعداد أخرى قيد التنفيذ. انتظر ثم أعد المحاولة.",
    );
  setupInProgress = true;
  try {
    return await operation();
  } finally {
    setupInProgress = false;
  }
}

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
    query_timeout: 15000,
    statement_timeout: 15000,
  });
}

function buildConnectionString(
  input: AdminConnectionInput & { databaseName: string },
) {
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
  } catch (error) {
    throw setupFailure("تعذر الاتصال بـ PostgreSQL", error);
  } finally {
    await adminPool.end().catch(() => undefined);
  }
}

/**
 * يُنشئ قاعدة البيانات (إن لم تكن موجودة)، يعيد تهيئة الـ pool، يشغّل
 * migrations، يبذر صلاحيات النظام، وينشئ أول Super Admin لتثبيت جديد فقط.
 */
export async function initializeSystem(input: InitializeInput) {
  try {
    return await withSetupOperation(() => initializeNewSystem(input));
  } catch (error) {
    throw setupFailure("تعذر تهيئة النظام", error);
  }
}

async function initializeNewSystem(input: InitializeInput) {
  const current = await getSetupStatus();
  if (current.startup_state === "CHECKING")
    throw new SetupError(
      "فحص قاعدة البيانات قيد التنفيذ. أعد المحاولة بعد اكتماله.",
    );
  if (current.db_connected && !current.admin_setup_allowed)
    throw new SetupError("النظام الحالي مهيأ مسبقاً. استخدم استرداد التهيئة.");
  if (!isValidDatabaseName(input.databaseName)) {
    throw new Error("اسم قاعدة البيانات غير صالح.");
  }

  // 1) إنشاء قاعدة البيانات عبر اتصال admin مؤقت بقاعدة postgres.
  const adminPool = createAdminPool(input);
  let databaseCreated = false;
  try {
    const exists = await databaseExists(adminPool, input.databaseName);
    if (exists) {
      // Inspect the target before changing the active connection or running SQL.
      const target = new pg.Client({
        connectionString: buildConnectionString(input),
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        query_timeout: 5000,
      });
      try {
        await target.connect();
        if (await installationInitialized(target))
          throw new SetupError(
            "هذا النظام مهيأ مسبقاً. استخدم استرداد التهيئة دون إنشاء مدير جديد.",
          );
      } finally {
        await target.end().catch(() => undefined);
      }
    } else {
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
    await applyMigrations(migrationsFolder, { initialize: true });
    markMigrationsSucceeded(migrationsFolder);
  } catch (error) {
    markMigrationsFailed(error, migrationsFolder);
    throw error;
  }

  // 4) إنشاء أول Super Admin، مع قفل ومعاملة تمنعان إعادة إنشاء المدير.
  const admin = await createInitialAdmin(
    input.firstAdminUsername,
    input.firstAdminPin,
  );

  return {
    ok: true as const,
    database_created: databaseCreated,
    migrations_ok: true as const,
    database_url: connectionString,
    admin: {
      username: admin.username,
      // يُعرض الـ PIN مرة واحدة فقط، وفقط عند إنشاء مستخدم جديد فعلاً.
      pin: input.firstAdminPin,
    },
  };
}

/**
 * ينشئ المدير في معاملة واحدة فقط لتثبيت جديد، دون ترقية أي مستخدم موجود.
 */
async function createInitialAdmin(username: string, pin: string) {
  const client = new pg.Client(getActivePoolConfig());
  try {
    await client.connect();
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(734126, 1)");
    if (await installationInitialized(client))
      throw new SetupError(
        "تم إعداد النظام مسبقاً. لا يمكن إعادة إنشاء المدير من الإعداد العام.",
      );
    const roles = await client.query("select id from roles where name = $1", [
      SUPER_ADMIN_ROLE,
    ]);
    if (!roles.rows[0])
      throw new SetupError("أكمل استرداد تهيئة قاعدة البيانات أولاً.", 503);
    const result = await client.query(
      "insert into users (username, display_name, pin_hash) values ($1, $1, $2) returning id, username, display_name, is_active",
      [username, await hashPin(pin)],
    );
    const user = result.rows[0];
    await client.query(
      "insert into user_roles (user_id, role_id) values ($1, $2)",
      [user.id, roles.rows[0].id],
    );
    await markInstallationInitialized(client);
    await client.query("commit");
    return {
      id: Number(user.id),
      username: user.username as string,
      displayName: user.display_name as string,
      isActive: user.is_active as boolean,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function createFirstAdmin(username: string, pin: string) {
  return withSetupOperation(async () => {
    const status = await getSetupStatus();
    if (
      status.startup_state !== "SETUP_REQUIRED" ||
      !status.migrations_ok ||
      !status.users_table_exists
    )
      throw new SetupError(
        "قاعدة البيانات غير جاهزة لإنشاء المستخدم الأول.",
        503,
      );
    return createInitialAdmin(username, pin);
  });
}

export async function recoverSystem() {
  return withSetupOperation(async () => {
    const status = await getSetupStatus();
    if (
      !status.db_configured ||
      !status.db_connected ||
      status.database_exists !== true
    )
      throw new SetupError("تعذر الاتصال بقاعدة البيانات الحالية.", 503);
    await prepareDatabase();
    const recovered = await getSetupStatus();
    if (!recovered.migrations_ok)
      throw new SetupError(
        "تعذر استرداد التهيئة. تحقق من ملفات الهجرة وسجلات الخادم.",
        503,
      );
    return recovered;
  });
}
