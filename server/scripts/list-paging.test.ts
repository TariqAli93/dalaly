import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { PROPERTY_SORT_KEYS } from "../src/modules/properties/properties.schema.js";
import { RENTAL_SORT_KEYS } from "../src/modules/rentals/rentals.schema.js";
import { compareByAreaM2 } from "../../apps/renderer/src/utils/area.js";
import { removalTestContext } from "./removal-test-context.js";

type Row = Record<string, unknown> & { id: number; code: string };
type Page = { items: Row[]; total: number; page: number; page_size: number };

// Text values differ in their first letter (Arabic letters without hamza
// forms, or lowercase ASCII), so code-point order and the database collation
// agree and the expected order can be computed here.
const PROPERTIES = [
  // code, name, type, district, area, unit, price, owner, status, hours ago (created), hours ago (updated)
  ["PG-01", "بستان", "بيت", "بغداد الجديدة", 200, "متر", 150, "باسم", "available", 1, 30],
  ["PG-02", null, "شقة", "تونس", 1, "دونم", 300, "جواد", "available", 2, 2],
  ["PG-03", "ثريا", "بيت", "ثورة", 3000, "متر", 150, "حسن", "reserved", 3, 25],
  ["PG-04", "جنان", "فيلا", null, 0.5, "دونم", 90, "خالد", "available", 4, 4],
  ["PG-05", "حديقة", "بيت", "جادرية", 2500, "متر", 410, "دريد", "sold", 5, 20],
  ["PG-06", "خيمة", "مكتب", "حارثية", 2, "دونم", 75, "ذياب", "available", 6, 6],
  ["PG-07", null, "شقة", "خضراء", 2000, "متر", 300, "رعد", "negotiating", 7, 15],
  ["PG-08", "دار", "بيت", "دورة", 7, "فدان", 220, "زيد", "available", 8, 8],
  ["PG-09", "ذهب", "فيلا", "بغداد الجديدة", 1, "دونم", 500, "سعد", "available", 9, 12],
  ["PG-10", "روضة", "بيت", "تونس", 900, "متر", 60, "شاكر", "archived", 10, 10],
  ["PG-11", "زهرة", "مكتب", "ثورة", 120, "متر", 150, "صادق", "available", 11, 1],
  ["PG-12", "سكن", "شقة", null, 0.25, "دونم", 45, "ضياء", "reserved", 12, 11],
  ["PG-13", "شمس", "بيت", "جادرية", 625, "متر", 80, "طارق", "available", 13, 9],
] as const;

const RENTALS = [
  // code, name, type, district, area, unit, rent, rooms, baths, owner, status, period, hours ago (created), hours ago (updated)
  ["RG-01", "بيت الورد", "house", "بغداد الجديدة", 150, "متر", 750000, 3, 2, "باسم", "available", "monthly", 1, 9],
  ["RG-02", null, "apartment", "تونس", 1, "دونم", 400000, 2, 1, "جواد", "available", "annual", 2, 2],
  ["RG-03", "ثمرة", "shop", "ثورة", 3000, "متر", 400000, null, null, "حسن", "rented", "monthly", 3, 7],
  ["RG-04", "جسر", "house", null, 0.5, "دونم", 1200000, 5, 3, "خالد", "available", "monthly", 4, 4],
  ["RG-05", "حقل", "office", "جادرية", 2500, "متر", 650000, 1, null, "دريد", "archived", "annual", 5, 5],
  ["RG-06", "خليج", "apartment", "حارثية", 80, "متر", 300000, 2, 1, "ذياب", "available", "monthly", 6, 1],
  ["RG-07", "دجلة", "house", "خضراء", 2, "دونم", 750000, 4, 2, "رعد", "reserved", "monthly", 7, 3],
  ["RG-08", "ذرى", "shop", "دورة", 9, "فدان", 500000, null, 1, "زيد", "available", "annual", 8, 8],
] as const;

