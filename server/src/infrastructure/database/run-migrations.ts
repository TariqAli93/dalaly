import fs from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { withMigrationPool } from "./pool.js";
import { bootstrapDefaultAdmin } from "../../modules/auth/auth.service.js";
import { seedSystemRbac } from "../../modules/rbac/rbac.service.js";
import { ensureDefaultChart } from "../../modules/accounting/default-chart.js";
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
  await withMigrationPool(async (startupPool) => {
    const startupDb = drizzle(startupPool, { schema });
    if (options.initialize && (await installationInitialized(startupPool)))
      await markInstallationInitialized(startupPool);
    const client = await startupPool.connect();
    try {
      await client.query("BEGIN");
      // Building an index or rewriting a table may take longer than any
      // request; a migration cut off halfway would keep the app from starting.
      await client.query("SET LOCAL statement_timeout = 0");
      await client.query("SELECT pg_advisory_xact_lock(192822)");
      await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
      await client.query(
        "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)",
      );
      const applied = (
        await client.query(
          "SELECT hash,created_at FROM drizzle.__drizzle_migrations",
        )
      ).rows;
      const latest = Math.max(
        0,
        ...applied.map((row) => Number(row.created_at)),
      );
      const journal = JSON.parse(
        fs.readFileSync(
          path.join(migrationsFolder, "meta/_journal.json"),
          "utf8",
        ),
      );
      const migrations = readMigrationFiles({ migrationsFolder });
      for (let index = 0; index < migrations.length; index++) {
        const migration = migrations[index],
          tag = journal.entries[index].tag;
        const previous = applied.find(
          (row) => Number(row.created_at) === migration.folderMillis,
        );
        if (previous && previous.hash !== migration.hash)
          throw new Error(`ملف هجرة مطبق تغير: ${tag}`);
        if (applied.some((row) => row.hash === migration.hash)) continue;
        if (migration.folderMillis <= latest) continue;
        // Migrations report a skipped optional step (an index that existing
        // data or permissions prevent) with RAISE NOTICE; log it, or nobody sees it.
        const logNotice = (notice: { message?: string }) =>
          console.warn(`Migration ${tag}: ${notice.message}`);
        client.on("notice", logNotice);
        try {
          for (const query of migration.sql)
            if (query.trim()) await client.query(query);
        } finally {
          client.off("notice", logNotice);
        }
        await client.query(
          "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
          [migration.hash, migration.folderMillis],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    if (options.initialize) {
      await seedSystemRbac(startupDb);
      await ensureDefaultChart(startupDb);
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
