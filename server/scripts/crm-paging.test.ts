import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { PERSON_SORT_KEYS } from "../src/modules/people/people.schema.js";
import { RENTAL_REQUEST_SORT_KEYS } from "../src/modules/rental-requests/rental-requests.schema.js";
import { PURCHASE_REQUEST_SORT_KEYS } from "../src/modules/purchase-requests/purchase-requests.schema.js";
import { DOCUMENT_SORT_KEYS } from "../src/modules/documents/documents.schema.js";
import { removalTestContext } from "./removal-test-context.js";

type Row = Record<string, unknown> & { id: number; code: string };
type Page = { items: Row[]; total: number; page: number; page_size: number };
type Value = string | number | null;

// As in list-paging.test.ts, text values differ in their first letter (Arabic
// letters without hamza forms, or ASCII), so code-point order and the
// database collation agree and the expected orders can be computed here.
// Times are hours ago (larger = older); expiry is days from now.
const PEOPLE = [
  { code: "CP-01", full_name: "باسم علي", phone_primary: "07701000001", person_type: "individual", status: "active", created: 1, updated: 9 },
  { code: "CP-02", full_name: "تمارا حسن", phone_primary: null, person_type: "individual", status: "active", created: 2, updated: 2 },
  { code: "CP-03", full_name: "ثامر للتجارة", phone_primary: "07701000003", person_type: "company", status: "inactive", created: 3, updated: 7 },
  { code: "CP-04", full_name: "جواد كاظم", phone_primary: "07801000004", person_type: "individual", status: "active", created: 4, updated: 4 },
  { code: "CP-05", full_name: "حيدر سالم", phone_primary: "07701000005", person_type: "other", status: "archived", created: 5, updated: 1 },
  { code: "CP-06", full_name: "خالد للعقارات", phone_primary: "07901000006", person_type: "company", status: "active", created: 6, updated: 6 },
  { code: "CP-07", full_name: "دعاء ناصر", phone_primary: "07701000007", person_type: "individual", status: "active", created: 7, updated: 3 },
];

const PROPERTIES = [
  { code: "OP-01", name: "بيت الكرادة", owner: "CP-01", status: "available", area: 200, unit: "متر", created: 1 },
  { code: "OP-02", name: "أرض المنصور", owner: "CP-01", status: "archived", area: 1, unit: "دونم", created: 2 },
  { code: "OP-03", name: "شقة زيونة", owner: "CP-04", status: "available", area: 120, unit: "متر", created: 3 },
  { code: "OP-04", name: "فيلا الجادرية", owner: "CP-01", status: "sold", area: 600, unit: "متر", created: 4 },
  { code: "OP-05", name: "محل السعدون", owner: null, status: "available", area: 50, unit: "متر", created: 5 },
  { code: "OP-06", name: "مخزن الدورة", owner: "CP-01", status: "reserved", area: 300, unit: "متر", created: 6 },
];

const RENTALS = [
  { code: "OR-01", name: "إيجار الكرادة", owner: "CP-01", status: "available", created: 1 },
  { code: "OR-02", name: "إيجار المنصور", owner: "CP-01", status: "archived", created: 2 },
  { code: "OR-03", name: "إيجار زيونة", owner: "CP-04", status: "available", created: 3 },
];

const RENTAL_REQUESTS = [
  { code: "RQ-01", person: "CP-02", property_type: "apartment", rent_period: "monthly", budget_max: 500000, district: "كرادة", status: "open", requirements: "قرب مدرسة", created: 1, updated: 5 },
  { code: "RQ-02", person: "CP-01", property_type: "house", rent_period: "annual", budget_max: null, district: "منصور", status: "matched", requirements: null, created: 2, updated: 2 },
  { code: "RQ-03", person: "CP-04", property_type: "shop", rent_period: "monthly", budget_max: 900000, district: null, status: "open", requirements: "واجهة واسعة", created: 3, updated: 8 },
  { code: "RQ-04", person: "CP-06", property_type: "apartment", rent_period: "semi_annual", budget_max: 300000, district: "جادرية", status: "closed", requirements: null, created: 4, updated: 1 },
  { code: "RQ-05", person: "CP-02", property_type: "office", rent_period: null, budget_max: 750000, district: "زيونة", status: "archived", requirements: null, created: 5, updated: 3 },
  { code: "RQ-06", person: "CP-07", property_type: "house", rent_period: "monthly", budget_max: 1200000, district: "دورة", status: "open", requirements: "حديقة", created: 6, updated: 6 },
  { code: "RQ-07", person: "CP-02", property_type: "shop", rent_period: null, budget_max: 500000, district: "كرادة", status: "open", requirements: null, created: 7, updated: 7 },
];

