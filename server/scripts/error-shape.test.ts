import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";

// Keep these API tests independent of the developer's database/.env.
Object.assign(process.env, { DATABASE_URL: "", DB_HOST: "", DB_NAME: "" });
const { buildServer } = await import("../src/server.js");
const { DomainError, errorCodeForStatus } = await import("../src/shared/errors.js");
const { booleanField } = await import("../src/shared/validation/fields.js");
const app = await buildServer({ logger: false });

const arabic = /[؀-ۿ]/;

/** Every error body is { code, message } (plus issues for validation), with an Arabic message. */
function assertErrorShape(result: { statusCode: number; json(): unknown }, status: number, code: string) {
  assert.equal(result.statusCode, status);
  const body = result.json() as Record<string, unknown>;
  assert.equal(body.code, code);
  assert.equal(typeof body.message, "string");
  assert.match(body.message as string, arabic);
  const allowed = code === "VALIDATION_ERROR" ? ["code", "message", "issues"] : ["code", "message"];
  assert.deepEqual(Object.keys(body).filter((key) => !allowed.includes(key)), [], JSON.stringify(body));
  return body;
}

test("a DomainError's code defaults to its status", () => {
  assert.equal(new DomainError(404, "غير موجود").code, "NOT_FOUND");
  assert.equal(new DomainError(409, "تعارض").code, "CONFLICT");
  assert.equal(new DomainError(400, "خطأ", "CUSTOM").code, "CUSTOM");
  assert.equal(errorCodeForStatus(418), "BAD_REQUEST");
  assert.equal(errorCodeForStatus(502), "INTERNAL_ERROR");
});

test("booleanField reads the string false as false", () => {
  for (const [input, expected] of [
    [true, true], [false, false], ["true", true], ["false", false], [" FALSE ", false],
    ["1", true], ["0", false], [1, true], [0, false], [null, false],
  ] as const)
    assert.equal(booleanField.parse(input), expected, JSON.stringify(input));
  for (const input of ["yes", "", 2, {}]) assert.equal(booleanField.safeParse(input).success, false, JSON.stringify(input));
});

test("errors answered by hooks and route code share the shape", async () => {
  assertErrorShape(await app.inject({ url: "/api/properties" }), 401, "UNAUTHORIZED");
  assertErrorShape(await app.inject({ method: "POST", url: "/api/setup/recover", payload: {}, remoteAddress: "192.0.2.10" }), 403, "FORBIDDEN");
  const { loginThrottle } = await import("../src/modules/auth/login-throttle.js");
  for (let attempt = 0; attempt < 5; attempt += 1) loginThrottle.recordFailure("login:shape-user");
  assertErrorShape(await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "shape-user", pin: "1234" } }), 429, "TOO_MANY_ATTEMPTS");
  loginThrottle.recordSuccess("login:shape-user");
});

test("validation and Fastify's own client errors share the shape", async () => {
  const invalid = assertErrorShape(await app.inject({ method: "POST", url: "/api/auth/login", payload: {} }), 400, "VALIDATION_ERROR");
  assert.ok(Array.isArray(invalid.issues) && invalid.issues.length > 0);
  for (const issue of invalid.issues as Array<Record<string, unknown>>) {
    assert.equal(typeof issue.field, "string");
    assert.match(String(issue.message), arabic);
  }
  assertErrorShape(await app.inject({ method: "POST", url: "/api/auth/login", payload: "{bad", headers: { "content-type": "application/json" } }), 400, "BAD_REQUEST");
  assertErrorShape(await app.inject({ method: "POST", url: "/api/auth/login", payload: "x", headers: { "content-type": "application/x-unknown" } }), 415, "UNSUPPORTED_MEDIA_TYPE");
});

test("a DomainError thrown below a route reaches the user with its status and message", async () => {
  // A server that hangs up at once: PostgreSQL's client fails immediately.
  const server = net.createServer((socket) => socket.destroy());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as net.AddressInfo;
    const result = await app.inject({
      method: "POST",
      url: "/api/setup/test-postgres",
      payload: { host: "127.0.0.1", port, adminUsername: "postgres", adminPassword: "x", databaseName: "dalaly" },
    });
    const body = assertErrorShape(result, 400, "BAD_REQUEST");
    // Setup deliberately appends PostgreSQL's own reason (setupFailure).
    assert.match(String(body.message), /^تعذر الاتصال بـ PostgreSQL: /);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("an unexpected failure is a generic 500, without the driver's text", async () => {
  // No database is configured, so the login query itself fails.
  const body = assertErrorShape(await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "nobody", pin: "1234" } }), 500, "INTERNAL_ERROR");
  assert.equal(body.message, "حدث خطأ أثناء تنفيذ العملية.");
});

test.after(async () => { await app.close(); });

test("logged query errors keep the SQL and the database error, not the bound values", async () => {
  const { serializeError } = await import("../src/shared/utils/log-errors.js");
  const { DrizzleQueryError } = await import("drizzle-orm/errors");
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "users_username_unique"'), { code: "23505" });
  const error = new DrizzleQueryError("insert into users (username, pin_hash) values ($1, $2)", ["ahmed", "scrypt:salt:hash"], cause);
  const logged = serializeError(error);
  const text = JSON.stringify(logged);
  assert.ok(!text.includes("scrypt:salt:hash"), text);
  assert.ok(!text.includes("ahmed"), text);
  assert.match(String(logged.message), /insert into users/);
  assert.match(String(logged.message), /params: \[redacted\]$/);
  assert.equal((logged.cause as { code: string }).code, "23505");
  assert.equal(serializeError(new Error("plain")).message, "plain");
});
