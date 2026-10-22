import assert from "node:assert/strict";
import { test } from "node:test";

// Keep these API tests independent of the developer's database/.env.
Object.assign(process.env, { DATABASE_URL: "", DB_HOST: "", DB_NAME: "" });
const { buildServer } = await import("../src/server.js");
const app = await buildServer({ logger: false });

test("health and setup status are available before database configuration", async () => {
  for (const url of ["/api/health", "/api/setup/status", "/api/auth/setup-status"]) {
    const result = await app.inject({ url });
    assert.equal(result.statusCode, 200);
    assert.equal(result.json().startup_state, "SETUP_REQUIRED");
    assert.equal(result.json().startup_reason, "DATABASE_NOT_CONFIGURED");
  }
});

test("anonymous setup mutations reject remote addresses and untrusted origins", async () => {
  for (const url of ["/api/setup/initialize", "/api/setup/recover", "/api/setup/test-postgres", "/api/auth/setup-admin"]) {
    const remote = await app.inject({ method: "POST", url, payload: {}, remoteAddress: "192.0.2.10" });
    assert.equal(remote.statusCode, 403, url);
    const foreign = await app.inject({ method: "POST", url, payload: {}, headers: { origin: "https://untrusted.example" } });
    assert.equal(foreign.statusCode, 403, url);
    const nullOrigin = await app.inject({ method: "POST", url, payload: {}, headers: { origin: "null" } });
    assert.equal(nullOrigin.statusCode, 403, url);
    // cloudflared connects from 127.0.0.1 but adds forwarding headers.
    for (const header of ["cf-connecting-ip", "x-forwarded-for"]) {
      const tunneled = await app.inject({ method: "POST", url, payload: {}, headers: { [header]: "198.51.100.7" } });
      assert.equal(tunneled.statusCode, 403, `${url} via ${header}`);
    }
  }
});

test("a locked-out account is refused before the PIN is checked", async () => {
  const { loginThrottle } = await import("../src/modules/auth/login-throttle.js");
  for (let attempt = 0; attempt < 5; attempt += 1) loginThrottle.recordFailure("login:locked-user");
  // No database is configured here, so reaching the PIN check would fail with 500.
  const result = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "locked-user", pin: "1234" } });
  assert.equal(result.statusCode, 429);
  assert.equal(result.json().code, "TOO_MANY_ATTEMPTS");
  assert.ok(Number(result.headers["retry-after"]) > 0);
  loginThrottle.recordSuccess("login:locked-user");
});

test("malformed or wrongly typed bodies are client errors, not 500s", async () => {
  const badJson = await app.inject({ method: "POST", url: "/api/auth/login", payload: "{bad", headers: { "content-type": "application/json" } });
  assert.equal(badJson.statusCode, 400);
  assert.equal(badJson.json().code, "BAD_REQUEST");
  const wrongType = await app.inject({ method: "POST", url: "/api/auth/login", payload: "x", headers: { "content-type": "application/x-unknown" } });
  assert.equal(wrongType.statusCode, 415);
  assert.match(wrongType.json().message, /غير مدعوم/);
});

test("database-dependent endpoints still require authentication before setup", async () => {
  assert.equal((await app.inject({ url: "/api/properties" })).statusCode, 401);
});

test("stored image paths cannot escape the images folder", async () => {
  const path = await import("node:path");
  const { config } = await import("../src/infrastructure/config.js");
  const { resolveImageAbsolutePath } = await import("../src/modules/images/images.service.js");
  const root = path.resolve(config.imagesDir);
  assert.equal(resolveImageAbsolutePath("12/photo.png"), path.join(root, "12", "photo.png"));
  assert.equal(resolveImageAbsolutePath("rentals/3/photo.png"), path.join(root, "rentals", "3", "photo.png"));
  for (const escape of ["../../config.json", "rentals/../../x.png", path.resolve(root, "..", "x.png"), ""])
    assert.equal(resolveImageAbsolutePath(escape), null, escape);
});

test.after(async () => { await app.close(); });
