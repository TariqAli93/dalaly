import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { classifyStartup, type StartupHealth } from "../src/infrastructure/database/startup-state.js";
import { pollApiHealth, withDeadline } from "../../apps/desktop/src/startup.js";
import { isSameDocumentNavigation } from "../../apps/desktop/src/external-links.js";
import { isScheduleDue } from "../../apps/desktop/src/backup-schedule.js";

test("scheduled email backup is due once per day or week after its local time", () => {
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
  const daily = { enabled: true, frequency: "daily", time: "02:30" };
  assert.equal(isScheduleDue(undefined, at(20, 3)), false);
  assert.equal(isScheduleDue({ ...daily, enabled: false }, at(20, 3)), false);
  assert.equal(isScheduleDue(daily, at(20, 2, 29)), false);
  assert.equal(isScheduleDue(daily, at(20, 2, 30)), true);
  assert.equal(isScheduleDue({ ...daily, lastRunAt: at(20, 2, 31).toISOString() }, at(20, 23)), false);
  assert.equal(isScheduleDue({ ...daily, lastRunAt: at(19, 2, 31).toISOString() }, at(20, 3)), true);
  const weekly = { ...daily, frequency: "weekly", lastRunAt: at(14, 2, 30).toISOString() };
  assert.equal(isScheduleDue(weekly, at(20, 3)), false);
  assert.equal(isScheduleDue(weekly, at(21, 2, 30)), true);
  assert.equal(isScheduleDue({ enabled: true }, at(20, 2)), true, "defaults to 02:00 daily");
});

test("Electron allows internal listing navigation and blocks other documents", () => {
  const renderer = "file:///D:/Program%20Files/Dalaly/index.html#/properties";
  assert.equal(isSameDocumentNavigation(renderer, "file:///D:/Program%20Files/Dalaly/index.html#/properties/42"), true);
  assert.equal(isSameDocumentNavigation(renderer, "file:///D:/Program%20Files/Dalaly/other.html"), false);
  assert.equal(isSameDocumentNavigation(renderer, "file:///C:/private.txt"), false);
  assert.equal(isSameDocumentNavigation(renderer, "https://example.com/"), false);
  assert.equal(isSameDocumentNavigation(renderer, "javascript:alert(1)"), false);
  assert.equal(isSameDocumentNavigation("http://127.0.0.1:5173/#/properties", "http://127.0.0.1:5173/#/properties/42"), true);
  assert.equal(isSameDocumentNavigation("http://127.0.0.1:5173/", "http://127.0.0.1:5174/"), false);
});

const ready: StartupHealth = { api_running: true, db_configured: true, db_connected: true,
  database_exists: true, migrations_ok: true, users_table_exists: true, admin_exists: true };

test("startup classification covers first run, deleted database, recovery and valid installation", () => {
  assert.equal(classifyStartup(ready).startup_state, "READY");
  for (const flag of ["db_configured", "database_exists", "migrations_ok", "users_table_exists", "admin_exists"] as const) {
    assert.equal(classifyStartup({ ...ready, [flag]: false }).startup_state, "SETUP_REQUIRED", flag);
  }
  const deleted = { ...ready, db_connected: false, database_exists: false, migrations_ok: false, users_table_exists: false, admin_exists: false };
  assert.equal(classifyStartup(deleted).startup_reason, "DATABASE_MISSING");
  assert.equal(classifyStartup({ ...deleted, database_exists: null }).startup_state, "ERROR");
  assert.equal(classifyStartup({ ...deleted, database_exists: true }).startup_reason, "DATABASE_CONNECTION");
  assert.equal(classifyStartup(ready, true).startup_state, "CHECKING");
  assert.equal(classifyStartup({ ...ready, api_running: false }).startup_state, "ERROR");
});

test("backend delay is polled until a terminal startup state", async () => {
  let count = 0;
  const server = createServer((_req, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true, ...classifyStartup(ready, ++count < 2) }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const result = await pollApiHealth(`http://127.0.0.1:${address.port}`, 2000);
    assert.equal(result.startup_state, "READY");
    assert.equal(count, 2);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("after the first CHECKING the poll waits on the API instead of sleeping", async () => {
  const urls: string[] = [];
  let checkingCalls = 0;
  const server = createServer((request, response) => {
    urls.push(request.url ?? "");
    response.setHeader("Content-Type", "application/json");
    // Without ?wait=1 the database is still being prepared; with it, the API
    // answers once preparation settles (here after 120 ms).
    if (!request.url?.includes("wait=1")) return response.end(JSON.stringify({ ok: true, ...classifyStartup(ready, true) }));
    setTimeout(() => response.end(JSON.stringify({ ok: true, ...classifyStartup(ready, false) })), 120);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const started = Date.now();
    const result = await pollApiHealth(`http://127.0.0.1:${address.port}/api/health`, 2000, () => checkingCalls++);
    assert.equal(result.startup_state, "READY");
    assert.deepEqual(urls, ["/api/health", "/api/health?wait=1"]);
    assert.equal(checkingCalls, 1, "the splash still shows the database stage");
    assert.ok(Date.now() - started < 350, "no retry interval between CHECKING and READY");
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("a backend that never responds and a renderer promise that never resolves are bounded", async () => {
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    await assert.rejects(pollApiHealth(`http://127.0.0.1:${address.port}`, 100), /STARTUP_BACKEND_TIMEOUT/);
    await assert.rejects(withDeadline(new Promise(() => {}), 50, "RENDERER_TIMEOUT"), /RENDERER_TIMEOUT/);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
