import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { createPerson } from "../src/modules/people/people.repository.js";
import { createRental } from "../src/modules/rentals/rentals.repository.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("simultaneous saves get distinct codes and duplicates are 409s", async (t) => {
  const ctx = await removalTestContext("codes");
  try {
    await t.test("25 people saved at once all get their own consecutive code", async () => {
      const created = await Promise.all(
        Array.from({ length: 25 }, (_, index) => createPerson({ full_name: `عميل متزامن ${index}` } as never)),
      );
      const numbers = created.map((person) => Number(String(person.code).split("-")[1])).sort((a, b) => a - b);
      assert.equal(new Set(numbers).size, 25, numbers.join(", "));
      assert.equal(numbers[24] - numbers[0], 24, "allocation is serialized, so codes are consecutive");
    });

    await t.test("simultaneous rentals also get distinct codes", async () => {
      const created = await Promise.all(
        Array.from({ length: 15 }, (_, index) =>
          createRental({
            name: `إيجار متزامن ${index}`,
            property_type: "بيت",
            rent_price: 500000,
            rent_period: "monthly",
            area_value: 120,
            area_unit: "متر",
            owner_name: "مالك",
            owner_phone: "07700000000",
          } as never),
        ),
      );
      assert.equal(new Set(created.map((rental) => rental.code)).size, 15);
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
