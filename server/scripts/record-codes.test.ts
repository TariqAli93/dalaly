import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { createPerson } from "../src/modules/people/people.repository.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("simultaneous saves get distinct codes and duplicates are 409s", async (t) => {
  const ctx = await removalTestContext("codes");
  try {
    await t.test("ten people saved at once all get their own code", async () => {
      const created = await Promise.all(
        Array.from({ length: 10 }, (_, index) => createPerson({ full_name: `عميل متزامن ${index}` } as never)),
      );
      const codes = created.map((person) => person.code);
      assert.equal(new Set(codes).size, 10, codes.join(", "));
    });

    await t.test("a duplicate role name is a 409, not a 500", async () => {
      const result = await ctx.app.inject({
        method: "POST",
        url: "/api/roles",
        payload: { name: "Super Admin", permission_ids: [] },
        headers: { authorization: `Bearer ${ctx.token}` },
      });
      assert.equal(result.statusCode, 409, result.body);
      assert.equal(result.json().code, "DUPLICATE_VALUE");
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
