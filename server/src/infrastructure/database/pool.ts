import pg from "pg";
import { buildPoolConfig, config } from "../config.js";

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
let activePool = new pg.Pool(buildPoolConfig());
let runtimeConfigured = false;

export const pool = new Proxy({} as pg.Pool, {
  get(_target, property, receiver) {
    const value = Reflect.get(activePool, property, receiver);
    return typeof value === "function" ? value.bind(activePool) : value;
  },
});

/**
 * يعيد تهيئة الـ pool ليتصل بقاعدة بيانات جديدة عبر connection string،
 * بعد التحقق من نجاح الاتصال. يغلق الـ pool القديم بهدوء.
 */
export async function reconfigurePool(connectionString: string) {
  const nextPool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: config.db.connectionTimeoutMillis,
  });

  // تحقق من أن الاتصال الجديد يعمل قبل تبديل الـ pool الحالي.
  await nextPool.query("select 1");

  const previousPool = activePool;
  activePool = nextPool;
  runtimeConfigured = true;

  await previousPool.end().catch(() => undefined);
}

export function markDatabaseConfigured() {
  runtimeConfigured = true;
}

export function isDatabaseConfigured() {
  return runtimeConfigured || config.dbConfigured;
}