/** Reads every page of a paged list and checks each page's own fields. */
async function readAllPages(
  get: (url: string) => Promise<Page>,
  base: string,
  pageSize: number,
) {
  const rows: Row[] = [];
  let total = -1;
  for (let page = 1; page < 100; page += 1) {
    const result = await get(`${base}&page=${page}&page_size=${pageSize}`);
    assert.equal(result.page, page);
    assert.equal(result.page_size, pageSize);
    if (total === -1) total = result.total;
    assert.equal(result.total, total, "the total does not change between pages");
    assert.ok(result.items.length <= pageSize);
    if (!result.items.length) break;
    rows.push(...result.items);
  }
  assert.equal(rows.length, total, "the pages hold exactly `total` rows");
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, "no row repeats across pages");
  return rows;
}

const timeOf = (value: unknown) =>
  value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
const isEmpty = (value: unknown) => value === null || value === undefined;

/**
 * The order the paged list must return: the old client-side sorts (a stable
 * sort over the list in its default order, newest first), with empty values
 * last and the area compared in square metres by the renderer's own helper.
 */
function expectedOrder(rows: Row[], key: string, order: "asc" | "desc", numeric: Set<string>) {
  const byNewest = [...rows].sort(
    (a, b) => timeOf(b.created_at) - timeOf(a.created_at) || b.id - a.id,
  );
  if (key === "area")
    return byNewest.sort((a, b) =>
      compareByAreaM2(a as Parameters<typeof compareByAreaM2>[0], b as Parameters<typeof compareByAreaM2>[0], order),
    );
  if (key === "created_at")
    return order === "desc" ? byNewest : byNewest.reverse();
  const value = (row: Row) => {
    const raw = row[key];
    if (isEmpty(raw)) return null;
    if (key === "updated_at") return timeOf(raw);
    return numeric.has(key) ? Number(raw) : String(raw);
  };
  return byNewest.sort((a, b) => {
    const [av, bv] = [value(a), value(b)];
    if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
    const result = av < bv ? -1 : av > bv ? 1 : 0;
    return order === "asc" ? result : -result;
  });
}

