import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresError, withUniqueCodeRetry } from "../src/shared/utils/postgres-errors.js";

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

test("an insert is retried only when its own code was taken", async () => {
  let calls = 0;
  const result = await withUniqueCodeRetry("people_code_unique", async () => {
    calls += 1;
    if (calls < 3) throw uniqueViolation("people_code_unique");
    return "inserted";
  });
  assert.equal(result, "inserted");
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(
    withUniqueCodeRetry("people_code_unique", async () => {
      calls += 1;
      throw uniqueViolation("users_username_unique");
    }),
  );
  assert.equal(calls, 1, "other unique violations are not retried");

  calls = 0;
  await assert.rejects(
    withUniqueCodeRetry(
      "people_code_unique",
      async () => {
        calls += 1;
        throw uniqueViolation("people_code_unique");
      },
      4,
    ),
  );
  assert.equal(calls, 4, "gives up after the attempt limit");
});
