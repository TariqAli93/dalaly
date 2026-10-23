import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { getDashboard } from "../src/modules/dashboard/dashboard.repository.js";
import { referenceDashboard } from "./dashboard-reference.js";
import { removalTestContext } from "./removal-test-context.js";

// Month `months` before the current one (Baghdad time), as a timestamptz,
// moved by `seconds`: 0 is the first instant of that month, -1 the last
// second of the month before.
const monthStart = (months: number, seconds: number) =>
  `(date_trunc('month', now() at time zone 'Asia/Baghdad') - make_interval(months => ${months})) at time zone 'Asia/Baghdad' + make_interval(secs => ${seconds})`;

// Counts per value differ, so the "top" lists have no ties: their order
// for equal counts was never defined.
const GOVERNORATES = ["بغداد", "البصرة", "أربيل", "النجف", "كربلاء", "نينوى", "ديالى", "الأنبار"];
const DISTRICTS = ["الكرادة", "المنصور", "زيونة", "الجادرية", "الدورة", "السعدون", "الأعظمية"];
// شقة/أرض and محل/فيلا tie, so the type order falls back to the name.
const TYPES = ["بيت", "بيت", "شقة", "أرض", "بيت", "شقة", "أرض", "محل", "فيلا"];
// "draft" is not a status the dashboard counts by name; it still counts in the total.
const STATUSES = ["available", "reserved", "negotiating", "sold", "rented", "draft", "available"];
const RENT_PERIODS = ["monthly", "annual", "semi_annual", "weekly"];
const RENTAL_STATUSES = ["available", "reserved", "negotiating", "rented", "archived", "draft"];

async function seed(adminId: number) {
  const propertyIds: number[] = [];
  // 36 live offers: governorate i gets 8 − i of them, district i gets 9, 7,
  // 6, 5, 3, 2, 1 (the rest none); created across eight months, some on the
  // first instant of a month and some a second before it.
  const governorateOf = GOVERNORATES.flatMap((name, i) => Array<string>(8 - i).fill(name));
  const districtOf = [9, 7, 6, 5, 3, 2, 1].flatMap((count, i) => Array<string>(count).fill(DISTRICTS[i]));
  for (let i = 0; i < 36; i += 1) {
    const { rows } = await pool.query(
      `INSERT INTO properties(code, name, property_type, legal_type, area_value, area_unit, pricing_method,
         total_price, owner_name, owner_phone, governorate, district, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'طابو ملك صرف', 100, 'متر', 'total', $4, 'مالك', '07700000000', $5, $6, $7,
         ${monthStart(i % 8, i % 3 === 0 ? 0 : i % 3 === 1 ? -1 : 86_400 * (i % 27))},
         now() - make_interval(days => $8))
       RETURNING id`,
      [
        `DS-${String(i).padStart(2, "0")}`,
        `عقار ${i}`,
        TYPES[i % TYPES.length],
        (1_000_000 * (i + 1) + 0.37 * i + (i === 7 ? 987_654_321.25 : 0)).toFixed(2),
        governorateOf[i],
        districtOf[i] ?? null,
        STATUSES[i % STATUSES.length],
        // Two thirds were last touched more than 30 days ago, each on its own day.
        i % 3 === 0 ? 2 : 31 + i,
      ],
    );
    propertyIds.push(Number(rows[0].id));
  }
  // Archived offers count only in the status counts: ten in one governorate,
  // district and type that would otherwise lead their lists.
  for (let i = 0; i < 10; i += 1)
    await pool.query(
      `INSERT INTO properties(code, name, property_type, legal_type, area_value, area_unit, pricing_method,
         total_price, owner_name, owner_phone, governorate, district, status, created_at, updated_at)
       VALUES ($1, 'مؤرشف', 'مزرعة', 'طابو ملك صرف', 100, 'متر', 'total', 999999999, 'مالك', '07700000000', 'دهوك', 'زاخو',
         'archived', ${monthStart(i % 6, 3600)}, now() - interval '90 days')`,
      [`DA-${i}`],
    );

  for (let i = 0; i < 18; i += 1)
    await pool.query(
      `INSERT INTO rentals(code, name, property_type, rent_price, rent_period, area_value, area_unit, owner_name,
         owner_phone, governorate, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 100, 'متر', 'مالك', '07700000000', 'بغداد', $6,
         ${monthStart(i % 7, i % 2 === 0 ? 0 : -1)})`,
      [
        `DR-${String(i).padStart(2, "0")}`,
        `إيجار ${i}`,
        ["شقة", "بيت", "محل", "شقة", "مكتب", "بيت"][i % 6],
        (250_000 * (i + 1) + 0.5 * i).toFixed(2),
        RENT_PERIODS[i % RENT_PERIODS.length],
        RENTAL_STATUSES[i % RENTAL_STATUSES.length],
      ],
    );

  // 30 property audit rows (only the newest 20 are shown; pairs share a
  // time, so the id breaks the tie), some by no or an unknown user and some
  // for a deleted property, plus rows for other entities.
  for (let i = 0; i < 30; i += 1)
    await pool.query(
      `INSERT INTO audit_logs(entity_type, entity_id, action, user_id, created_at)
       VALUES ('property', $1, $2, $3, now() - make_interval(mins => $4))`,
      [
        i % 7 === 0 ? 987_654 : propertyIds[i % propertyIds.length],
        ["create", "update", "delete"][i % 3],
        i % 5 === 0 ? null : i % 5 === 1 ? 987_654 : adminId,
        Math.floor(i / 2),
      ],
    );
  for (let i = 0; i < 5; i += 1)
    await pool.query(
      `INSERT INTO audit_logs(entity_type, entity_id, action, user_id) VALUES ('rental', $1, 'update', $2)`,
      [i + 1, adminId],
    );

  for (let i = 0; i < 6; i += 1)
    await pool.query(
      `INSERT INTO property_followups(property_id, type, notes, scheduled_at)
       VALUES ($1, 'call', $2, ${i === 5 ? "null" : `now() + make_interval(hours => ${i * 7 - 30})`})`,
      [propertyIds[i], `متابعة ${i}`],
    );
}

