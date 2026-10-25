import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { sql } from "drizzle-orm";
import { db } from "../src/infrastructure/database/db.js";
import { pool } from "../src/infrastructure/database/pool.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import {
  evaluateMatch,
  preferenceMetSql,
  preferenceTotalSql,
  requiredSql,
  type MatchKind,
} from "../src/modules/matching/matching.rules.js";
import { bestOffers, requestMatchSummaries } from "../src/modules/dashboard/dashboard.operations.repository.js";
import { removalTestContext } from "./removal-test-context.js";

// Requests and listings chosen so every criterion is met and missed in each
// of its forms: location by id at each level and by text (case and spaces),
// budget bounds on either side, area with and without a unit, counts the
// listing does not record, and amenities of each JSON type.
const AMENITIES = [
  {},
  { مسبح: true },
  { مسبح: true, حديقة: true },
  { طابق: 2 },
  { مطبخ: false },
  { لون: "أبيض" },
  { مسبح: null, ملاحظة: "" },
];
const OFFER_AMENITIES = [
  {},
  { مسبح: true },
  { مسبح: "نعم", حديقة: 1 },
  { طابق: 2 },
  { مطبخ: false },
  { لون: "أبيض", مسبح: 0 },
  { حديقة: [] },
];

async function locations() {
  const governorate = async (name: string) =>
    Number((await pool.query("INSERT INTO governorates(name) VALUES($1) RETURNING id", [name])).rows[0].id);
  const district = async (governorateId: number, name: string) =>
    Number(
      (await pool.query("INSERT INTO districts(governorate_id, name) VALUES($1, $2) RETURNING id", [governorateId, name]))
        .rows[0].id,
    );
  const neighborhood = async (districtId: number, name: string) =>
    Number(
      (await pool.query("INSERT INTO neighborhoods(district_id, name) VALUES($1, $2) RETURNING id", [districtId, name]))
        .rows[0].id,
    );
  const g1 = await governorate("بغداد-اختبار");
  const g2 = await governorate("البصرة-اختبار");
  const d1 = await district(g1, "الكرادة-اختبار");
  const d2 = await district(g1, "المنصور-اختبار");
  const n1 = await neighborhood(d1, "حي 1");
  const n2 = await neighborhood(d1, "حي 2");
  // Each place: ids of its levels and the names a listing stores.
  return [
    { governorate_id: g1, district_id: d1, neighborhood_id: n1, governorate: "Baghdad", district: "Karrada", neighborhood: "N1" },
    { governorate_id: g1, district_id: d1, neighborhood_id: n2, governorate: "baghdad ", district: "karrada", neighborhood: "n2" },
    { governorate_id: g1, district_id: d2, neighborhood_id: null, governorate: "Baghdad", district: "Mansour", neighborhood: null },
    { governorate_id: g2, district_id: null, neighborhood_id: null, governorate: "Basra", district: null, neighborhood: null },
    { governorate_id: null, district_id: null, neighborhood_id: null, governorate: null, district: null, neighborhood: null },
  ];
}

type Place = Awaited<ReturnType<typeof locations>>[number];

/** What a request asks about its location: nothing, one id level, or one text level. */
function requestedPlace(place: Place, i: number) {
  const none = { governorate_id: null, district_id: null, neighborhood_id: null, governorate: null, district: null, neighborhood: null };
  switch (i % 6) {
    case 0:
      return none;
    case 1:
      return { ...none, governorate_id: place.governorate_id };
    case 2:
      return { ...none, governorate_id: place.governorate_id, district_id: place.district_id };
    case 3:
      return { ...none, neighborhood_id: place.neighborhood_id, district_id: place.district_id };
    case 4:
      return { ...none, governorate: place.governorate ? ` ${place.governorate.toUpperCase()}` : "  " };
    default:
      return { ...none, district: place.district };
  }
}

