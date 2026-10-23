import dotenv from "dotenv";
import path from "node:path";
import type { PoolConfig } from "pg";

/**
 * ملف بيئة إضافي اختياري يُمرَّر عبر ENV_FILE (مسار مطلق أو نسبي لجذر المشروع).
 * يُحمَّل أولاً فيفوز على .env الافتراضي (dotenv لا يعيد كتابة متغير موجود).
 * يُستخدم في وضع web-demo فقط؛ في التشغيل العادي لا يوجد ENV_FILE فلا يتغير شيء.
 */
const envFile = process.env.ENV_FILE?.trim();
if (envFile) {
  dotenv.config({
    path: path.isAbsolute(envFile)
      ? envFile
      : path.resolve(process.cwd(), envFile),
  });
}

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

/**
 * هل النظام مهيأ مسبقاً؟
 * - يكون مهيأ إذا تم تمرير DATABASE_URL صريح (عبر config.json في الإنتاج)
 *   أو إذا تم ضبط متغيرات DB_* صراحة (وضع التطوير عبر .env).
 * - على أول تشغيل عند الزبون لا يوجد أي منهما → غير مهيأ → يظهر First Run Wizard.
 */
const hasExplicitDbEnv = Boolean(
  databaseUrl || process.env.DB_HOST || process.env.DB_NAME,
);

// Health checks and startup give up on an unreachable database this soon.
const connectionTimeoutMillis = Number(
  process.env.DB_CONNECTION_TIMEOUT_MS ?? 1500,
);

const appDataDir =
  process.env.APP_DATA_DIR?.trim() || path.resolve(process.cwd(), "data");

/** أصول CORS المسموح بها. الافتراضي هو منفذ Vite في التطوير (نسخة Electron). */
const corsOrigins = (
  process.env.CORS_ORIGINS?.trim() ||
  "http://127.0.0.1:5173,http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  appVersion: process.env.APP_VERSION ?? "0.1.0",
  apiHost: process.env.API_HOST ?? "127.0.0.1",
  apiPort: Number(process.env.API_PORT ?? 34567),
  corsOrigins,
  databaseUrl,
  dbConfigured: hasExplicitDbEnv,
  // مجلد بيانات التطبيق (userData في الإنتاج) لتخزين الصور والنسخ الاحتياطية.
  // كل المسارات تُبنى عبر path.join — آمنة مع أسماء المستخدمين التي تحتوي فراغات.
  appDataDir,
  imagesDir:
    process.env.IMAGES_DIR?.trim() ||
    path.join(appDataDir, "images", "properties"),
  documentsDir:
    process.env.DOCUMENTS_DIR?.trim() || path.join(appDataDir, "documents"),
  backupsDir:
    process.env.BACKUP_DIR?.trim() || path.join(appDataDir, "backups"),
  internalToken: process.env.INTERNAL_TOKEN?.trim() || "",
  db: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? "dalaly",
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    connectionTimeoutMillis,
  },
  // The request pool. Values measured on the dev PC, see docs/PERFORMANCE.md
  // ("Pool, statement timeout and dashboard").
  pool: {
    max: 10,
    // Kept open however long the app sits idle: a new connection costs a
    // SCRAM login and a new backend process (~35 ms here) and its first
    // queries plan with cold caches. Two cover the dashboard's queries.
    min: 2,
    // Connections beyond those two close after this long unused.
    idleTimeoutMillis: 5 * 60_000,
    // How long a request waits for a free connection, or for a new one.
    connectionTimeoutMillis: 5000,
  },
  admin: {
    username: process.env.ADMIN_USERNAME ?? "admin",
    pin: process.env.ADMIN_PIN ?? "1234",
  },
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  remoteAccessEnabled: process.env.REMOTE_ACCESS_ENABLED === "true",
  cloudflaredPath:
    process.env.CLOUDFLARED_PATH ?? "tools/cloudflared/cloudflared.exe",
};

/** Where the database is: a connection string or separate settings. */
export type DatabaseTarget =
  | { connectionString: string }
  | Pick<PoolConfig, "host" | "port" | "database" | "user" | "password">;

/** DATABASE_URL if set, else the separate DB_* variables. */
export function databaseTarget(): DatabaseTarget {
  if (config.databaseUrl) return { connectionString: config.databaseUrl };
  const { host, port, database, user, password } = config.db;
  return { host, port, database, user, password };
}

/**
 * pg.Pool settings for every pool the API opens on its database: the
 * request pool, the one reconfigurePool switches to after setup and the
 * startup pool (which shortens the connect timeout and adds time limits).
 */
export function buildPoolConfig(
  target: DatabaseTarget = databaseTarget(),
): PoolConfig {
  return { ...target, ...config.pool };
}