const ACCESS = [false, true].flatMap((rentals) =>
  [false, true].flatMap((audit) => [false, true].map((followups) => ({ rentals, audit, followups }))),
);

async function assertSameAsReference() {
  for (const access of ACCESS) {
    const expected = await referenceDashboard(access);
    const actual = await getDashboard(access);
    assert.deepStrictEqual(actual, expected, JSON.stringify(access));
    // The same JSON, keys in the same order.
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), JSON.stringify(access));
  }
}

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("the dashboard summary is the same as before its queries were merged", async (t) => {
  const ctx = await removalTestContext("dashboard");
  try {
    await t.test("with only the fixture's offer and rental", assertSameAsReference);

    await seed(ctx.adminId);
    await t.test("with offers, rentals, activity and reminders", async () => {
      await assertSameAsReference();
      // The data reaches the cases the comparison is meant to cover.
      const summary = await referenceDashboard({ rentals: true, audit: true, followups: true });
      assert.equal(summary.counts.total, 47);
      assert.equal(summary.counts.archived, 10);
      assert.equal(summary.top_governorates.length, 6);
      assert.ok(!summary.top_governorates.some((row) => row.name === "دهوك"));
      assert.ok(!summary.sales.by_type.some((row) => row.name === "مزرعة"));
      assert.equal(summary.needs_review.length, 15);
      assert.equal(summary.recent_activity.length, 20);
      assert.ok(summary.recent_activity.some((row) => row.user_name === null));
      assert.ok(summary.recent_activity.some((row) => row.property_code === null));
      assert.equal(summary.sales.monthly_activity.length, 6);
      assert.ok(summary.rentals.counts.archived > 0);
      assert.ok(summary.reminders.length > 0);
    });

    await t.test("through the route, for an administrator", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: "/api/dashboard/summary",
        headers: { authorization: `Bearer ${ctx.token}` },
      });
      assert.equal(response.statusCode, 200, response.body);
      const expected = await referenceDashboard({ rentals: true, audit: true, followups: true });
      assert.equal(response.body, JSON.stringify(expected));
    });
  } finally {
    await ctx.close();
  }
});
