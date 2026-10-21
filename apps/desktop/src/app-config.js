import { app } from "electron";
import log from "electron-log/main.js";
import fs from "node:fs";
import path from "node:path";

// ملف الإعدادات المحلي: يخزّن DATABASE_URL بعد First Run Wizard وإعدادات
// النسخ الاحتياطي المجدول. يُحسب المسار عند الاستدعاء لأن main.js قد يغيّر
// مجلد userData (--user-data-dir) بعد تحميل الوحدات.
export function appConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

export function readAppConfig() {
  const configPath = appConfigPath();
  try {
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    log.error("Failed to read app config", error);
    return {};
  }
}

export function writeAppConfig(config) {
  const configPath = appConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}
