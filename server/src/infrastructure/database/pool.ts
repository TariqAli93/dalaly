import pg from "pg";
import {
  buildPoolConfig,
  config,
  databaseTarget,
  type DatabaseTarget,
} from "../config.js";

/**
 * Pool قابل لإعادة التهيئة أثناء التشغيل.
 *
 * المشكلة: pg.Pool لا يسمح بتغيير وجهة الاتصال بعد إنشائه، بينما
 * تلتقط جميع الـ repositories مرجع `db`/`pool` مرة واحدة عند الاستيراد.
 *
 * الحل: نُصدّر Proxy ثابتاً يفوّض كل الاستدعاءات إلى pool داخلي قابل للتبديل.
 * عند تشغيل First Run Wizard ننشئ pool جديداً للقاعدة المنشأة ونبدّله،
 * فتتجه كل العمليات اللاحقة (بما فيها drizzle) إلى القاعدة الجديدة بدون
 * إعادة تشغيل الخادم.
 */
let activeTarget = databaseTarget();
let activePool = createPool(activeTarget);
let runtimeConfigured = false;

function createPool(target: DatabaseTarget) {
  const next = new pg.Pool(buildPoolConfig(target));
  next.on("error", (error) =>
    console.error("Idle database connection failed", error.message),
  );
  return next;
}

/**
 * Settings for a one-off connection to the active database (health checks,
 * creating the first administrator): the pool's statement timeout, the
 * short connect timeout and a client-side read timeout, so a check fails
 * fast.
 */
export function getActivePoolConfig() {
  return {
    ...buildPoolConfig(activeTarget),
    connectionTimeoutMillis: config.db.connectionTimeoutMillis,
    query_timeout: 5000,
  };
}

/**
 * A short-lived pool for startup and setup work, with a 15 s client-side
 * read timeout on top of the statement timeout.
 */
export async function withStartupPool<T>(
  operation: (startupPool: pg.Pool) => Promise<T>,
  { readTimeoutMillis = 15000 } = {},
) {
  const startupPool = new pg.Pool({
    ...getActivePoolConfig(),
    query_timeout: readTimeoutMillis,
  });
  startupPool.on("error", (error) =>
    console.error("Startup database connection failed", error.message),
  );
  try {
    return await operation(startupPool);
  } finally {
    await startupPool.end().catch(() => undefined);
  }
}

/**
 * The startup pool without its read timeout, for applying migrations: they
 * lift the statement timeout inside their transaction, as a migration may
 * run longer than any request.
 */
export function withMigrationPool<T>(
  operation: (startupPool: pg.Pool) => Promise<T>,
) {
  return withStartupPool(operation, { readTimeoutMillis: 0 });
}

export const pool = new Proxy({} as pg.Pool, {
  get(_target, property, receiver) {
    const value = Reflect.get(activePool, property, receiver);
    return typeof value === "function" ? value.bind(activePool) : value;
  },
  // Drizzle gives a transaction its own client only when the driver looks
  // like a pg Pool (instanceof, or a prototype named *Pool). A bare proxy
  // fails both checks, and BEGIN, each statement and COMMIT then went through
  // pool.query separately, each possibly on a different connection.
  getPrototypeOf: () => pg.Pool.prototype,
});

/**
 * يعيد تهيئة الـ pool ليتصل بقاعدة بيانات جديدة عبر connection string،
 * بعد التحقق من نجاح الاتصال. يغلق الـ pool القديم بهدوء.
 */
export async function reconfigurePool(connectionString: string) {
  const nextTarget = { connectionString };
  const nextPool = createPool(nextTarget);

  // تحقق من أن الاتصال الجديد يعمل قبل تبديل الـ pool الحالي.
  try {
    const probe = { text: "select 1", query_timeout: 5000 };
    await nextPool.query(probe);
  } catch (error) {
    await nextPool.end().catch(() => undefined);
    throw error;
  }

  const previousPool = activePool;
  activePool = nextPool;
  activeTarget = nextTarget;
  runtimeConfigured = true;

  await previousPool.end().catch(() => undefined);
}

export function isDatabaseConfigured() {
  return runtimeConfigured || config.dbConfigured;
}
