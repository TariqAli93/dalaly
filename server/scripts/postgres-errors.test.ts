import assert from "node:assert/strict";
import { test } from "node:test";
import { isPoolTimeout, postgresError } from "../src/shared/utils/postgres-errors.js";

const uniqueViolation = (constraint: string) =>
  Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("duplicate key"), { code: "23505", constraint }) });

test("SQLSTATE is read directly and through Drizzle's cause", () => {
  assert.deepEqual(postgresError({ code: "23503", constraint: "fk" }), { code: "23503", constraint: "fk" });
  assert.deepEqual(postgresError(uniqueViolation("people_code_unique")), { code: "23505", constraint: "people_code_unique" });
  // Fastify and Node error codes are not SQLSTATEs.
  assert.equal(postgresError({ code: "FST_ERR_CTP_BODY_TOO_LARGE" }), null);
  assert.equal(postgresError({ code: "ECONNREFUSED" }), null);
  assert.equal(postgresError(null), null);
});

test("a pool timeout is recognized directly and through Drizzle's cause", () => {
  const queueTimeout = new Error("timeout exceeded when trying to connect");
  assert.equal(isPoolTimeout(queueTimeout), true);
  assert.equal(isPoolTimeout(new Error("Failed query", { cause: queueTimeout })), true);
  assert.equal(isPoolTimeout(new Error("Connection terminated due to connection timeout")), true);
  assert.equal(isPoolTimeout(new Error("canceling statement due to statement timeout")), false);
  assert.equal(isPoolTimeout({ message: "timeout exceeded when trying to connect" }), false);
  assert.equal(isPoolTimeout(null), false);
});
