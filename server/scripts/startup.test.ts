import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { classifyStartup, type StartupHealth } from "../src/infrastructure/database/startup-state.js";
import { pollApiHealth, withDeadline } from "../../apps/desktop/src/startup.js";

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

test("a backend that never responds and a renderer promise that never resolves are bounded", async () => {
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    await assert.rejects(pollApiHealth(`http://127.0.0.1:${address.port}`, 100), /STARTUP_BACKEND_TIMEOUT/);
    await assert.rejects(withDeadline(new Promise(() => {}), 50, "RENDERER_TIMEOUT"), /RENDERER_TIMEOUT/);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
