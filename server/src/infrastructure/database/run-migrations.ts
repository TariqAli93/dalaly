import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { withStartupPool } from "./pool.js";
import { bootstrapDefaultAdmin } from "../../modules/auth/auth.service.js";
import { seedSystemRbac } from "../../modules/rbac/rbac.service.js";
import { seedDocumentDefaults } from "../../modules/contracts/document-defaults.js";
import { adoptDocumentBaseline } from "./document-baseline.js";
import {
  ensureSetupMarker,
  installationInitialized,
  markInstallationInitialized,
} from "./setup-marker.js";

/**
 * يطبّق هجرات Drizzle باتصال خاص ذي مهلة محدودة. خيار initialize يبذر
 * الصلاحيات وسجل التهيئة أيضاً، دون إنشاء أي مستخدم.
 */
export async function applyMigrations(
  migrationsFolder = getMigrationsFolder(),
  options: { initialize?: boolean } = {},
) {
  await withStartupPool(async (startupPool) => {
    const startupDb = drizzle(startupPool, { schema });
    await adoptDocumentBaseline(startupPool, migrationsFolder);
    if (options.initialize && (await installationInitialized(startupPool)))
      await markInstallationInitialized(startupPool);
    await migrate(startupDb, { migrationsFolder });
    if (options.initialize) {
      await seedSystemRbac(startupDb);
      await seedDocumentDefaults(startupDb);
      await ensureSetupMarker(startupPool);
    }
  });
}

/**
 * المسار الكامل المستخدم عند إقلاع الخادم وأمر db:migrate:
 * هجرات + بذر صلاحيات النظام. إنشاء المدير الافتراضي محصور بطلب CLI صريح.
 */
export async function runDatabaseMigrations(
  migrationsFolder = getMigrationsFolder(),
  options: { bootstrapAdmin?: boolean } = {},
) {
  await applyMigrations(migrationsFolder, { initialize: true });
  if (options.bootstrapAdmin) {
    await bootstrapDefaultAdmin();
    await markInstallationInitialized();
  }
}

export function getMigrationsFolder() {
  const electronProcess = process as NodeJS.Process & {
    resourcesPath?: string;
  };
  const resourcesPath =
    typeof electronProcess.resourcesPath === "string"
      ? electronProcess.resourcesPath
      : "";
  const configuredFolder = process.env.DRIZZLE_MIGRATIONS_DIR?.trim();
  // An explicit installation directory must not fall back to another migration
  // history from the working directory if its assets are missing.
  const candidates = configuredFolder
    ? [path.resolve(configuredFolder)]
    : [
        ...new Set(
          [
            path.resolve(process.cwd(), "drizzle"),
            path.resolve(process.cwd(), "server", "drizzle"),
            resourcesPath ? path.join(resourcesPath, "server", "drizzle") : "",
          ].filter(Boolean),
        ),
      ];

  const found = candidates.find((dir) =>
    fs.existsSync(path.join(dir, "meta", "_journal.json")),
  );
  if (!found) {
    throw new Error(
      `Drizzle migrations folder not found. Checked: ${candidates.join(", ")}`,
    );
  }

  return found;
}
