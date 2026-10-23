import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { commitImport } from "../src/modules/import/import.service.js";
import { MAX_IMPORT_ROWS } from "../src/shared/constants/limits.js";
import { countQueries } from "./query-count.js";
import { removalTestContext } from "./removal-test-context.js";

type Context = Awaited<ReturnType<typeof removalTestContext>>;

const row = (n: number, extra: Record<string, unknown> = {}) => ({
  property_type: "أرض",
  legal_type: "طابو ملك صرف",
  area_value: 300,
  area_unit: "متر",
  pricing_method: "سعر على المتر",
  unit_price: 100000,
  owner_name: `مالك ${n}`,
  owner_phone: `0751${String(n).padStart(7, "0")}`,
  ...extra,
});

async function send(ctx: Context, step: "validate" | "commit", rows: unknown[]) {
  const response = await ctx.app.inject({
    method: "POST",
    url: `/api/import/properties/${step}`,
    payload: { rows },
    headers: { authorization: `Bearer ${ctx.token}` },
  });
  return { status: response.statusCode, body: response.json() };
}

async function counts() {
  const { rows } = await pool.query(
    "SELECT (SELECT count(*) FROM properties)::int AS properties, (SELECT count(*) FROM audit_logs)::int AS audits",
  );
  return rows[0] as { properties: number; audits: number };
}

