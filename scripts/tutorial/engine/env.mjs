// Isolated tutorial environment: its own PostgreSQL database (proved to be the
// studio's by a database comment before anything is dropped), its own Electron
// profile, image/document/backup folders and API port. Nothing here reads or
// writes the development database, the web demo or a real office profile.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  SERVER_DIR,
  createOwnedDirectory,
  portInUse,
  readEnvFile,
  removeOwnedDirectory,
  requireServer,
  run,
} from "./util.mjs";

const pg = requireServer("pg");

const NAME_PATTERN = /^dalaly_tutorial(?:_[a-z0-9]+)*$/;

/** Connection settings from the developer's .env (read only), like the Electron startup test. */
export function databaseCredentials() {
  const local = readEnvFile(path.join(ROOT, ".env"));
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  return {
    host: url?.hostname || process.env.DB_HOST || local.DB_HOST || "127.0.0.1",
    port: Number(url?.port || process.env.DB_PORT || local.DB_PORT || 5432),
    user: url ? decodeURIComponent(url.username) : process.env.DB_USER || local.DB_USER || "postgres",
    password: url ? decodeURIComponent(url.password) : process.env.DB_PASSWORD || local.DB_PASSWORD || "",
    developmentDatabase: local.DB_NAME || "dalaly",
  };
}

/** Throws unless `name` is a tutorial-only database name distinct from every known real one. */
export function assertTutorialDatabaseName(name, credentials) {
  const webDemo = readEnvFile(path.join(ROOT, ".env.web-demo")).DB_NAME || "dalaly_demo";
  const forbidden = new Set(["postgres", "template0", "template1", "dalaly", "codel_dalaly", webDemo, credentials.developmentDatabase]);
  if (!NAME_PATTERN.test(name)) throw new Error(`Tutorial database "${name}" must match ${NAME_PATTERN} (e.g. dalaly_tutorial).`);
  if (forbidden.has(name)) throw new Error(`Tutorial database "${name}" is a development, demo or system database; refusing.`);
}

export function databaseUrl(credentials, name) {
  return `postgres://${encodeURIComponent(credentials.user)}:${encodeURIComponent(credentials.password)}@${credentials.host}:${credentials.port}/${name}`;
}

/** Environment for any server-side process that must see only the tutorial database. */
export function isolatedServerEnv(context, extra = {}) {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => typeof value === "string" && !/^(DB_|DATABASE_URL$|ENV_FILE$|ELECTRON_RUN_AS_NODE$|APP_DATA_DIR$|IMAGES_DIR$|DOCUMENTS_DIR$|BACKUP_DIR$|ADMIN_)/.test(key)),
  );
  const { credentials, databaseName, profileDir } = context;
  return {
    ...base,
    // Every DB_* is set explicitly so dotenv never fills one in from .env.
    DATABASE_URL: databaseUrl(credentials, databaseName),
    DB_HOST: credentials.host,
    DB_PORT: String(credentials.port),
    DB_USER: credentials.user,
    DB_PASSWORD: credentials.password,
    DB_NAME: databaseName,
    APP_DATA_DIR: profileDir,
    IMAGES_DIR: path.join(profileDir, "images", "properties"),
    DOCUMENTS_DIR: path.join(profileDir, "documents"),
    BACKUP_DIR: path.join(profileDir, "backups"),
    REMOTE_ACCESS_ENABLED: "false",
    ...extra,
  };
}