const PURCHASE_REQUESTS = [
  { code: "PQ-01", person: "CP-04", property_type: "بيت", budget_max: 250000000, district: "كرادة", status: "open", created: 1, updated: 4 },
  { code: "PQ-02", person: "CP-01", property_type: "فيلا", budget_max: null, district: "منصور", status: "open", created: 2, updated: 2 },
  { code: "PQ-03", person: "CP-07", property_type: "شقة", budget_max: 120000000, district: null, status: "matched", created: 3, updated: 1 },
  { code: "PQ-04", person: "CP-02", property_type: "بيت", budget_max: 400000000, district: "جادرية", status: "archived", created: 4, updated: 3 },
  { code: "PQ-05", person: "CP-06", property_type: "بيت", budget_max: 250000000, district: "دورة", status: "closed", created: 5, updated: 5 },
];

const DOCUMENT_TYPES = [
  { key: "paging_card", name: "بطاقة الاختبار" },
  { key: "paging_passport", name: "جواز الاختبار" },
];

const DOCUMENTS = [
  { code: "CD-01", person: "CP-01", type: "paging_card", name: "تعريف", number: "N-100", status: "active", expires: -10, uploaded: 1 },
  { code: "CD-02", person: "CP-01", type: "paging_passport", name: "سفر", number: "N-200", status: "active", expires: 30, uploaded: 2 },
  { code: "CD-03", person: "CP-02", type: null, name: "عقد", number: null, status: "active", expires: null, uploaded: 3 },
  { code: "CD-04", person: "CP-04", type: "paging_card", name: "بطاقة قديمة", number: "N-400", status: "archived", expires: -5, uploaded: 4 },
  { code: "CD-05", person: "CP-07", type: "paging_passport", name: "جواز", number: "N-500", status: "active", expires: -1, uploaded: 5 },
  { code: "CD-06", person: "CP-02", type: "paging_card", name: "هوية", number: "N-600", status: "archived", expires: null, uploaded: 6 },
];

const computedStatus = (document: (typeof DOCUMENTS)[number]) =>
  document.status === "active" && document.expires !== null && document.expires < 0 ? "expired" : document.status;