const arabic = /[؀-ۿ]/;

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("Excel import commits all of its rows or none, and caps the file size", async (t) => {
  const ctx = await removalTestContext("import");
  try {
    await t.test("a commit that fails part-way leaves no rows or audit entries", async () => {
      const before = await counts();
      // numeric(14,2) cannot hold this area: the database refuses row 1150
      // after the rows before it were written.
      const rows = Array.from({ length: 1200 }, (_, index) =>
        row(10_000 + index, index === 1149 ? { area_value: 1e13 } : { plot_number: `F${index}` }),
      );
      const response = await send(ctx, "commit", rows);
      assert.equal(response.status, 400, JSON.stringify(response.body));
      assert.match(response.body.message, /لم يُضف أي عرض/);
      assert.deepEqual(await counts(), before);
      const left = await pool.query("SELECT count(*)::int AS n FROM properties WHERE owner_phone LIKE '0751001%'");
      assert.equal(left.rows[0].n, 0);
    });

    await t.test("files over the row cap are refused by validate and commit", async () => {
      const before = await counts();
      const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => row(20_000 + index));
      for (const step of ["validate", "commit"] as const) {
        const response = await send(ctx, step, rows);
        assert.equal(response.status, 400, step);
        assert.match(response.body.message, new RegExp(String(MAX_IMPORT_ROWS)));
        assert.match(response.body.message, arabic);
      }
      assert.deepEqual(await counts(), before);

      const atCap = await send(ctx, "validate", rows.slice(0, MAX_IMPORT_ROWS));
      assert.equal(atCap.status, 200);
      assert.equal(atCap.body.valid_count, MAX_IMPORT_ROWS);
    });

    await t.test("commit skips the same rows as before and reports why", async () => {
      const { rows: [governorate] } = await pool.query(
        "INSERT INTO governorates(name) VALUES ('ميسان') RETURNING id",
      );
      const existing = await ctx.app.inject({
        method: "POST",
        url: "/api/properties",
        payload: row(1, { owner_name: "مالك سابق", owner_phone: "07519999999", plot_number: "77", governorate_text: "بغداد" }),
        headers: { authorization: `Bearer ${ctx.token}` },
      });
      assert.equal(existing.statusCode, 201, existing.body);
      const firstCode = await pool.query(
        "SELECT coalesce(max(split_part(code, '-', 2)::int), 0) AS n FROM properties WHERE code LIKE 'L-%'",
      );
      const before = await counts();

      const rows = [
        row(101, { plot_number: "10", plot_letter: "أ", governorate_text: "بغداد" }), // 1 inserted
        row(102, { owner_phone: row(101).owner_phone }), // 2 phone already in this file: skipped
        row(103, { owner_name: "" }), // 3 invalid
        row(104, { owner_phone: ctx.property.owner_phone }), // 4 phone already saved: skipped
        row(105, { plot_number: " 10 ", plot_letter: "أ", governorate_text: "بغداد" }), // 5 plot of row 1
        row(106, { plot_number: "77", governorate_text: "بغداد" }), // 6 plot already saved
        row(107, { governorate_id: Number(governorate.id) }), // 7 inserted, name from the list
        row(108, { owner_person_id: ctx.people[0].id }), // 8 inserted, linked owner
        row(109, { owner_person_id: 999_999 }), // 9 owner does not exist
        row(110, { owner_phone: row(105).owner_phone }), // 10 row 5 was not saved: inserted
        row(111, { property_type: "بيت" }), // 11 inserted, H- code
      ];

      const validation = await send(ctx, "validate", rows);
      assert.equal(validation.status, 200);
      assert.equal(validation.body.valid_count, 7);
      assert.deepEqual(validation.body.errors.map((e: { row: number }) => e.row), [3]);
      assert.match(validation.body.errors[0].message, /^owner_name: /);
      assert.deepEqual(validation.body.duplicates, [
        { row: 2, reason: `رقم هاتف مكرر: ${row(101).owner_phone}` },
        { row: 4, reason: `رقم هاتف مكرر: ${ctx.property.owner_phone}` },
        { row: 10, reason: `رقم هاتف مكرر: ${row(105).owner_phone}` },
      ]);

      const commit = await send(ctx, "commit", rows);
      assert.equal(commit.status, 200, JSON.stringify(commit.body));
      assert.equal(commit.body.inserted, 5);
      assert.equal(commit.body.skipped, 6);
      const errors = commit.body.errors as Array<{ row: number; message: string }>;
      assert.deepEqual(errors.map((e) => e.row), [3, 5, 6, 9]);
      // Commit reports a row's schema issues without the field name.
      assert.equal(errors[0].message, validation.body.errors[0].message.replace(/^owner_name: /, ""));
      assert.equal(errors[1].message, "هذه القطعة مسجلة مسبقاً باسم: مالك 101");
      assert.equal(errors[2].message, "هذه القطعة مسجلة مسبقاً باسم: مالك سابق");

      const saved = await pool.query(
        `SELECT owner_name, code, governorate, governorate_id, governorate_text, owner_person_id
         FROM properties WHERE owner_phone LIKE '0751000%' ORDER BY id`,
      );
      const next = Number(firstCode.rows[0].n);
      const code = (offset: number) => `L-${String(next + offset).padStart(4, "0")}`;
      assert.deepEqual(
        saved.rows.map((r) => [r.owner_name, r.code]),
        [
          ["مالك 101", code(1)],
          ["مالك 107", code(2)],
          ["مالك 108", code(3)],
          ["مالك 110", code(4)],
          ["مالك 111", "H-0001"],
        ],
      );
      const byOwner = Object.fromEntries(saved.rows.map((r) => [r.owner_name, r]));
      assert.equal(byOwner["مالك 101"].governorate, "بغداد");
      assert.equal(byOwner["مالك 101"].governorate_text, "بغداد");
      assert.equal(byOwner["مالك 107"].governorate, "ميسان");
      assert.equal(byOwner["مالك 107"].governorate_text, null);
      assert.equal(Number(byOwner["مالك 108"].owner_person_id), ctx.people[0].id);

      const after = await counts();
      assert.equal(after.properties - before.properties, 5);
      const audits = await pool.query(
        `SELECT action, user_id, new_value->>'code' AS code FROM audit_logs
         WHERE entity_type = 'property' AND new_value->>'owner_phone' LIKE '0751000%' ORDER BY id`,
      );
      assert.deepEqual(
        audits.rows.map((r) => [r.action, Number(r.user_id), r.code]),
        [code(1), code(2), code(3), code(4), "H-0001"].map((c) => ["created", ctx.adminId, c]),
      );
      // A missing owner used to surface the driver's "Failed query: insert …" text.
      assert.equal(errors[3].message, "الشخص المحدد كمالك غير موجود.");
    });

    await t.test("the number of statements does not grow with the rows", async () => {
      const commitRows = (from: number, length: number) =>
        Array.from({ length }, (_, index) => row(from + index, { plot_number: `C${from + index}` }));
      // Called directly, not over HTTP, so only the import's own queries count.
      const small = await countQueries(() => commitImport(commitRows(30_000, 20), ctx.adminId));
      const large = await countQueries(() => commitImport(commitRows(31_000, 400), ctx.adminId));
      assert.equal(small.result.inserted, 20);
      assert.equal(large.result.inserted, 400);
      assert.equal(large.queries, small.queries, `${small.queries} for 20 rows, ${large.queries} for 400`);
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