async function withAdmin(credentials, task) {
  const client = new pg.Client({ host: credentials.host, port: credentials.port, user: credentials.user, password: credentials.password, database: "postgres", connectionTimeoutMillis: 4000 });
  await client.connect();
  try {
    return await task(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function withTutorialDatabase(context, task) {
  const { credentials, databaseName } = context;
  const client = new pg.Client({ host: credentials.host, port: credentials.port, user: credentials.user, password: credentials.password, database: databaseName, connectionTimeoutMillis: 4000 });
  await client.connect();
  try {
    const { rows } = await client.query("select current_database() as name");
    if (rows[0].name !== databaseName) throw new Error(`Connected to ${rows[0].name}, expected ${databaseName}`);
    return await task(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Reads the database's ownership comment; null when the database does not exist. */
async function databaseOwnership(admin, name) {
  const { rows } = await admin.query("select shobj_description(oid, 'pg_database') as comment from pg_database where datname = $1", [name]);
  return rows.length ? { exists: true, comment: rows[0].comment ?? "" } : { exists: false, comment: "" };
}

/** Drops and recreates the tutorial database, but only one the studio created. */
async function recreateDatabase(context, log) {
  const { credentials, databaseName, config } = context;
  const marker = config.database.ownerComment;
  await withAdmin(credentials, async (admin) => {
    const before = await databaseOwnership(admin, databaseName);
    if (before.exists && !before.comment.startsWith(marker)) {
      throw new Error(
        `Database "${databaseName}" exists but was not created by Tutorial Studio (comment: "${before.comment}"). ` +
          "Refusing to drop it. Pick another database.name in scripts/tutorial/tutorial.config.json or remove it yourself.",
      );
    }
    if (before.exists) {
      log.info("database.drop", { message: databaseName });
      await admin.query(`drop database "${databaseName}" with (force)`);
    }
    await admin.query(`create database "${databaseName}"`);
    await admin.query(`comment on database "${databaseName}" is '${marker}:${new Date().toISOString()}'`);
    const after = await databaseOwnership(admin, databaseName);
    if (!after.comment.startsWith(marker)) throw new Error("Could not mark the tutorial database as owned");
  });
  log.info("database.created", { message: databaseName });
}

/** Kills Electron/API processes left by an earlier run, identified by our profile path. */
export async function killStaleProcesses(profileDir, log) {
  if (process.platform !== "win32") return;
  const needle = profileDir.replace(/'/g, "''");
  const script = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${needle}') -and $_.ProcessId -ne ${process.pid} -and $_.ProcessId -ne $PID } | Select-Object -ExpandProperty ProcessId`;
  const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]).catch(() => ({ stdout: "" }));
  const pids = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d+$/.test(line));
  for (const pid of pids) {
    await run("taskkill", ["/PID", pid, "/T", "/F"]).catch(() => undefined);
  }
  if (pids.length) log.warn("cleanup.stale-processes", { message: `ended ${pids.length} process(es) from an earlier run` });
}

/** Seeds through the project's own seed script (migrations, RBAC, roles, users, listings, requests). */
async function seed(context, log) {
  const tsxCli = requireServer.resolve("tsx/cli");
  const env = isolatedServerEnv(context, { ADMIN_USERNAME: context.config.account.username, ADMIN_PIN: context.config.account.pin });
  log.info("database.seed", { message: "server/src/infrastructure/database/seed.ts" });
  await run(process.execPath, [tsxCli, "src/infrastructure/database/seed.ts"], { cwd: SERVER_DIR, env, timeoutMs: 5 * 60_000 });
}

// Seed phone numbers look like real Iraqi mobiles. Published videos must not
// show numbers that could belong to someone, so every 07XXXXXXXXX in the
// tutorial database becomes an obvious placeholder 07X0000XXXX.
async function sanitizePhones(client, log) {
  const { rows } = await client.query(`select table_name, column_name, data_type from information_schema.columns
    where table_schema = 'public' and data_type in ('text', 'character varying', 'jsonb', 'json')
      and is_generated = 'NEVER' and column_name !~ '(hash|token|secret|pin|password|path|checksum|sha)'`);
  let changed = 0;
  for (const { table_name: table, column_name: column, data_type: type } of rows) {
    const value = type.startsWith("json") ? `"${column}"::text` : `"${column}"`;
    const replaced = `regexp_replace(${value}, '(07[0-9])[0-9]{4}([0-9]{4})', '\\10000\\2', 'g')`;
    const assigned = type.startsWith("json") ? `${replaced}::${type}` : replaced;
    try {
      const result = await client.query(`update "${table}" set "${column}" = ${assigned} where ${value} ~ '07[0-9]{9}'`);
      changed += result.rowCount ?? 0;
    } catch (error) {
      log.warn("database.sanitize-skip", { message: `${table}.${column}: ${error.message}` });
    }
  }
  log.info("database.sanitized", { message: `${changed} value(s) set to placeholder phone numbers` });
}

const PROPERTY_IMAGES = { بيت: ["house-01.png", "house-02.png"], فيلا: ["villa-01.png", "house-02.png"], أرض: ["land-01.png", "land-02.png"], "أرض سكنية": ["land-02.png", "land-01.png"], "أرض زراعية": ["farm-01.png", "land-01.png"], مزرعة: ["farm-01.png", "land-02.png"] };
const RENTAL_IMAGES = { house: ["house-01.png", "house-02.png"], villa: ["villa-01.png"], apartment: ["house-02.png"], land: ["land-01.png"], agricultural_land: ["farm-01.png"], residential_land: ["land-02.png"] };
const FALLBACK_IMAGES = ["house-01.png", "land-01.png"];

/** Replaces the seed's 1×1 placeholders with the repository's abstract demo images, when present. */
async function linkDemoImages(client, context, log) {
  const source = path.join(ROOT, "source-assets", "demo", "images");
  if (!fs.existsSync(source)) {
    log.warn("images.skipped", { message: "source-assets/demo/images not found; listings keep the seed's placeholder images" });
    return;
  }
  const imagesDir = path.join(context.profileDir, "images", "properties");
  let count = 0;
  for (const [table, ownerColumn, scope, typeMap] of [["property_images", "property_id", "", PROPERTY_IMAGES], ["rental_images", "rental_id", "rentals", RENTAL_IMAGES]]) {
    const owners = table === "property_images" ? "select id, property_type as type from properties order by id" : "select id, property_type as type from rentals order by id";
    await client.query(`delete from ${table}`);
    for (const owner of (await client.query(owners)).rows) {
      const files = typeMap[owner.type] ?? FALLBACK_IMAGES;
      const directory = path.join(imagesDir, scope, String(owner.id));
      fs.rmSync(directory, { recursive: true, force: true });
      fs.mkdirSync(directory, { recursive: true });
      for (const [index, file] of files.entries()) {
        const name = `${crypto.randomUUID()}.png`;
        fs.copyFileSync(path.join(source, file), path.join(directory, name));
        const relative = scope ? `${scope}/${owner.id}/${name}` : `${owner.id}/${name}`;
        await client.query(`insert into ${table} (${ownerColumn}, file_path, original_name, is_primary, sort_order) values ($1, $2, $3, $4, $5)`, [owner.id, relative, file, index === 0, index]);
        count += 1;
      }
    }
  }
  log.info("images.linked", { message: `${count} demo image(s)` });
}

/**
 * Prepares everything the tutorial run needs and returns its description.
 * Fails before touching anything when isolation cannot be established.
 */
export async function prepareEnvironment({ config, workDir, log, reset = true }) {
  const credentials = databaseCredentials();
  const databaseName = config.database.name;
  assertTutorialDatabaseName(databaseName, credentials);
  const profileDir = path.join(workDir, "profile");
  const context = { config, credentials, databaseName, profileDir, workDir, apiPort: config.api.port };

  await withAdmin(credentials, (admin) => admin.query("select 1")).catch((error) => {
    throw new Error(`PostgreSQL is not reachable at ${credentials.host}:${credentials.port} (${error.message}).`);
  });
  if (await portInUse(config.api.port)) throw new Error(`Tutorial API port ${config.api.port} is already in use. Close what uses it or change api.port.`);
  // The built renderer always calls 127.0.0.1:34567; the studio reroutes those
  // requests to the tutorial API. If a real Dalaly API listens there, a request
  // racing the reroute could reach real data, so the run stops instead.
  if (await portInUse(config.api.rendererDefaultPort)) {
    throw new Error(`Port ${config.api.rendererDefaultPort} is in use (a running Dalaly or \`pnpm dev\`?). Close it first so no tutorial request can reach real data.`);
  }

  await killStaleProcesses(profileDir, log);
  if (reset) {
    removeOwnedDirectory(profileDir, workDir);
    createOwnedDirectory(profileDir);
    await recreateDatabase(context, log);
    await seed(context, log);
    await withTutorialDatabase(context, async (client) => {
      await client.query("update users set display_name = $2 where username = $1", [config.account.username, config.account.displayName]);
      await sanitizePhones(client, log);
      await linkDemoImages(client, context, log);
    });
  }
  // The profile's config.json is how a real install finds its database.
  fs.writeFileSync(path.join(profileDir, "config.json"), JSON.stringify({ databaseUrl: databaseUrl(credentials, databaseName) }));
  const counts = await withTutorialDatabase(context, async (client) => {
    const comment = (await client.query("select shobj_description(oid, 'pg_database') as c from pg_database where datname = current_database()")).rows[0].c ?? "";
    if (!comment.startsWith(config.database.ownerComment)) throw new Error("Tutorial database lost its ownership marker");
    const result = await client.query("select (select count(*) from users)::int as users, (select count(*) from properties)::int as properties, (select count(*) from rentals)::int as rentals, (select count(*) from people)::int as people");
    return result.rows[0];
  });
  log.info("environment.ready", { message: `${databaseName} · users ${counts.users} · properties ${counts.properties} · rentals ${counts.rentals} · people ${counts.people}`, counts });
  return { ...context, counts, databaseUrl: databaseUrl(credentials, databaseName) };
}
