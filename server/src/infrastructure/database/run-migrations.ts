import fs from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { withStartupPool } from "./pool.js";
import { bootstrapDefaultAdmin } from "../../modules/auth/auth.service.js";
import { seedSystemRbac } from "../../modules/rbac/rbac.service.js";
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
  options: { initialize?: boolean; approvedRetirement?: boolean } = {},
) {
  await withStartupPool(async (startupPool) => {
    const startupDb = drizzle(startupPool, { schema });
    if (options.initialize && (await installationInitialized(startupPool)))
      await markInstallationInitialized(startupPool);
    const client = await startupPool.connect();
    try {
      await client.query("BEGIN");
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
        // Retired creation migrations are immutable historical records, never
        // executed for a fresh install or replayed after the removal receipt.
        if (["0001_contract_studio", "0002_studio_ux"].includes(tag)) continue;
        const retirement = tag === "0003_remove_contract_system";
        if (!retirement && migration.folderMillis <= latest) continue;
        if (retirement) {
          const pending = await client.query(`SELECT
            EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'studio_%' OR tablename IN ('contracts','contract_templates','contract_parties','party_snapshots','contract_office_snapshots','contract_asset_snapshots','contract_attachments','contract_legal_snapshots','contract_procedures','contract_procedure_attachments','legal_reviewers','legal_formulations','legal_contract_templates','legal_contract_clauses','legal_content_events','legal_task_notifications'))) AS tables,
            EXISTS(SELECT 1 FROM permissions WHERE key ~ '^(contracts|contract_templates|legal_content|legal_formulations|formulations|studio)\\.') AS permissions,
            EXISTS(SELECT 1 FROM app_settings WHERE key ~ '^(studio|contracts|contract_templates|legal_content)\\.') AS settings,
            EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('studio_immutable_record','protect_issued_contract','protect_issued_contract_snapshot','protect_issued_party_snapshot')) AS functions,
            EXISTS(SELECT 1 FROM audit_logs WHERE entity_type IN ('contract','contracts','contract_template','contract_templates','studio_contract','studio_template','legal_content','legal_formulation')) AS audit`);
          if (
            !options.approvedRetirement &&
            Object.values(pending.rows[0]).some(Boolean)
          ) {
            // A historical installation may have lost its accounts before the
            // setup marker existed. Preserve that protection during retirement;
            // this is a migration check, not an active model or API dependency.
            if (options.initialize && pending.rows[0].tables) {
              const history = await client.query(
                "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('contracts','studio_contracts')",
              );
              for (const { tablename } of history.rows) {
                const records = await client.query(
                  `SELECT 1 FROM public."${tablename}" LIMIT 1`,
                );
                if (records.rowCount) {
                  await markInstallationInitialized(client);
                  break;
                }
              }
            }
            continue;
          }
          if (options.approvedRetirement)
            await client.query(
              "SELECT set_config('dalaly.approved_module_removal','contracts',true)",
            );
        }
        for (const query of migration.sql)
          if (query.trim()) await client.query(query);
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
