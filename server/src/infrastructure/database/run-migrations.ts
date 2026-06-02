import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db.js";
import { bootstrapDefaultAdmin } from "../../modules/auth/auth.service.js";
import { seedSystemRbac } from "../../modules/rbac/rbac.service.js";

/**
 * يطبّق هجرات Drizzle فقط (بدون seed أو إنشاء مستخدم).
 * يُستخدم من داخل First Run Wizard حيث يُنشأ المستخدم الأول لاحقاً
 * ببيانات يختارها المستخدم.
 */
export async function applyMigrations(migrationsFolder = getMigrationsFolder()) {
  await migrate(db, { migrationsFolder });
}

/**
 * المسار الكامل المستخدم عند إقلاع الخادم وأمر db:migrate:
 * هجرات + بذر صلاحيات النظام + إنشاء مدير افتراضي إن لزم.
 */
export async function runDatabaseMigrations(migrationsFolder = getMigrationsFolder()) {
  await applyMigrations(migrationsFolder);
  await seedSystemRbac();
  await bootstrapDefaultAdmin();
}

export function getMigrationsFolder() {
  const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
  const resourcesPath =
    typeof electronProcess.resourcesPath === "string" ? electronProcess.resourcesPath : "";
  const candidates = [
    process.env.DRIZZLE_MIGRATIONS_DIR,
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(process.cwd(), "server", "drizzle"),
    resourcesPath ? path.join(resourcesPath, "server", "drizzle") : ""
  ].filter(Boolean) as string[];

  const found = candidates.find((dir) => fs.existsSync(dir));
  if (!found) {
    throw new Error(
      `Drizzle migrations folder not found. Checked: ${candidates.join(", ")}`
    );
  }

  return found;
}
