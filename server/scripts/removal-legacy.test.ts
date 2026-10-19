import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import pg from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { buildPoolConfig, config } from "../src/infrastructure/config.js";
import { pool, reconfigurePool } from "../src/infrastructure/database/pool.js";
import { applyMigrations, runDatabaseMigrations } from "../src/infrastructure/database/run-migrations.js";
import { installationInitialized } from "../src/infrastructure/database/setup-marker.js";
import { getSetupStatus, markMigrationsSucceeded } from "../src/infrastructure/database/health.js";
import { initializeSystem, SetupError } from "../src/modules/setup/setup.service.js";

const migrationsFolder = path.resolve("drizzle");
const artifacts = path.resolve("data/removal-tests", `legacy-${Date.now()}`);
const legacyTables = [
  "contract_templates", "contracts", "contract_parties", "party_snapshots",
  "contract_office_snapshots", "contract_asset_snapshots", "contract_attachments",
  "contract_legal_snapshots", "contract_procedures", "contract_procedure_attachments",
  "legal_reviewers", "legal_formulations", "legal_contract_templates",
  "legal_contract_clauses", "legal_content_events", "legal_task_notifications",
];
const legacyGuards = [
  "protect_issued_contract", "protect_issued_contract_snapshot", "protect_issued_party_snapshot",
];
const cases: Array<Record<string, unknown>> = [];
let lastStamp = 0;

async function fixture(operation: (name: string) => Promise<void>) {
  const stamp = Math.max(Date.now(), lastStamp + 1);
  lastStamp = stamp;
  const name = `dalaly_removal_test_${stamp}_legacy`;
  assert.match(name, /^dalaly_removal_test_\d+_legacy$/);
  const url = config.databaseUrl
    ? new URL(config.databaseUrl)
    : new URL(`postgresql://${encodeURIComponent(config.db.user)}:${encodeURIComponent(config.db.password)}@${config.db.host}:${config.db.port}/${name}`);
  url.pathname = "/postgres";
  const admin = new pg.Pool({ ...buildPoolConfig(), connectionString: url.toString() });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    url.pathname = `/${name}`;
    await reconfigurePool(url.toString());
    assert.equal((await pool.query("SELECT current_database() AS name")).rows[0].name, name);
    const root = path.join(artifacts, name);
    Object.assign(config, {
      appDataDir: root,
      documentsDir: path.join(root, "documents"),
      imagesDir: path.join(root, "images"),
      backupsDir: path.join(root, "backups"),
    });
    await operation(name);
  } finally {
    await pool.end().catch(() => undefined);
    // Cleanup targets only the database created by this fixture, never the source.
    if (created) {
      assert.match(name, /^dalaly_removal_test_\d+_legacy$/);
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    await admin.end();
  }
}

async function tableNames() {
  return (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"))
    .rows.map((row) => row.tablename as string);
}

async function guards() {
  return (await pool.query("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[]) ORDER BY p.proname", [legacyGuards]))
    .rows.map((row) => row.proname as string);
}

async function sharedRows(tables: string[]) {
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    assert.match(table, /^[a-z_]+$/);
    rows[table] = (await pool.query(`SELECT to_jsonb(t) AS row FROM public."${table}" t ORDER BY to_jsonb(t)::text`)).rows;
  }
  return rows;
}

