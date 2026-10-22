import { app } from "electron";
import log from "electron-log/main.js";
import path from "node:path";
import { readJsonFile, writeJsonFile } from "./json-file.js";

// ملف الإعدادات المحلي: يخزّن DATABASE_URL بعد First Run Wizard وإعدادات
// النسخ الاحتياطي المجدول. يُحسب المسار عند الاستدعاء لأن main.js قد يغيّر
// مجلد userData (--user-data-dir) بعد تحميل الوحدات.
export function appConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

export function readAppConfig() {
  const { value, recoveredFrom, error } = readJsonFile(appConfigPath());
  if (recoveredFrom)
    log.warn("App config unreadable; using backup copy", error);
  else if (error) log.error("Failed to read app config", error);
  return value;
}

export function writeAppConfig(config) {
  writeJsonFile(appConfigPath(), config);
}
