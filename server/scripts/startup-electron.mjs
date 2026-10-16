// Real Electron + HTTP + PostgreSQL startup regression. All database mutations
// are confined to randomly named databases created by this process.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import net from "node:net";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import { _electron, expect } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const configured = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const credentials = {
  host: configured?.hostname || process.env.DB_HOST || "127.0.0.1",
  port: Number(configured?.port || process.env.DB_PORT || 5432),
  user: configured ? decodeURIComponent(configured.username) : process.env.DB_USER || "postgres",
  password: configured ? decodeURIComponent(configured.password) : process.env.DB_PASSWORD || "",
  database: "postgres", connectionTimeoutMillis: 3000,
};
const admin = new pg.Pool(credentials);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dalaly-startup-"));
const databaseName = `dalaly_startup_${randomUUID().replaceAll("-", "")}`;
let databaseOwned = false;
let electron;
let blocker;
let databaseProxy;
const proxyConnections = new Set();
let launches = 0;
const migrationFixture = path.join(temporary, "migrations");
const incompleteFixture = path.join(temporary, "incomplete-migrations");

function populateMigrations(destination) {
  fs.mkdirSync(destination, { recursive: true });
  const source = path.join(root, "server/drizzle");
  const journalPath = path.join(source, "meta/_journal.json");
  if (fs.existsSync(journalPath)) {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    fs.mkdirSync(path.join(destination, "meta"), { recursive: true });
    fs.copyFileSync(journalPath, path.join(destination, "meta/_journal.json"));
    for (const entry of journal.entries) fs.copyFileSync(path.join(source, `${entry.tag}.sql`), path.join(destination, `${entry.tag}.sql`));
    return;
  }
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "server/drizzle"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  for (const file of files.filter((file) => file.endsWith(".sql") || file.endsWith("_journal.json"))) {
    const target = path.join(destination, path.relative("server/drizzle", file));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, execFileSync("git", ["show", `HEAD:${file}`], { cwd: root }));
  }
  assert.ok(fs.existsSync(path.join(destination, "meta/_journal.json")), "No tracked migration fixture available");
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function databaseUrl(port = credentials.port) {
  return `postgres://${encodeURIComponent(credentials.user)}:${encodeURIComponent(credentials.password)}@${credentials.host}:${port}/${databaseName}`;
}

async function launch({ configuredDatabase = true, dbPort, migrations = migrationFixture, apiPort } = {}) {
  const profile = path.join(temporary, `profile-${++launches}`);
  fs.mkdirSync(profile);
  if (configuredDatabase) fs.writeFileSync(path.join(profile, "config.json"), JSON.stringify({ databaseUrl: databaseUrl(dbPort) }));
  const port = apiPort || await freePort();
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== "ELECTRON_RUN_AS_NODE" && typeof value === "string"));
  electron = await _electron.launch({
    executablePath: path.join(root, "node_modules/electron/dist/electron.exe"),
    args: [path.join(root, "apps/desktop/src/main.js"), `--user-data-dir=${profile}`],
    env: { ...env, DATABASE_URL: "", DB_HOST: "", DB_NAME: "", VITE_DEV_SERVER_URL: "",
      API_HOST: "127.0.0.1", API_PORT: String(port), DRIZZLE_MIGRATIONS_DIR: migrations,
      CORS_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173" },
    timeout: 30000,
  });
  electron.process().stdout?.on("data", () => {});
  electron.process().stderr?.on("data", () => {});
  await electron.context().route("http://127.0.0.1:34567/api/**", async (route) => {
    await route.continue({ url: route.request().url().replace("127.0.0.1:34567", `127.0.0.1:${port}`) });
  });
  return { port, profile };
}

async function mainPage() {
  await expect.poll(() => electron.windows().find((page) => page.url().includes("/index.html")), { timeout: 45000 }).toBeTruthy();
  const page = electron.windows().find((page) => page.url().includes("/index.html"));
  await page.waitForLoadState("load");
  await expect.poll(() => electron.windows().some((page) => page.url().includes("splash.html")), { timeout: 25000 }).toBe(false);
  return page;
}

async function closeApplication() {
  if (electron) { await electron.close(); electron = undefined; }
}

async function health(port) {
  return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(6000) })).json();
}

async function initializeInUi(page) {
  await expect(page.getByText("مرحباً بك في دلالي", { exact: true })).toBeVisible();
  await page.locator(".v-window-item--active").getByRole("button", { name: "التالي", exact: true }).click();
  const inputs = page.locator(".v-window-item--active input");
  await expect(inputs).toHaveCount(5);
  for (const [index, value] of [credentials.host, String(credentials.port), credentials.user, credentials.password, databaseName].entries()) await inputs.nth(index).fill(value);
  await page.locator(".v-window-item--active").getByRole("button", { name: "التالي", exact: true }).click();
  await fillAdminAndSubmit(page);
}

