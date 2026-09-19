/**
 * مصدر واحد لإعدادات وضع web-demo، تستخدمه كل سكربتات العرض والتصوير.
 * لا يمسّ ملف .env الخاص بالتطوير ولا إعدادات نسخة Electron.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SERVER_DIR = path.join(ROOT, "server");
export const RENDERER_DIR = path.join(ROOT, "apps", "renderer");
export const ENV_FILE = path.join(ROOT, ".env.web-demo");

/** يقرأ ملف بيئة بسيط (KEY=VALUE) ويتجاهل التعليقات والأسطر الفارغة. */
export function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    out[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return out;
}

const demoEnv = readEnvFile(ENV_FILE);
// كلمة مرور قاعدة البيانات المحلية تأتي من .env الخاص بالمطوّر فقط.
const localEnv = readEnvFile(path.join(ROOT, ".env"));

export const WEB_DEMO = {
  apiPort: Number(demoEnv.API_PORT ?? 45699),
  apiHost: demoEnv.API_HOST ?? "127.0.0.1",
  webPort: Number(process.env.WEB_DEMO_PORT ?? 5199),
  webHost: "127.0.0.1",
  dbName: demoEnv.DB_NAME ?? "dalaly_demo",
  adminUsername: demoEnv.ADMIN_USERNAME ?? "demo.admin",
  adminPin: demoEnv.ADMIN_PIN ?? "246810",
  db: {
    host: demoEnv.DB_HOST ?? localEnv.DB_HOST ?? "127.0.0.1",
    port: Number(demoEnv.DB_PORT ?? localEnv.DB_PORT ?? 5432),
    user: demoEnv.DB_USER ?? localEnv.DB_USER ?? "postgres",
    password: demoEnv.DB_PASSWORD ?? localEnv.DB_PASSWORD ?? "postgres",
  },
};

export const WEB_DEMO_BASE_URL = `http://${WEB_DEMO.webHost}:${WEB_DEMO.webPort}`;
export const WEB_DEMO_API_URL = `http://${WEB_DEMO.apiHost}:${WEB_DEMO.apiPort}/api`;

/** بيئة تشغيل الخادم في وضع العرض. */
export function serverEnv(extra = {}) {
  return {
    ...process.env,
    ENV_FILE,
    DB_PASSWORD: WEB_DEMO.db.password,
    ...extra,
  };
}
