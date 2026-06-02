import dotenv from "dotenv";
import path from "node:path";
import type { PoolConfig } from "pg";

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

const connectionTimeoutMillis = Number(
  process.env.DB_CONNECTION_TIMEOUT_MS ?? 1500,
);

const appDataDir =
  process.env.APP_DATA_DIR?.trim() || path.resolve(process.cwd(), "data");

export const config = {
  appVersion: process.env.APP_VERSION ?? "0.1.0",
  apiHost: process.env.API_HOST ?? "127.0.0.1",
  apiPort: Number(process.env.API_PORT ?? 45678),
  databaseUrl,
  dbConfigured: hasExplicitDbEnv,
  // مجلد بيانات التطبيق (userData في الإنتاج) لتخزين الصور والنسخ الاحتياطية.
  appDataDir,
  imagesDir: path.join(appDataDir, "images", "properties"),
  backupsDir: process.env.BACKUP_DIR?.trim() || path.join(appDataDir, "backups"),
  internalToken: process.env.INTERNAL_TOKEN?.trim() || "",
  db: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? "dalaly",
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    connectionTimeoutMillis,
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

/**
 * يبني إعدادات pg.Pool من DATABASE_URL إن وجد، وإلا من متغيرات DB_* المنفصلة.
 */
export function buildPoolConfig(): PoolConfig {
  if (config.databaseUrl) {
    return {
      connectionString: config.databaseUrl,
      connectionTimeoutMillis,
    };
  }

  return { ...config.db };
}