async function recordCase(name: string, operation: () => Promise<Record<string, unknown>>) {
  try {
    cases.push({ name, success: true, ...await operation() });
  } catch (error) {
    cases.push({ name, success: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    await fs.mkdir(artifacts, { recursive: true });
    await fs.writeFile(path.join(artifacts, "legacy-result.json"), JSON.stringify({ success: cases.every(item => item.success), source_modified: false, cases }, null, 2));
  }
}

test("Historical schema retirement and account-loss setup protection", { timeout: 120000 }, async (t) => {
  await t.test("unapproved startup preserves legacy rows; approved retirement removes all sixteen tables and three guards", async () => {
    await recordCase("legacy-retirement", async () => {
      let result: Record<string, unknown> = {};
      await fixture(async (name) => {
        await pool.query(await fs.readFile("scripts/fixtures/legacy-contract-baseline.sql", "utf8"));
        await pool.query(await fs.readFile("scripts/fixtures/legacy-contract-documents.sql", "utf8"));
        const baseline = readMigrationFiles({ migrationsFolder })[0];
        await pool.query("CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)");
        await pool.query("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)", [baseline.hash, baseline.folderMillis]);
        await pool.query("INSERT INTO users(username,pin_hash,display_name) VALUES('legacy_fixture_admin','fixture-hash','مستخدم تاريخي للاختبار')");
        await pool.query("INSERT INTO people(code,full_name,national_id,address) VALUES('LEGACY-PERSON','شخص تاريخي للاختبار','0123456789','بغداد')");
        await pool.query("INSERT INTO properties(code,property_type,legal_type,area_value,area_unit,pricing_method,total_price,owner_name,owner_phone,owner_person_id) SELECT 'LEGACY-PROPERTY','بيت','طابو ملك صرف',150,'متر','total',100000000,full_name,'07700000001',id FROM people");
        await pool.query("INSERT INTO rentals(code,property_type,area_value,area_unit,rent_price,rent_period,owner_name,owner_phone,owner_person_id) SELECT 'LEGACY-RENTAL','بيت',150,'متر',750000,'monthly',full_name,'07700000001',id FROM people");
        await pool.query("INSERT INTO document_types(key,name) VALUES('legacy-fixture-document','مستند اختباري')");
        await pool.query("INSERT INTO identity_documents(code,person_id,document_type_id,document_name,file_path,file_type) SELECT 'LEGACY-ID',p.id,d.id,'هوية اختبارية','fixture/identity.pdf','application/pdf' FROM people p CROSS JOIN document_types d");
        await pool.query("INSERT INTO property_images(property_id,file_path) SELECT id,'fixture/property.png' FROM properties");
        await pool.query("INSERT INTO rental_images(rental_id,file_path) SELECT id,'fixture/rental.png' FROM rentals");
        await pool.query("INSERT INTO contracts(code,contract_type,property_id,amount) SELECT 'LEGACY-CONTRACT','sale',id,100000000 FROM properties");
        await pool.query("INSERT INTO contract_parties(contract_id,person_id,role) SELECT c.id,p.id,'seller' FROM contracts c CROSS JOIN people p");
        await pool.query("INSERT INTO party_snapshots(contract_party_id,full_name) SELECT id,'لقطة تاريخية للاختبار' FROM contract_parties");
        await pool.query("INSERT INTO permissions(key,name,module) VALUES('contracts.manage','صلاحية تاريخية','contracts'),('people.read','قراءة الأشخاص','people')");
        await pool.query("INSERT INTO roles(name) VALUES('legacy-fixture-role'); INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p");
        await pool.query("INSERT INTO app_settings(key,value) VALUES('studio.defaults.sale','{}'),('fixture.shared','{\"keep\":true}')");
        await pool.query("INSERT INTO audit_logs(entity_type,entity_id,action) VALUES('contract',1,'legacy-created'),('person',1,'shared-created')");
        assert.deepEqual((await tableNames()).filter(table => legacyTables.includes(table)).sort(), [...legacyTables].sort());
        assert.deepEqual(await guards(), [...legacyGuards].sort());
        const sharedTables = (await tableNames()).filter(table => !legacyTables.includes(table) && !["permissions", "role_permissions", "app_settings", "audit_logs"].includes(table));
        const before = await sharedRows(sharedTables);
        const beforeLegacy = await sharedRows(legacyTables);
        await applyMigrations(migrationsFolder);
        assert.deepEqual(await sharedRows(legacyTables), beforeLegacy);
        assert.deepEqual(await sharedRows(sharedTables), before);
        assert.deepEqual(await guards(), [...legacyGuards].sort());
        const retirement = readMigrationFiles({ migrationsFolder }).at(-1)!;
        assert.equal((await pool.query("SELECT count(*) AS n FROM drizzle.__drizzle_migrations WHERE hash=$1", [retirement.hash])).rows[0].n, "0");
        await applyMigrations(migrationsFolder, { approvedRetirement: true });
        assert.equal((await tableNames()).filter(table => legacyTables.includes(table)).length, 0);
        assert.deepEqual(await guards(), []);
        assert.deepEqual(await sharedRows(sharedTables), before);
        assert.deepEqual((await pool.query("SELECT key FROM permissions ORDER BY key")).rows, [{ key: "people.read" }]);
        assert.equal((await pool.query("SELECT count(*) AS n FROM role_permissions")).rows[0].n, "1");
        assert.deepEqual((await pool.query("SELECT key FROM app_settings ORDER BY key")).rows, [{ key: "fixture.shared" }]);
        assert.deepEqual((await pool.query("SELECT entity_type FROM audit_logs ORDER BY id")).rows, [{ entity_type: "person" }]);
        assert.equal(await installationInitialized(), true);
        const afterTables = await tableNames();
        await applyMigrations(migrationsFolder);
        assert.deepEqual(await tableNames(), afterTables);
        assert.deepEqual(await sharedRows(sharedTables), before);
        await runDatabaseMigrations(migrationsFolder);
        assert.deepEqual(await tableNames(), afterTables);
        // Full startup seeds the built-in Super Admin role. Existing roles and
        // business records must still match, while that additive seed is allowed.
        const stableTables = sharedTables.filter(table => table !== "roles");
        assert.deepEqual(await sharedRows(stableTables), Object.fromEntries(stableTables.map(table => [table, before[table]])));
        const existingRoles = (await pool.query("SELECT to_jsonb(t) AS row FROM roles t WHERE name='legacy-fixture-role'")).rows;
        assert.deepEqual(existingRoles, before.roles);
        assert.deepEqual(await guards(), []);
        assert.equal((await pool.query("SELECT count(*) AS n FROM drizzle.__drizzle_migrations WHERE hash=$1", [retirement.hash])).rows[0].n, "1");
        result = { database: name, dropped_tables: legacyTables, removed_guards: legacyGuards, shared_tables_unchanged: sharedTables, unapproved_preserved: true, repeat_no_recreation: true };
      });
      return result;
    });
  });

  await t.test("a historical contract alone protects anonymous setup when account and asset tables were lost", async () => {
    await recordCase("legacy-record-only-setup-protection", async () => {
      let result: Record<string, unknown> = {};
      await fixture(async (name) => {
        await pool.query("CREATE TABLE public.contracts(id bigserial PRIMARY KEY,code text NOT NULL); INSERT INTO public.contracts(code) VALUES('ONLY-LEGACY-RECORD')");
        assert.deepEqual(await tableNames(), ["contracts"]);
        await runDatabaseMigrations(migrationsFolder);
        assert.equal((await pool.query("SELECT code FROM contracts")).rows[0].code, "ONLY-LEGACY-RECORD");
        assert.equal((await pool.query("SELECT count(*) AS n FROM users")).rows[0].n, "0");
        assert.equal((await pool.query("SELECT count(*) AS n FROM dalaly_setup_state")).rows[0].n, "1");
        assert.equal(await installationInitialized(), true);
        markMigrationsSucceeded(migrationsFolder);
        const status = await getSetupStatus();
        assert.equal(status.admin_setup_allowed, false);
        await assert.rejects(initializeSystem({
          host: config.db.host, port: config.db.port,
          adminUsername: config.db.user, adminPassword: config.db.password,
          databaseName: name, firstAdminUsername: "forbidden_fixture_admin", firstAdminPin: "1234",
        }), error => error instanceof SetupError && error.statusCode === 409);
        assert.equal((await pool.query("SELECT count(*) AS n FROM users")).rows[0].n, "0");
        await runDatabaseMigrations(migrationsFolder);
        assert.equal((await pool.query("SELECT count(*) AS n FROM dalaly_setup_state")).rows[0].n, "1");
        result = { database: name, contract_preserved: true, marker_preserved: true, anonymous_admin_creation_blocked: true, users_created: 0 };
      });
      return result;
    });
  });
  console.log(JSON.stringify({ artifacts, cases: cases.map(item => ({ name: item.name, success: item.success })) }));
});