const codes = (rows: Row[]) => rows.map((row) => row.code);

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("paged property and rental lists: pages, totals, sorting and filters", async (t) => {
  const ctx = await removalTestContext("paging");
  const headers = { authorization: `Bearer ${ctx.token}` };
  const get = async (url: string) => {
    const response = await ctx.app.inject({ method: "GET", url: `/api${url}`, headers });
    assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
    return response.json();
  };
  try {
    // Only this test's rows, so the expected orders are fully known.
    await pool.query("DELETE FROM properties");
    await pool.query("DELETE FROM rentals");
    for (const [code, name, type, district, area, unit, price, owner, status, created, updated] of PROPERTIES)
      await pool.query(
        `INSERT INTO properties(code, name, property_type, legal_type, area_value, area_unit, pricing_method,
           total_price, owner_name, owner_phone, district, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'طابو ملك صرف', $4, $5, 'سعر إجمالي مباشر', $6, $7, '0770 123 4567', $8, $9,
           now() - make_interval(hours => $10), now() - make_interval(hours => $11))`,
        [code, name, type, area, unit, price * 1_000_000, owner, district, status, created, updated],
      );
    for (const [code, name, type, district, area, unit, rent, rooms, baths, owner, status, period, created, updated] of RENTALS)
      await pool.query(
        `INSERT INTO rentals(code, name, property_type, area_value, area_unit, rent_price, rooms_count,
           bathrooms_count, owner_name, owner_phone, district, status, rent_period, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '0780 765 4321', $10, $11, $12,
           now() - make_interval(hours => $13), now() - make_interval(hours => $14))`,
        [code, name, type, area, unit, rent, rooms, baths, owner, district, status, period, created, updated],
      );
    // Raw columns (no API name fallback), as the database sorts them.
    const rawProperties = (await pool.query("SELECT * FROM properties WHERE status <> 'archived'")).rows.map(
      (row) => ({ ...row, id: Number(row.id) }),
    ) as Row[];
    const rawRentals = (await pool.query("SELECT * FROM rentals WHERE status <> 'archived'")).rows.map(
      (row) => ({ ...row, id: Number(row.id) }),
    ) as Row[];

    await t.test("pages split the list without gaps and carry the total", async () => {
      const rows = await readAllPages(get, "/properties/paged?sort_by=created_at", 5);
      assert.equal(rows.length, 12, "the archived offer is left out by default");
      assert.deepEqual(codes(rows), codes(expectedOrder(rawProperties, "created_at", "desc", new Set())));

      const first = await get("/properties/paged");
      assert.equal(first.page, 1);
      assert.equal(first.page_size, 10, "default page size");
      assert.equal(first.items.length, 10);
      assert.equal(first.total, 12);
      assert.equal(first.items[0].code, "PG-01", "newest first by default");
      assert.equal(first.items[1].name, "properties PG-02", "items keep the list's name fallback");

      const last = await get("/properties/paged?page=3&page_size=5");
      assert.deepEqual(codes(last.items), ["PG-12", "PG-13"]);
      const beyond = await get("/properties/paged?page=9&page_size=5");
      assert.deepEqual(beyond.items, []);
      assert.equal(beyond.total, 12, "a page past the end still reports the total");

      const rentals = await readAllPages(get, "/rentals/paged?sort_order=desc", 3);
      assert.equal(rentals.length, 7);
      assert.equal(rentals[0].code, "RG-01");
    });

    await t.test("every property sort key, both directions, matches the old client-side order", async () => {
      const numeric = new Set(["total_price"]);
      for (const key of PROPERTY_SORT_KEYS)
        for (const order of ["asc", "desc"] as const) {
          const rows = await readAllPages(get, `/properties/paged?sort_by=${key}&sort_order=${order}`, 4);
          assert.deepEqual(codes(rows), codes(expectedOrder(rawProperties, key, order, numeric)), `${key} ${order}`);
        }
    });

    await t.test("every rental sort key, both directions, matches the same rules", async () => {
      const numeric = new Set(["rent_price", "rooms_count", "bathrooms_count"]);
      for (const key of RENTAL_SORT_KEYS)
        for (const order of ["asc", "desc"] as const) {
          const rows = await readAllPages(get, `/rentals/paged?sort_by=${key}&sort_order=${order}`, 3);
          assert.deepEqual(codes(rows), codes(expectedOrder(rawRentals, key, order, numeric)), `${key} ${order}`);
        }
    });

    await t.test("area sorts by square metres, not by the raw number", async () => {
      const desc = await readAllPages(get, "/properties/paged?sort_by=area&sort_order=desc", 5);
      // 2 dunum (5000 m²) > 3000 m > 1 dunum = 2500 m = 1 dunum (equal: lower id first) > 2000 m
      assert.deepEqual(codes(desc).slice(0, 6), ["PG-06", "PG-03", "PG-02", "PG-05", "PG-09", "PG-07"]);
      assert.equal(desc.at(-1)?.code, "PG-08", "an unknown unit has no area and comes last");
      const asc = await readAllPages(get, "/properties/paged?sort_by=area&sort_order=asc", 5);
      assert.deepEqual(codes(asc).slice(0, 4), ["PG-11", "PG-01", "PG-12", "PG-13"]);
      assert.equal(asc.at(-1)?.code, "PG-08", "no area comes last in both directions");
      // Sorted by the raw number, 3000 m would come first here.
      const rentals = await get("/rentals/paged?sort_by=area&sort_order=desc&page_size=3");
      assert.deepEqual(codes(rentals.items), ["RG-07", "RG-03", "RG-02"]);
    });

    await t.test("filters and search combine with paging and the total", async () => {
      const houses = await readAllPages(get, "/properties/paged?property_type=بيت&sort_by=total_price&sort_order=asc", 2);
      assert.deepEqual(codes(houses), ["PG-13", "PG-01", "PG-03", "PG-08", "PG-05"]);

      const search = await readAllPages(get, `/properties/paged?q=${encodeURIComponent("بغداد")}&status=available`, 1);
      assert.deepEqual(codes(search), ["PG-01", "PG-09"]);

      const phone = await get("/properties/paged?q=07701234567&page_size=3&page=2");
      assert.equal(phone.total, 12, "phone search ignores the spaces in the stored number");
      assert.equal(phone.items.length, 3);

      const range = await readAllPages(get, "/properties/paged?area_min=100&area_max=1000&price_max=150000000", 2);
      assert.deepEqual(codes(range).sort(), ["PG-01", "PG-11", "PG-13"]);

      const archived = await get("/properties/paged?status=archived");
      assert.deepEqual(codes(archived.items), ["PG-10"]);
      assert.equal(archived.total, 1);

      const rentals = await readAllPages(get, "/rentals/paged?rent_period=monthly&rooms_count=2&sort_by=rent_price&sort_order=desc", 1);
      assert.deepEqual(codes(rentals), ["RG-04", "RG-01", "RG-07", "RG-06"]);

      const none = await get("/properties/paged?q=zzqx");
      assert.deepEqual(none, { items: [], total: 0, page: 1, page_size: 10 });
    });

    await t.test("favorites_only limits the page to the user's favorites", async () => {
      const [pg03, pg09] = ["PG-03", "PG-09"].map((code) => rawProperties.find((row) => row.code === code)!.id);
      for (const id of [pg03, pg09]) {
        const response = await ctx.app.inject({ method: "POST", url: `/api/favorites/${id}`, headers });
        assert.ok(response.statusCode < 300, response.body);
      }
      const favorites = await get("/properties/paged?favorites_only=true&sort_by=code&sort_order=asc");
      assert.deepEqual(codes(favorites.items), ["PG-03", "PG-09"]);
      assert.equal(favorites.total, 2);
      const notOnly = await get("/properties/paged?favorites_only=false");
      assert.equal(notOnly.total, 12);

      const rg06 = rawRentals.find((row) => row.code === "RG-06")!.id;
      const response = await ctx.app.inject({ method: "POST", url: `/api/rental-favorites/${rg06}`, headers });
      assert.ok(response.statusCode < 300, response.body);
      const rentalFavorites = await get("/rentals/paged?favorites_only=true");
      assert.deepEqual(codes(rentalFavorites.items), ["RG-06"]);
    });

    await t.test("bad paging input is a localized 400", async () => {
      for (const query of ["page_size=101", "page=0", "page_size=-5", "sort_by=password", "sort_order=up", "favorites_only=1"]) {
        for (const list of ["properties", "rentals"]) {
          const response = await ctx.app.inject({ method: "GET", url: `/api/${list}/paged?${query}`, headers });
          assert.equal(response.statusCode, 400, `${list} ${query}: ${response.body}`);
          const body = response.json();
          assert.equal(body.code, "VALIDATION_ERROR");
          assert.match(body.issues[0].message, /[؀-ۿ]/, "the message is Arabic");
        }
      }
      const anonymous = await ctx.app.inject({ method: "GET", url: "/api/properties/paged" });
      assert.equal(anonymous.statusCode, 401);
    });

    await t.test("the full array lists are unchanged for their other callers", async () => {
      const all = await get("/properties");
      assert.ok(Array.isArray(all));
      assert.equal(all.length, 12);
      assert.deepEqual(codes(all), codes(expectedOrder(rawProperties, "created_at", "desc", new Set())));
      const limited = await get("/properties?limit=2&offset=2");
      assert.deepEqual(codes(limited), ["PG-03", "PG-04"]);
      const rentals = await get("/rentals");
      assert.ok(Array.isArray(rentals));
      assert.equal(rentals.length, 7);
      const property = await get(`/properties/${rawProperties[0].id}`);
      assert.equal(property.id, rawProperties[0].id, "/:id still resolves next to /paged");
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