/** Reads every page of a paged list and checks each page's own fields. */
async function readAllPages(get: (url: string) => Promise<Page>, base: string, pageSize: number) {
  const rows: Row[] = [];
  let total = -1;
  for (let page = 1; page < 100; page += 1) {
    const result = await get(`${base}${base.includes("?") ? "&" : "?"}page=${page}&page_size=${pageSize}`);
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

/**
 * Codes in the order a paged list must return them: by `value`, empty values
 * last in both directions, ties in the list's default order.
 */
function expectedCodes<T extends { code: string }>(
  rows: T[],
  value: (row: T) => Value,
  order: "asc" | "desc",
  byDefault: (a: T, b: T) => number,
) {
  return [...rows]
    .sort((a, b) => {
      const [av, bv] = [value(a), value(b)];
      if (av === null || bv === null) return av === bv ? byDefault(a, b) : av === null ? 1 : -1;
      if (av !== bv) return (av < bv ? -1 : 1) * (order === "asc" ? 1 : -1);
      return byDefault(a, b);
    })
    .map((row) => row.code);
}

const codes = (rows: Row[]) => rows.map((row) => row.code);
const byUpdated = (a: { updated: number }, b: { updated: number }) => a.updated - b.updated;
const personName = (code: string) => PEOPLE.find((person) => person.code === code)!.full_name;

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("owner filter and paged people, request and document lists", async (t) => {
  const ctx = await removalTestContext("crmpaging");
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
    await pool.query("DELETE FROM people");
    const personId: Record<string, number> = {};
    for (const person of PEOPLE) {
      const { rows } = await pool.query(
        `INSERT INTO people(code, full_name, phone_primary, person_type, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now() - make_interval(hours => $6), now() - make_interval(hours => $7))
         RETURNING id`,
        [person.code, person.full_name, person.phone_primary, person.person_type, person.status, person.created, person.updated],
      );
      personId[person.code] = Number(rows[0].id);
    }
    const ownerId = (code: string | null) => (code ? personId[code] : null);
    for (const property of PROPERTIES)
      await pool.query(
        `INSERT INTO properties(code, name, property_type, legal_type, area_value, area_unit, pricing_method,
           total_price, owner_name, owner_phone, owner_person_id, status, created_at, updated_at)
         VALUES ($1, $2, 'بيت', 'طابو ملك صرف', $3, $4, 'سعر إجمالي مباشر', 100000000, 'مالك', '07700000000',
           $5, $6, now() - make_interval(hours => $7), now() - make_interval(hours => $7))`,
        [property.code, property.name, property.area, property.unit, ownerId(property.owner), property.status, property.created],
      );
    for (const rental of RENTALS)
      await pool.query(
        `INSERT INTO rentals(code, name, property_type, area_value, area_unit, rent_price, rent_period,
           owner_name, owner_phone, owner_person_id, status, created_at, updated_at)
         VALUES ($1, $2, 'house', 150, 'متر', 500000, 'monthly', 'مالك', '07800000000', $3, $4,
           now() - make_interval(hours => $5), now() - make_interval(hours => $5))`,
        [rental.code, rental.name, ownerId(rental.owner), rental.status, rental.created],
      );
    for (const request of RENTAL_REQUESTS)
      await pool.query(
        `INSERT INTO rental_requests(code, person_id, property_type, rent_period, budget_max, district, status,
           other_requirements, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - make_interval(hours => $9), now() - make_interval(hours => $10))`,
        [request.code, personId[request.person], request.property_type, request.rent_period, request.budget_max,
          request.district, request.status, request.requirements, request.created, request.updated],
      );
    for (const request of PURCHASE_REQUESTS)
      await pool.query(
        `INSERT INTO purchase_requests(code, person_id, property_type, budget_max, district, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() - make_interval(hours => $7), now() - make_interval(hours => $8))`,
        [request.code, personId[request.person], request.property_type, request.budget_max, request.district,
          request.status, request.created, request.updated],
      );
    const typeId: Record<string, number> = {};
    for (const type of DOCUMENT_TYPES) {
      const { rows } = await pool.query("INSERT INTO document_types(key, name) VALUES ($1, $2) RETURNING id", [type.key, type.name]);
      typeId[type.key] = Number(rows[0].id);
    }
    const typeName = (key: string | null) => DOCUMENT_TYPES.find((type) => type.key === key)?.name ?? null;
    for (const document of DOCUMENTS)
      await pool.query(
        `INSERT INTO identity_documents(code, person_id, document_type_id, document_name, document_number, file_path,
           file_type, status, expires_at, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, 'people/test.pdf', 'application/pdf', $6,
           now() + make_interval(days => $7), now() - make_interval(hours => $8))`,
        [document.code, personId[document.person], document.type ? typeId[document.type] : null, document.name,
          document.number, document.status, document.expires, document.uploaded],
      );

    await t.test("owner filter: a person's offers and rentals, archived ones on request", async () => {
      const owner = personId["CP-01"];
      const active = await readAllPages(get, `/properties/paged?owner_person_id=${owner}`, 2);
      assert.deepEqual(codes(active), ["OP-01", "OP-04", "OP-06"], "only CP-01's offers, archived left out");
      const all = await readAllPages(get, `/properties/paged?owner_person_id=${owner}&include_archived=true`, 1);
      assert.deepEqual(codes(all), ["OP-01", "OP-02", "OP-04", "OP-06"]);
      const byArea = await get(`/properties/paged?owner_person_id=${owner}&include_archived=true&sort_by=area&sort_order=desc`);
      assert.deepEqual(codes(byArea.items), ["OP-02", "OP-04", "OP-06", "OP-01"], "1 dunum (2500 m²) first");
      assert.equal(byArea.total, 4);

      const archivedOnly = await get(`/properties/paged?owner_person_id=${owner}&include_archived=true&status=archived`);
      assert.deepEqual(codes(archivedOnly.items), ["OP-02"], "an explicit status still wins");
      const search = await get(`/properties/paged?owner_person_id=${owner}&include_archived=true&q=${encodeURIComponent("المنصور")}`);
      assert.deepEqual(codes(search.items), ["OP-02"], "search stays within the owner's offers");
      const other = await get(`/properties/paged?owner_person_id=${personId["CP-04"]}`);
      assert.deepEqual(codes(other.items), ["OP-03"]);
      const nobody = await get(`/properties/paged?owner_person_id=${personId["CP-07"]}&include_archived=true`);
      assert.deepEqual(nobody, { items: [], total: 0, page: 1, page_size: 10 });

      const withArchived = await get("/properties/paged?include_archived=true");
      assert.equal(withArchived.total, 6, "include_archived without an owner lists every offer");
      const array = await get(`/properties?owner_person_id=${owner}&include_archived=true`);
      assert.deepEqual(codes(array), ["OP-01", "OP-02", "OP-04", "OP-06"], "the array endpoint takes the same filter");

      const rentals = await get(`/rentals/paged?owner_person_id=${owner}`);
      assert.deepEqual(codes(rentals.items), ["OR-01"]);
      const allRentals = await readAllPages(get, `/rentals/paged?owner_person_id=${owner}&include_archived=true`, 1);
      assert.deepEqual(codes(allRentals), ["OR-01", "OR-02"]);
      assert.deepEqual(codes(await get(`/rentals?owner_person_id=${personId["CP-04"]}`)), ["OR-03"]);
    });

    await t.test("people: pages, total, every sort key in both directions, filters", async () => {
      const listed = PEOPLE.filter((person) => person.status !== "archived");
      const first = await get("/people/paged");
      assert.equal(first.total, 6, "archived people are left out by default");
      assert.equal(first.page_size, 10);
      assert.deepEqual(codes(first.items), expectedCodes(listed, (p) => -p.updated, "desc", byUpdated), "latest update first");

      for (const key of PERSON_SORT_KEYS)
        for (const order of ["asc", "desc"] as const) {
          const value = (person: (typeof PEOPLE)[number]): Value =>
            key === "updated_at" ? -person.updated : key === "created_at" ? -person.created : person[key];
          const rows = await readAllPages(get, `/people/paged?sort_by=${key}&sort_order=${order}`, 4);
          assert.deepEqual(codes(rows), expectedCodes(listed, value, order, byUpdated), `${key} ${order}`);
        }

      const beyond = await get("/people/paged?page=9&page_size=2");
      assert.deepEqual(beyond.items, []);
      assert.equal(beyond.total, 6, "a page past the end still reports the total");

      const companies = await readAllPages(get, "/people/paged?person_type=company", 1);
      assert.deepEqual(codes(companies), ["CP-06", "CP-03"]);
      assert.deepEqual(codes((await get("/people/paged?status=archived")).items), ["CP-05"]);
      const phone = await readAllPages(get, "/people/paged?q=0770", 2);
      assert.deepEqual(codes(phone), ["CP-07", "CP-03", "CP-01"], "search by phone, archived still left out");
      const name = await get(`/people/paged?q=${encodeURIComponent("للعقارات")}`);
      assert.deepEqual(codes(name.items), ["CP-06"]);
    });

    await t.test("rental and purchase requests: person names, every sort key, filters", async () => {
      const rentalListed = RENTAL_REQUESTS.filter((request) => request.status !== "archived");
      for (const key of RENTAL_REQUEST_SORT_KEYS)
        for (const order of ["asc", "desc"] as const) {
          const value = (request: (typeof RENTAL_REQUESTS)[number]): Value =>
            key === "updated_at"
              ? -request.updated
              : key === "created_at"
                ? -request.created
                : key === "person_name"
                  ? personName(request.person)
                  : request[key];
          const rows = await readAllPages(get, `/rental-requests/paged?sort_by=${key}&sort_order=${order}`, 3);
          assert.deepEqual(codes(rows), expectedCodes(rentalListed, value, order, byUpdated), `rental ${key} ${order}`);
        }
      const first = await get("/rental-requests/paged?page_size=2");
      assert.equal(first.total, 6);
      assert.equal(first.items[0].code, "RQ-04", "latest update first");
      assert.equal(first.items[0].person_name, personName("CP-06"), "items carry the person's name and code");
      assert.equal(first.items[0].person_code, "CP-06");

      const customer = await readAllPages(get, `/rental-requests/paged?person_id=${personId["CP-02"]}`, 1);
      assert.deepEqual(codes(customer), ["RQ-01", "RQ-07"]);
      const monthly = await get("/rental-requests/paged?rent_period=monthly&property_type=shop");
      assert.deepEqual(codes(monthly.items), ["RQ-03"]);
      assert.deepEqual(codes((await get("/rental-requests/paged?status=archived")).items), ["RQ-05"]);
      assert.deepEqual(codes((await get(`/rental-requests/paged?q=${encodeURIComponent("حديقة")}`)).items), ["RQ-06"]);
      const beyond = await get("/rental-requests/paged?page=5&page_size=3");
      assert.deepEqual(beyond.items, []);
      assert.equal(beyond.total, 6);

      const purchaseListed = PURCHASE_REQUESTS.filter((request) => request.status !== "archived");
      for (const key of PURCHASE_REQUEST_SORT_KEYS)
        for (const order of ["asc", "desc"] as const) {
          const value = (request: (typeof PURCHASE_REQUESTS)[number]): Value =>
            key === "updated_at"
              ? -request.updated
              : key === "created_at"
                ? -request.created
                : key === "person_name"
                  ? personName(request.person)
                  : request[key];
          const rows = await readAllPages(get, `/purchase-requests/paged?sort_by=${key}&sort_order=${order}`, 3);
          assert.deepEqual(codes(rows), expectedCodes(purchaseListed, value, order, byUpdated), `purchase ${key} ${order}`);
        }
      const houses = await readAllPages(get, `/purchase-requests/paged?property_type=${encodeURIComponent("بيت")}`, 1);
      assert.deepEqual(codes(houses), ["PQ-01", "PQ-05"]);
      const purchases = await get(`/purchase-requests/paged?person_id=${personId["CP-02"]}&status=archived`);
      assert.deepEqual(codes(purchases.items), ["PQ-04"]);
      assert.equal(purchases.total, 1);
    });

    await t.test("documents: the computed status is filtered and sorted in SQL", async () => {
      const all = await readAllPages(get, "/documents/paged", 4);
      assert.deepEqual(codes(all), ["CD-01", "CD-02", "CD-03", "CD-04", "CD-05", "CD-06"], "archived ones included, newest first");
      for (const row of all)
        assert.equal(row.computed_status, computedStatus(DOCUMENTS.find((document) => document.code === row.code)!), row.code);
      assert.equal(all[0].person_name, personName("CP-01"));
      assert.equal(all[0].document_type_name, "بطاقة الاختبار");
      assert.equal(all[2].document_type_name, null);

      const expired = await readAllPages(get, "/documents/paged?status=expired", 1);
      assert.deepEqual(codes(expired), ["CD-01", "CD-05"], "active and past their expiry");
      const active = await get("/documents/paged?status=active");
      assert.deepEqual(codes(active.items), ["CD-02", "CD-03"], "no expiry or a future one");
      assert.equal(active.total, 2);
      const archived = await get("/documents/paged?status=archived");
      assert.deepEqual(codes(archived.items), ["CD-04", "CD-06"], "an archived document is archived even when expired");
      const person = await get(`/documents/paged?person_id=${personId["CP-01"]}&status=expired`);
      assert.deepEqual(codes(person.items), ["CD-01"]);
      const passports = await get(`/documents/paged?document_type_id=${typeId.paging_passport}`);
      assert.deepEqual(codes(passports.items), ["CD-02", "CD-05"]);
      const beyond = await get("/documents/paged?status=expired&page=3&page_size=1");
      assert.deepEqual(beyond.items, []);
      assert.equal(beyond.total, 2, "a page past the end counts with the same filter");

      const byUploaded = (a: { uploaded: number }, b: { uploaded: number }) => a.uploaded - b.uploaded;
      for (const key of DOCUMENT_SORT_KEYS)
        for (const order of ["asc", "desc"] as const) {
          const value = (document: (typeof DOCUMENTS)[number]): Value =>
            ({
              uploaded_at: -document.uploaded,
              expires_at: document.expires,
              code: document.code,
              person_name: personName(document.person),
              document_type_name: typeName(document.type),
              document_name: document.name,
              document_number: document.number,
              computed_status: computedStatus(document),
            })[key];
          const rows = await readAllPages(get, `/documents/paged?sort_by=${key}&sort_order=${order}`, 4);
          assert.deepEqual(codes(rows), expectedCodes(DOCUMENTS, value, order, byUploaded), `${key} ${order}`);
        }
    });

    await t.test("bad paging input is a localized 400; anonymous callers get 401", async () => {
      const lists = ["people", "rental-requests", "purchase-requests", "documents"];
      const bad = ["page_size=101", "page=0", "page_size=-5", "sort_by=password", "sort_order=up"];
      const cases = [
        ...lists.flatMap((list) => bad.map((query) => `/${list}/paged?${query}`)),
        "/documents/paged?status=gone",
        "/people/paged?status=deleted",
        "/rental-requests/paged?sort_by=rent_price",
        "/purchase-requests/paged?sort_by=rent_period",
        "/properties/paged?owner_person_id=abc",
        "/properties/paged?owner_person_id=0",
        "/rentals/paged?include_archived=yes",
      ];
      for (const url of cases) {
        const response = await ctx.app.inject({ method: "GET", url: `/api${url}`, headers });
        assert.equal(response.statusCode, 400, `${url}: ${response.body}`);
        const body = response.json();
        assert.equal(body.code, "VALIDATION_ERROR");
        assert.match(body.issues[0].message, /[؀-ۿ]/, "the message is Arabic");
      }
      for (const list of lists) {
        const anonymous = await ctx.app.inject({ method: "GET", url: `/api/${list}/paged` });
        assert.equal(anonymous.statusCode, 401, list);
      }
    });

    await t.test("the full array lists are unchanged for their other callers", async () => {
      const people = await get("/people");
      assert.ok(Array.isArray(people));
      assert.deepEqual(
        codes(people),
        expectedCodes(PEOPLE.filter((person) => person.status !== "archived"), (p) => -p.updated, "desc", byUpdated),
      );
      const person = await get(`/people/${personId["CP-03"]}`);
      assert.equal(person.code, "CP-03", "/:id still resolves next to /paged");

      const rentalRequests = await get(`/rental-requests?person_id=${personId["CP-02"]}`);
      assert.deepEqual(codes(rentalRequests), ["RQ-01", "RQ-07"]);
      assert.equal(rentalRequests[0].person_name, personName("CP-02"));
      const purchaseRequests = await get("/purchase-requests");
      assert.equal(purchaseRequests.length, 4);

      const documents = await get("/documents");
      assert.deepEqual(codes(documents), ["CD-01", "CD-02", "CD-03", "CD-04", "CD-05", "CD-06"]);
      const expired = await get("/documents?status=expired");
      assert.deepEqual(codes(expired), ["CD-01", "CD-05"], "same rows the JavaScript filter returned");
      assert.ok(expired.every((row: Row) => row.computed_status === "expired"));
      assert.deepEqual(codes(await get("/documents?status=active")), ["CD-02", "CD-03"]);
      const requirements = await get(`/documents/people/${personId["CP-01"]}/requirements`);
      assert.deepEqual(codes(requirements.expired), ["CD-01"], "requirements still report the expired document");
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