async function seed(ownerId: number) {
  const places = await locations();
  const people = [];
  for (const [i, status] of ["active", "active", "active", "inactive", "archived"].entries())
    people.push(
      Number(
        (
          await pool.query(
            "INSERT INTO people(code, full_name, phone_primary, status) VALUES($1, $2, $3, $4) RETURNING id",
            [`OPS-C${i}`, `زبون العمليات ${i}`, `07801234${String(i).padStart(3, "0")}`, status],
          )
        ).rows[0].id,
      ),
    );

  const saleTypes = ["بيت", "شقة", "أرض"];
  const rentalTypes = ["house", "apartment", "shop"];
  const periods = ["monthly", "annual", "semi_annual"];
  const statuses = ["available", "available", "available", "reserved", "sold", "rented", "archived"];

  for (let i = 0; i < 28; i += 1) {
    const place = places[i % places.length];
    const common = [
      100 + (i % 5) * 60, // area_value
      i % 4 === 0 ? "دونم" : "متر",
      i % 5 === 0 ? null : 1 + (i % 4), // rooms
      i % 6 === 0 ? null : 1 + (i % 3), // bathrooms
      place.governorate_id,
      place.district_id,
      place.neighborhood_id,
      place.governorate,
      place.district,
      place.neighborhood,
      JSON.stringify(OFFER_AMENITIES[i % OFFER_AMENITIES.length]),
      statuses[i % statuses.length],
    ];
    await pool.query(
      `INSERT INTO properties(code, property_type, legal_type, area_value, area_unit, pricing_method, total_price,
         owner_name, owner_phone, rooms_count, bathrooms_count, governorate_id, district_id, neighborhood_id,
         governorate, district, neighborhood, amenities, status, owner_person_id, updated_at)
       VALUES ($1, $2, 'طابو ملك صرف', $4, $5, 'سعر إجمالي مباشر', $3, 'مالك', '07700000000', $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, now() - make_interval(days => $17))`,
      [`OPS-P${i}`, saleTypes[i % 3], 50_000_000 + i * 10_000_000, ...common, ownerId, i * 3],
    );
    await pool.query(
      `INSERT INTO rentals(code, property_type, rent_price, rent_period, area_value, area_unit, owner_name, owner_phone,
         rooms_count, bathrooms_count, floors_count, governorate_id, district_id, neighborhood_id,
         governorate, district, neighborhood, amenities, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'مؤجر', '07700000000', $7, $8, $18, $9, $10, $11, $12, $13, $14, $15, $16,
         now() - make_interval(days => $17))`,
      [
        `OPS-R${i}`,
        rentalTypes[i % 3],
        300_000 + i * 50_000,
        periods[i % 3],
        ...common,
        i * 3,
        i % 7 === 0 ? null : i % 3,
      ],
    );
  }

  for (let i = 0; i < 30; i += 1) {
    const place = requestedPlace(places[(i * 7) % places.length], i);
    const budget = [
      [null, null],
      [null, 120_000_000],
      [80_000_000, null],
      [90_000_000, 200_000_000],
    ][i % 4];
    const area = [
      [null, null, null],
      [150, null, "متر"],
      [null, 250, null],
      [1, 400, "دونم"],
    ][(i >> 1) % 4];
    const common = [
      area[0],
      area[1],
      area[2],
      i % 3 === 0 ? null : 1 + (i % 4),
      i % 4 === 0 ? null : 1 + (i % 2),
      i % 5 === 0 ? null : i % 3,
      place.governorate_id,
      place.district_id,
      place.neighborhood_id,
      place.governorate,
      place.district,
      place.neighborhood,
      JSON.stringify(AMENITIES[i % AMENITIES.length]),
      i % 9 === 8 ? "closed" : "open",
      people[i % people.length],
    ];
    await pool.query(
      `INSERT INTO purchase_requests(code, property_type, budget_min, budget_max, area_min, area_max, area_unit,
         rooms_count, bathrooms_count, floors_count, governorate_id, district_id, neighborhood_id,
         governorate, district, neighborhood, amenities, status, person_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [`OPS-PQ${i}`, saleTypes[i % 3], budget[0], budget[1], ...common],
    );
    const rentBudget = [
      [null, null],
      [null, 900_000],
      [500_000, null],
      [400_000, 1_200_000],
    ][(i + 1) % 4];
    await pool.query(
      `INSERT INTO rental_requests(code, property_type, rent_period, budget_min, budget_max, area_min, area_max,
         area_unit, rooms_count, bathrooms_count, floors_count, governorate_id, district_id, neighborhood_id,
         governorate, district, neighborhood, amenities, status, person_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [`OPS-RQ${i}`, rentalTypes[i % 3], i % 4 === 0 ? null : periods[i % 3], rentBudget[0], rentBudget[1], ...common],
    );
  }
}

const TABLES = {
  sale: { requests: sql.raw("purchase_requests"), offers: sql.raw("properties"), label: "properties" },
  rental: { requests: sql.raw("rental_requests"), offers: sql.raw("rentals"), label: "rentals" },
} as const;

/** Every request against every listing, judged by the SQL builders. */
async function sqlPairs(kind: MatchKind) {
  const { rows } = await db.execute(sql`SELECT r.id AS request_id, o.id AS offer_id,
      (${requiredSql(kind)}) AS required_met,
      ${preferenceMetSql(kind)} AS preferences_met,
      ${preferenceTotalSql()} AS preferences_total
    FROM ${TABLES[kind].requests} r CROSS JOIN ${TABLES[kind].offers} o`);
  return new Map(rows.map((row) => [`${row.request_id}:${row.offer_id}`, row]));
}

async function rowsOf(table: string) {
  return (await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
}

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("the operational dashboard follows the matching rules and permissions", async (t) => {
  const ctx = await removalTestContext("operations");
  try {
    await seed(ctx.people[0].id);
    const get = (url: string, token = ctx.token) =>
      ctx.app.inject({ url, headers: { authorization: `Bearer ${token}` } });

    for (const kind of ["sale", "rental"] as const) {
      await t.test(`SQL and evaluateMatch agree on every ${kind} pair`, async () => {
        const pairs = await sqlPairs(kind);
        const requests = await rowsOf(kind === "sale" ? "purchase_requests" : "rental_requests");
        const offers = await rowsOf(kind === "sale" ? "properties" : "rentals");
        let met = 0;
        for (const request of requests)
          for (const offer of offers) {
            const expected = evaluateMatch(kind, request, offer);
            const actual = pairs.get(`${request.id}:${offer.id}`)!;
            const where = `${kind} request ${request.code} × ${offer.code}`;
            assert.equal(actual.required_met, expected.required_met, where);
            assert.equal(Number(actual.preferences_met), expected.preferences_met, where);
            assert.equal(Number(actual.preferences_total), expected.preferences_total, where);
            if (expected.required_met) met += 1;
          }
        // The data reaches both outcomes often enough to mean something.
        assert.ok(met > 10 && met < requests.length * offers.length / 2, `${met} full matches`);
      });

      await t.test(`${kind} summaries count full matches of open requests of active customers`, async () => {
        const summaries = await requestMatchSummaries(kind);
        const requests = await pool.query(
          `SELECT r.* FROM ${kind === "sale" ? "purchase_requests" : "rental_requests"} r
           JOIN people p ON p.id = r.person_id WHERE r.status = 'open' AND p.status = 'active'`,
        );
        const offers = (await rowsOf(kind === "sale" ? "properties" : "rentals")).filter(
          (offer) => offer.status === "available",
        );
        assert.equal(summaries.length, requests.rowCount);
        const expectedBest = new Map<number, number>();
        for (const request of requests.rows) {
          const evaluations = offers
            .map((offer) => ({ offer, evaluation: evaluateMatch(kind, request, offer) }))
            .filter((item) => item.evaluation.required_met);
          const summary = summaries.find((item) => item.summary.id === Number(request.id))!;
          assert.equal(summary.summary.match_count, evaluations.length, request.code);
          const best = evaluations.length ? Math.max(...evaluations.map((item) => item.evaluation.preferences_met)) : 0;
          assert.equal(summary.best_preferences_met, best, request.code);
          // The listing shown: most preferences, then most recently updated, then highest id.
          const [first] = evaluations.sort(
            (a, b) =>
              b.evaluation.preferences_met - a.evaluation.preferences_met ||
              new Date(b.offer.updated_at).getTime() - new Date(a.offer.updated_at).getTime() ||
              Number(b.offer.id) - Number(a.offer.id),
          );
          if (first) expectedBest.set(Number(request.id), Number(first.offer.id));
        }
        const chosen = await bestOffers(kind, requests.rows.map((request) => Number(request.id)));
        assert.deepEqual(new Map([...chosen].sort(([a], [b]) => a - b)), new Map([...expectedBest].sort(([a], [b]) => a - b)));
      });
    }

    await t.test("the matching endpoint pages full matches, one row per request", async () => {
      const response = await get("/api/dashboard/matching?kind=all&page_size=50");
      assert.equal(response.statusCode, 200, response.body);
      const body = response.json();
      assert.deepEqual(body.kinds, ["sale", "rental"]);
      for (const kind of ["sale", "rental"]) {
        const counts = body.counts[kind];
        assert.equal(counts.with_matches + counts.without_matches, counts.open_requests);
      }
      assert.equal(body.total, body.counts.sale.with_matches + body.counts.rental.with_matches);
      const keys = new Set(body.items.map((item: { request: { kind: string; id: number } }) => `${item.request.kind}:${item.request.id}`));
      assert.equal(keys.size, body.items.length, "no request twice");
      for (const item of body.items) {
        assert.equal(item.match.required_met, true);
        assert.equal(item.offer.status, "available");
        assert.ok(item.request.match_count >= 1);
        assert.ok(!item.request.person_name.endsWith(" 3") && !item.request.person_name.endsWith(" 4"), "active customers only");
      }
      assert.equal(body.unmatched.total, body.counts.sale.without_matches + body.counts.rental.without_matches);
      for (const request of body.unmatched.items) assert.equal(request.match_count, 0);

      const sale = (await get("/api/dashboard/matching?kind=sale&page_size=3&page=2")).json();
      assert.equal(sale.total, body.counts.sale.with_matches);
      assert.ok(sale.items.length <= 3);
      for (const item of sale.items) assert.equal(item.request.kind, "sale");
      assert.deepEqual(sale.counts, body.counts, "counts ignore the kind and the page");

      const searched = (await get(`/api/dashboard/matching?q=${encodeURIComponent("OPS-PQ1")}`)).json();
      for (const item of searched.items) assert.match(item.request.code, /^OPS-PQ1/);
      for (const customer of searched.customers.items)
        assert.ok(customer.requests.some((request: { code: string }) => request.code.startsWith("OPS-PQ1")));
      const byPhone = (await get("/api/dashboard/matching?q=1234001")).json();
      assert.ok(byPhone.customers.items.length >= 1);
      for (const customer of byPhone.customers.items) assert.equal(customer.person_code, "OPS-C1");
    });

    await t.test("the overview counts appointments, viewings, idle listings and closings", async () => {
      const propertyId = Number((await pool.query("SELECT id FROM properties WHERE code = 'OPS-P1'")).rows[0].id);
      const rentalId = Number((await pool.query("SELECT id FROM rentals WHERE code = 'OPS-R2'")).rows[0].id);
      const today = `(date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad')`;
      // Today, in six days, in eight days (outside), and yesterday (outside).
      for (const [hours, type] of [[1, "phone_call"], [6 * 24 + 1, "meeting"], [8 * 24, "meeting"], [-20, "phone_call"]] as const)
        await pool.query(
          `INSERT INTO property_followups(property_id, type, scheduled_at) VALUES ($1, $2, ${today} + make_interval(hours => $3))`,
          [propertyId, type, hours],
        );
      await pool.query(
        `INSERT INTO rental_followups(rental_id, type, scheduled_at) VALUES ($1, 'meeting', ${today} + interval '2 hours')`,
        [rentalId],
      );
      // Viewings: one with nothing after it, one followed by a call, one 40 days ago.
      const viewing = async (days: number) =>
        Number(
          (
            await pool.query(
              `INSERT INTO property_followups(property_id, type, scheduled_at, created_at)
               VALUES ($1, 'visit', now() - make_interval(days => $2), now() - make_interval(days => $2 + 1)) RETURNING id`,
              [propertyId, days],
            )
          ).rows[0].id,
        );
      const otherProperty = Number((await pool.query("SELECT id FROM properties WHERE code = 'OPS-P2'")).rows[0].id);
      const answered = await viewing(3);
      await pool.query(
        `INSERT INTO property_followups(property_id, type, created_at) VALUES ($1, 'phone_call', now() - interval '1 day')`,
        [propertyId],
      );
      const pending = Number(
        (
          await pool.query(
            `INSERT INTO property_followups(property_id, type, scheduled_at, created_at)
             VALUES ($1, 'visit', now() - interval '2 days', now() - interval '5 days') RETURNING id`,
            [otherProperty],
          )
        ).rows[0].id,
      );
      await viewing(40);
      // A sale closed through an edit 3 days ago, one 50 days ago, and one sold and then reopened.
      await pool.query("UPDATE properties SET status = 'sold' WHERE code IN ('OPS-P7', 'OPS-P8')");
      const closed = async (code: string, days: number, status = "sold") =>
        pool.query(
          `INSERT INTO audit_logs(entity_type, entity_id, action, new_value, created_at)
           SELECT 'property', id, 'status_changed', jsonb_build_object('status', $2::text), now() - make_interval(days => $3)
           FROM properties WHERE code = $1`,
          [code, status, days],
        );
      await closed("OPS-P7", 3);
      await closed("OPS-P8", 50);
      await closed("OPS-P9", 2); // OPS-P9 is not sold now
      await pool.query("UPDATE rentals SET status = 'rented' WHERE code = 'OPS-R9'");
      await pool.query(
        `INSERT INTO audit_logs(entity_type, entity_id, action, old_value, new_value)
         SELECT 'rental', id, 'updated', '{"status":"available"}', '{"status":"rented"}' FROM rentals WHERE code = 'OPS-R9'`,
      );

      const response = await get("/api/dashboard/overview?stale_days=30");
      assert.equal(response.statusCode, 200, response.body);
      const body = response.json();
      assert.equal(body.appointments.today, 2);
      assert.equal(body.appointments.next_days, 3);
      assert.deepEqual(
        body.appointments.items.map((item: { kind: string }) => item.kind).sort(),
        ["rental", "sale", "sale"],
      );
      const viewingIds = body.viewings_without_outcome.items.map((item: { id: number }) => item.id);
      assert.ok(viewingIds.includes(pending), "a viewing with nothing after it");
      assert.ok(!viewingIds.includes(answered), "a viewing followed by a call");
      assert.equal(body.viewings_without_outcome.total, 1);
      assert.equal(body.sale.closed_recently, 1);
      assert.equal(body.rental.closed_recently, 1);
      const saleCounts = (
        await pool.query("SELECT count(*) FILTER (WHERE status = 'available')::int AS available FROM properties")
      ).rows[0];
      assert.equal(body.sale.counts.available, saleCounts.available);

      // Idle: available, not edited and no follow-up in 30 days.
      const idle = (
        await pool.query(
          `SELECT count(*)::int AS n FROM properties l WHERE l.status = 'available' AND l.updated_at < now() - interval '30 days'
             AND NOT EXISTS (SELECT 1 FROM property_followups f WHERE f.property_id = l.id AND f.created_at >= now() - interval '30 days')`,
        )
      ).rows[0].n;
      assert.ok(idle > 0);
      assert.equal(body.stale_listings.sale.total, idle);
      assert.ok(body.stale_listings.sale.items.length <= 5);
      assert.equal((await get("/api/dashboard/overview?stale_days=90")).json().stale_days, 90);
      assert.equal((await get("/api/dashboard/overview?stale_days=7")).statusCode, 400);
    });

    await t.test("each section follows its domain's read permission", async () => {
      async function userWith(username: string, keys: string[]) {
        const role = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
        await pool.query(
          "INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)",
          [role.id, keys],
        );
        const user = (
          await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES($1, $1, $2) RETURNING id", [
            username,
            await hashPin("5678"),
          ])
        ).rows[0];
        await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
        return (await login(username, "5678"))!.token;
      }
      const nothing = await userWith("ops_nothing", []);
      const overview = (await get("/api/dashboard/overview", nothing)).json();
      assert.equal(overview.sale, null);
      assert.equal(overview.rental, null);
      assert.equal(overview.appointments, null);
      assert.equal(overview.viewings_without_outcome, null);
      assert.deepEqual(overview.stale_listings, { sale: null, rental: null });
      const matching = (await get("/api/dashboard/matching", nothing)).json();
      assert.deepEqual(matching.kinds, []);
      assert.deepEqual(matching.counts, { sale: null, rental: null });
      assert.equal(matching.total, 0);
      assert.equal(matching.customers.total, 0);

      const rentalsOnly = await userWith("ops_rentals", ["requests.read", "rentals.read", "rentals.followups.read"]);
      const rentalMatching = (await get("/api/dashboard/matching", rentalsOnly)).json();
      assert.deepEqual(rentalMatching.kinds, ["rental"]);
      assert.equal(rentalMatching.counts.sale, null);
      for (const item of rentalMatching.items) assert.equal(item.request.kind, "rental");
      const rentalOverview = (await get("/api/dashboard/overview", rentalsOnly)).json();
      assert.equal(rentalOverview.sale, null);
      for (const item of rentalOverview.appointments.items) assert.equal(item.kind, "rental");

      const propertiesOnly = await userWith("ops_properties", ["properties.read"]);
      const propertyOverview = (await get("/api/dashboard/overview", propertiesOnly)).json();
      assert.ok(propertyOverview.sale);
      assert.equal(propertyOverview.appointments, null, "follow-ups need followups.read");
      assert.deepEqual((await get("/api/dashboard/matching", propertiesOnly)).json().kinds, [], "matching needs requests.read");
    });

    await t.test("request pages list full matches first, including sparse requests", async () => {
      // A request stating only its type scores 25: listed now because every
      // required criterion is met.
      const request = Number(
        (
          await pool.query(
            "INSERT INTO purchase_requests(code, property_type, person_id) VALUES('OPS-SPARSE', 'بيت', $1) RETURNING id",
            [ctx.people[1].id],
          )
        ).rows[0].id,
      );
      const body = (await get(`/api/matching/purchase-requests/${request}/offers`)).json();
      const available = (
        await pool.query("SELECT count(*)::int AS n FROM properties WHERE status = 'available' AND property_type = 'بيت'")
      ).rows[0].n;
      assert.equal(body.count, available);
      for (const match of body.matches) {
        assert.equal(match.required_met, true);
        assert.equal(match.score, 25);
        assert.ok(match.reasons.every((reason: { required: boolean }) => typeof reason.required === "boolean"));
      }
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