async function fillAdminAndSubmit(page) {
  const inputs = page.locator(".v-window-item--active input");
  await expect(inputs).toHaveCount(2);
  await inputs.nth(0).fill("startup_test_admin");
  await inputs.nth(1).fill("845612");
  await page.locator(".v-window-item--active").getByRole("button", { name: "التالي", exact: true }).click();
  await page.locator(".v-window-item--active").getByRole("button", { name: "إنشاء وتهيئة النظام", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30000 });
  // Result dialog persists the one-time PIN before deterministic login navigation.
  await page.getByRole("button", { name: /تسجيل الدخول/ }).click();
  await expect(page).toHaveURL(/#\/login(?:\?|$)/);
}

async function databaseQuery(sql, params) {
  assert.ok(databaseOwned, "Only mutate the database created by this test");
  const pool = new pg.Pool({ ...credentials, database: databaseName });
  try { return await pool.query(sql, params); } finally { await pool.end(); }
}

try {
  await admin.query("select 1");
  populateMigrations(migrationFixture);
  fs.mkdirSync(incompleteFixture);
  console.log("Using isolated copies of current migrations (HEAD fallback only when migration assets are missing).");

  const first = await launch({ configuredDatabase: false });
  let page = await mainPage();
  await expect(page).toHaveURL(/#\/setup$/);
  assert.equal((await health(first.port)).startup_state, "SETUP_REQUIRED");
  console.log("PASS first launch / no configuration -> Setup, splash closed, real preload IPC");
  // Establish that the generated name did not predate this test. The actual
  // Setup endpoint creates the database; only this reserved test name is cleaned.
  assert.equal((await admin.query("select 1 from pg_database where datname = $1", [databaseName])).rowCount, 0);
  databaseOwned = true;
  await initializeInUi(page);
  assert.equal((await health(first.port)).startup_state, "READY");
  const saved = JSON.parse(fs.readFileSync(path.join(first.profile, "config.json"), "utf8"));
  assert.equal(saved.databaseUrl, databaseUrl());
  await page.getByLabel("اسم المستخدم", { exact: true }).fill("startup_test_admin");
  await page.getByLabel("الرمز السري", { exact: true }).fill("845612");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/#\/$/, { timeout: 15000 });
  console.log("PASS Setup creates schema/admin, persists config, rechecks READY -> Login -> Dashboard");
  await closeApplication();

  const valid = await launch();
  page = await mainPage();
  await expect(page).toHaveURL(/#\/login(?:\?|$)/);
  assert.equal((await health(valid.port)).startup_state, "READY");
  console.log("PASS valid database / restart after Setup -> Login");
  await closeApplication();

  await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  databaseOwned = false;
  const missing = await launch();
  page = await mainPage();
  await expect(page).toHaveURL(/#\/setup$/);
  const deletedHealth = await health(missing.port);
  assert.equal(deletedHealth.database_exists, false);
  assert.equal(deletedHealth.startup_reason, "DATABASE_MISSING");
  console.log("PASS deleted test database / relaunch -> Setup automatically, splash closed");
  await closeApplication();

  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseOwned = true;
  const adminMissing = await launch();
  page = await mainPage();
  await expect(page).toHaveURL(/#\/setup$/);
  assert.equal((await health(adminMissing.port)).startup_reason, "ADMIN_REQUIRED");
  await fillAdminAndSubmit(page);
  console.log("PASS configured fresh database / missing first administrator -> administrator stage -> Login");
  await closeApplication();

  const proxyPort = await freePort();
  const offline = await launch({ dbPort: proxyPort });
  await expect.poll(() => electron.windows().find((page) => page.url().includes("splash.html")), { timeout: 10000 }).toBeTruthy();
  const splash = electron.windows().find((page) => page.url().includes("splash.html"));
  await expect(splash.getByRole("button", { name: "إعادة المحاولة", exact: true })).toBeVisible({ timeout: 15000 });
  const offlineHealth = await health(offline.port);
  assert.equal(offlineHealth.database_exists, null);
  assert.equal(offlineHealth.startup_state, "ERROR");
  await splash.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
  await expect(splash.getByRole("button", { name: "إعادة المحاولة", exact: true })).toBeVisible({ timeout: 15000 });
  console.log("PASS unavailable database server -> connection error and bounded retry, no Setup redirect");
  // Bring back only this test's database endpoint, without stopping the shared
  // PostgreSQL service used by the developer or other applications.
  databaseProxy = net.createServer((incoming) => {
    const outgoing = net.connect(credentials.port, credentials.host);
    for (const socket of [incoming, outgoing]) {
      proxyConnections.add(socket);
      socket.on("close", () => proxyConnections.delete(socket));
      socket.on("error", () => { incoming.destroy(); outgoing.destroy(); });
    }
    incoming.pipe(outgoing); outgoing.pipe(incoming);
  });
  await new Promise((resolve) => databaseProxy.listen(proxyPort, "127.0.0.1", resolve));
  await splash.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
  page = await mainPage();
  await expect(page).toHaveURL(/#\/login(?:\?|$)/);
  assert.equal((await health(offline.port)).startup_state, "READY");
  console.log("PASS database endpoint restored -> retry -> READY -> Login");
  await closeApplication();
  for (const socket of proxyConnections) socket.destroy();
  await new Promise((resolve) => databaseProxy.close(resolve));
  databaseProxy = undefined;

  const incomplete = await launch({ migrations: incompleteFixture });
  page = await mainPage();
  await expect(page.getByRole("button", { name: "استرداد التهيئة", exact: true })).toBeVisible();
  assert.equal((await health(incomplete.port)).startup_reason, "MIGRATIONS_REQUIRED");
  populateMigrations(incompleteFixture);
  await page.getByRole("button", { name: "استرداد التهيئة", exact: true }).click();
  await expect(page).toHaveURL(/#\/login(?:\?|$)/, { timeout: 30000 });
  assert.equal((await databaseQuery("select username from users")).rows[0].username, "startup_test_admin");
  console.log("PASS missing migration assets -> recovery -> Login; existing administrator preserved");
  await closeApplication();

  await databaseQuery("delete from users");
  const removedAdmin = await launch();
  page = await mainPage();
  await expect(page.getByText(/لا يوجد مدير فعال في نظام سبق إعداده/)).toBeVisible();
  assert.equal((await health(removedAdmin.port)).admin_setup_allowed, false);
  const attempt = await page.evaluate(() => window.dalalyConfig.setupRequest({ path: "/auth/setup-admin", body: { username: "intruder", pin: "1234" } }));
  assert.equal(attempt.status, 409);
  const reinitialize = await page.evaluate((input) => window.dalalyConfig.setupRequest({ path: "/setup/initialize", body: input }), {
    host: credentials.host, port: credentials.port, adminUsername: credentials.user, adminPassword: credentials.password,
    databaseName, firstAdminUsername: "intruder", firstAdminPin: "1234",
  });
  assert.equal(reinitialize.status, 409);
  console.log("PASS removed administrator -> recovery message; anonymous administrator recreation rejected");
  await closeApplication();

  await databaseQuery("drop table users cascade");
  const missingUsers = await launch();
  page = await mainPage();
  assert.equal((await health(missingUsers.port)).users_table_exists, false);
  await expect(page.getByRole("button", { name: "استرداد التهيئة", exact: true })).toBeVisible();
  const repair = await page.evaluate(() => window.dalalyConfig.setupRequest({ path: "/setup/recover", body: {} }));
  assert.equal(repair.status, 503, "A dropped applied table needs explicit database restoration, not replaying destructive migrations");
  assert.equal((await databaseQuery("select count(*) from dalaly_setup_state")).rows[0].count, "1");
  console.log("PASS missing users table -> recovery interface; initialized marker/data preserved; no unsafe schema reset");
  await closeApplication();

  blocker = createServer(() => {});
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const blockedPort = blocker.address().port;
  await launch({ apiPort: blockedPort });
  const backendSplash = await electron.firstWindow();
  await expect(backendSplash.getByRole("button", { name: "إعادة المحاولة", exact: true })).toBeVisible({ timeout: 40000 });
  blocker.closeAllConnections();
  await new Promise((resolve) => blocker.close(resolve));
  blocker = undefined;
  await backendSplash.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
  await mainPage();
  console.log("PASS backend never responds -> error within deadline; retry starts backend and opens Setup");
  console.log("All real Electron startup scenarios passed.");
} finally {
  await closeApplication();
  if (blocker) { blocker.closeAllConnections(); await new Promise((resolve) => blocker.close(resolve)); }
  if (databaseProxy) {
    for (const socket of proxyConnections) socket.destroy();
    await new Promise((resolve) => databaseProxy.close(resolve));
  }
  if (databaseOwned) await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
  // Verify the exact generated directory before recursive cleanup.
  const resolved = path.resolve(temporary);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("dalaly-startup-"));
  fs.rmSync(resolved, { recursive: true, force: true });
}
