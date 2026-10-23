import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { pool } from "../src/infrastructure/database/pool.js";
import { STATUS_LABELS, STATUSES } from "../src/shared/constants/domain.js";
import { removalTestContext } from "./removal-test-context.js";

// The search as it was before search_text (properties.repository.ts and
// rentals.repository.ts up to 0003_search_text), kept here as the reference:
// per token, an ILIKE over each of these columns, the numbers as text, for
// properties the owner phone's digits and the Arabic status labels. Its only
// change is that a token's LIKE wildcards are escaped.
const OLD_PROPERTY_COLUMNS = [
  "code", "name", "property_type", "legal_type", "pricing_method", "governorate",
  "governorate_text", "city", "district", "district_text", "neighborhood",
  "neighborhood_text", "address_details", "owner_name", "owner_phone", "owner_notes",
  "notes", "nazal", "plot_number", "plot_letter", "subdistrict_number",
  "subdistrict_name", "mahalla", "alley", "house_number", "nearest_landmark",
  "frontage", "street_width",
];
const OLD_PROPERTY_NUMBERS = ["area_value", "unit_price", "total_price"];
const OLD_RENTAL_COLUMNS = [
  "code", "name", "property_type", "rent_period", "area_unit", "governorate",
  "district", "neighborhood", "address_details", "owner_name", "owner_phone",
  "owner_notes", "other_details", "notes",
];
const OLD_RENTAL_NUMBERS = ["rent_price", "area_value"];

const escapeLike = (token: string) => token.replace(/[\\%_]/g, (c) => `\\${c}`);

async function referenceIds(table: "properties" | "rentals", search: string) {
  const property = table === "properties";
  const params: unknown[] = [];
  const param = (value: unknown) => `$${params.push(value)}`;
  const clauses = search
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const like = param(`%${escapeLike(token)}%`);
      const parts = [
        ...(property ? OLD_PROPERTY_COLUMNS : OLD_RENTAL_COLUMNS).map((c) => `"${c}" ILIKE ${like}`),
        ...(property ? OLD_PROPERTY_NUMBERS : OLD_RENTAL_NUMBERS).map((c) => `cast("${c}" as text) ILIKE ${like}`),
      ];
      if (property) {
        const digits = token.replace(/\D/g, "");
        if (digits)
          parts.push(`regexp_replace(coalesce(owner_phone, ''), '[^0-9]', '', 'g') ILIKE ${param(`%${digits}%`)}`);
        const statuses = STATUSES.filter((status) => {
          const label = STATUS_LABELS[status] ?? "";
          return label.includes(token) || token.includes(label);
        });
        if (statuses.length) parts.push(`status = ANY(${param(statuses)})`);
      }
      return `(${parts.join(" OR ")})`;
    });
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT id FROM ${table} ${where} ORDER BY id`, params);
  return rows.map((row) => Number(row.id));
}

/** Deterministic pseudo-random numbers, so a failure reproduces. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const random = seeded(20261024);
const pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)];
const maybe = <T>(values: readonly T[], chance = 0.5) => (random() < chance ? pick(values) : null);

// Values the office types: Arabic with and without hamza or taa marbuta,
// Latin in mixed case (including letters whose lower case is not ASCII),
// Arabic-Indic digits, phone and plot formats, codes, LIKE wildcards and
// whitespace inside a value.
const WORDS = [
  "بغداد", "البصرة", "أربيل", "النجف", "كربلاء", "الكرادة", "المنصور", "زيونة",
  "الجادرية", "حي الجامعة", "شارع فلسطين", "شارع  14 رمضان", "قرب جامع الرحمن",
  "مقابل مدرسة الأمل", "مدرسه", "مستشفى", "مستشفي", "أحمد", "احمد", "إبراهيم", "آمنة",
  "مؤسسة", "دار", "Villa Royal", "VILLA", "villa", "İstanbul", "ÀBC", "Straße", "Café",
  "مرآب", "طابو", "ملك صرف", "سند 25", "عقد زراعي 117/35", "١٢٣", "٠٧٧٠", "L-0012",
  "50%", "100% مضمون", "a_b", "under_score", "back\\slash", "سطر1\nسطر2", "tab\there",
];
const PHONES = [
  "07701234567", "0770 123 4567", "0770-123-4567", "+964 770 123 4567",
  "٠٧٧٠١٢٣٤٥٦٧", "0780.555.0001", "07809990012", "0750 000 1200", "phone: 0771-22", "",
];
const PLOTS = ["12/3", "١٢/٣", "1234", "12-ب", "7", "0012", "300/15", "A12"];
const LETTERS = ["أ", "ب", "A", "b"];
const AREAS = [200, 0.5, 1250.75, 1000, 12, 3.25];
const PRICES = [150000000, 250000, 75000000.5, 1000, 999999999.99];
const PREFIXES = ["L", "H", "AG", "V", "AP"];
const text = () => (random() < 0.5 ? null : `${pick(WORDS)}${random() < 0.4 ? ` ${Math.floor(random() * 100)}` : ""}`);

const PROPERTY_TEXT = [
  "name", "property_type", "legal_type", "pricing_method", "governorate", "governorate_text",
  "city", "district", "district_text", "neighborhood", "neighborhood_text", "address_details",
  "owner_notes", "notes", "nazal", "subdistrict_number", "subdistrict_name", "mahalla", "alley",
  "house_number", "nearest_landmark", "frontage", "street_width",
];
const RENTAL_TEXT = [
  "name", "property_type", "rent_period", "area_unit", "governorate", "district", "neighborhood",
  "address_details", "owner_notes", "other_details", "notes",
];

async function insertProperties(count: number) {
  for (let i = 1; i <= count; i += 1) {
    const values: Record<string, unknown> = Object.fromEntries(PROPERTY_TEXT.map((c) => [c, text()]));
    Object.assign(values, {
      code: `${pick(PREFIXES)}-${String(i).padStart(4, "0")}`,
      property_type: values.property_type ?? "بيت",
      legal_type: values.legal_type ?? "طابو ملك صرف",
      pricing_method: values.pricing_method ?? "سعر إجمالي مباشر",
      area_value: pick(AREAS),
      area_unit: pick(["متر", "دونم"]),
      unit_price: maybe(PRICES),
      total_price: pick(PRICES),
      owner_name: pick(WORDS),
      owner_phone: pick(PHONES),
      plot_number: maybe(PLOTS, 0.4),
      plot_letter: maybe(LETTERS, 0.3),
      status: pick(STATUSES),
    });
    const columns = Object.keys(values);
    // A repeated plot identity would break uq_properties_plot_identity; skip it.
    await pool.query(
      `INSERT INTO properties(${columns.join(", ")}) VALUES (${columns.map((_, n) => `$${n + 1}`).join(", ")})
       ON CONFLICT DO NOTHING`,
      Object.values(values),
    );
  }
}

async function insertRentals(count: number) {
  for (let i = 1; i <= count; i += 1) {
    const values: Record<string, unknown> = Object.fromEntries(RENTAL_TEXT.map((c) => [c, text()]));
    Object.assign(values, {
      code: `R-${String(i).padStart(4, "0")}`,
      property_type: values.property_type ?? "house",
      rent_period: values.rent_period ?? "monthly",
      area_unit: values.area_unit ?? "متر",
      area_value: pick(AREAS),
      rent_price: pick(PRICES),
      owner_name: pick(WORDS),
      owner_phone: pick(PHONES),
      status: pick(["available", "reserved", "rented", "archived"]),
    });
    const columns = Object.keys(values);
    await pool.query(
      `INSERT INTO rentals(${columns.join(", ")}) VALUES (${columns.map((_, n) => `$${n + 1}`).join(", ")})`,
      Object.values(values),
    );
  }
}

// Hand-picked searches: Arabic words and parts of words, hamza variants
// (searched as typed: there is no letter normalization), Latin in other cases,
// phones with and without separators, Arabic-Indic digits, plots, codes,
// prices as stored and in part, status labels, several tokens, and LIKE's own
// characters (which the old search took as wildcards: "%" found every row).
const QUERIES = [
  "50%", "%", "_", "a_b", "\\", "back\\slash", "100%", "%%", "under_score", "_score", "\\s",
  "%بغداد",
  "بغداد", "بغ", "غداد", "أحمد", "احمد", "إبراهيم", "آمنة", "مدرسة", "مدرسه", "مستشفى",
  "مستشفي", "مؤسسة", "villa", "VILLA", "Villa", "vil", "royal", "istanbul", "İstanbul",
  "àbc", "ÀBC", "straße", "STRASSE", "café", "CAFÉ", "0770", "07701234567", "1234567",
  "123 4567", "0770-123", "+964", "964770", "٠٧٧٠", "١٢٣", "12/3", "١٢/٣", "12-ب", "L-0012",
  "l-0012", "L-00", "0012", "h-", "-", "/", "150000000", "150000000.00", "250000", ".5",
  "0.50", "1250.75", ".75", "999999999.99", "متاح", "متاحة", "محجوز", "قيد", "التفاوض",
  "قيد التفاوض", "غير متاح", "غير", "مؤرشف", "المؤرشف", "مؤجر", "شارع فلسطين", "شارع 14",
  "سطر1", "سطر2", "1", "12", "2", "x", "زيونة 3", "zzzz-not-found", "  بغداد   الكرادة  ",
  "سند 25", "117/35", "phone:", "here", "monthly", "متر",
];

/** Parts of stored values: what a user copies from a row, cut anywhere. */
async function sampledQueries(table: "properties" | "rentals", count: number) {
  const columns = table === "properties" ? [...OLD_PROPERTY_COLUMNS, ...OLD_PROPERTY_NUMBERS] : [...OLD_RENTAL_COLUMNS, ...OLD_RENTAL_NUMBERS];
  const { rows } = await pool.query(
    `SELECT ${columns.map((c) => `"${c}"::text AS "${c}"`).join(", ")} FROM ${table} ORDER BY id`,
  );
  const sample = (values: string[]) => {
    const value = [...pick(values)];
    const start = Math.floor(random() * value.length);
    return value.slice(start, start + 1 + Math.floor(random() * 8)).join("");
  };
  return Array.from({ length: count }, (_, n) => {
    const row = pick(rows);
    const values = columns.map((c) => row[c] as string | null).filter((v): v is string => !!v?.trim());
    // Every fourth query has two parts, both from the same row.
    return n % 4 === 3 ? `${sample(values)} ${sample(values)}` : sample(values);
  }).filter((query) => query.trim());
}

/** The first statement that reads search_text while `work` runs. */
async function captureSearch(work: () => Promise<unknown>) {
  const original = pg.Client.prototype.query;
  let statement: { text: string; values: unknown[] } | undefined;
  pg.Client.prototype.query = function (this: pg.Client, config: unknown, values?: unknown, ...rest: unknown[]) {
    const query = config as { text?: string; values?: unknown[] };
    if (!statement && query?.text?.includes('"search_text"'))
      statement = { text: query.text, values: query.values ?? (values as unknown[]) };
    return (original as (...args: unknown[]) => unknown).call(this, config, values, ...rest);
  } as typeof original;
  try {
    await work();
  } finally {
    pg.Client.prototype.query = original;
  }
  assert.ok(statement, "the search reads search_text");
  return statement;
}

test("property and rental search: the same rows as the per-column ILIKE search", async (t) => {
  const ctx = await removalTestContext("search");
  const headers = { authorization: `Bearer ${ctx.token}` };
  const get = async (url: string) => {
    const response = await ctx.app.inject({ method: "GET", url: `/api${url}`, headers });
    assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
    return response.json();
  };
  const ids = (rows: Array<{ id: number }>) => rows.map((row) => row.id).sort((a, b) => a - b);
  /** Every row of a paged list, checked against its total. */
  const pagedIds = async (base: string) => {
    const rows: Array<{ id: number }> = [];
    let total = 0;
    for (let page = 1; page < 50; page += 1) {
      const result = await get(`${base}&page=${page}&page_size=100`);
      total = result.total;
      rows.push(...result.items);
      if (rows.length >= total || !result.items.length) break;
    }
    assert.equal(rows.length, total, `${base}: the pages hold the total`);
    return ids(rows);
  };

  try {
    await pool.query("DELETE FROM properties");
    await pool.query("DELETE FROM rentals");
    await insertProperties(320);
    await insertRentals(220);
    const counts = await pool.query(
      "SELECT (SELECT count(*) FROM properties)::int AS properties, (SELECT count(*) FROM rentals)::int AS rentals",
    );
    assert.ok(counts.rows[0].properties > 300, "most generated plots are distinct");

    const compare = async (table: "properties" | "rentals", queries: string[]) => {
      let matched = 0;
      for (const query of queries) {
        const expected = await referenceIds(table, query);
        if (expected.length) matched += 1;
        const q = encodeURIComponent(query);
        const message = `${table} search ${JSON.stringify(query)}`;
        if (table === "properties") {
          assert.deepEqual(ids(await get(`/properties?search=${q}&include_archived=true`)), expected, `${message} (search=)`);
          assert.deepEqual(ids(await get(`/properties?q=${q}&include_archived=true`)), expected, `${message} (q=)`);
        } else {
          assert.deepEqual(ids(await get(`/rentals?q=${q}&include_archived=true`)), expected, message);
        }
        assert.deepEqual(await pagedIds(`/${table}/paged?q=${q}&include_archived=true`), expected, `${message} (paged)`);
      }
      return matched;
    };

    await t.test("hand-picked queries match the same properties", async () => {
      const matched = await compare("properties", QUERIES);
      assert.ok(matched > QUERIES.length / 2, "most queries find something");
    });

    await t.test("parts of stored values match the same properties", async () => {
      const queries = await sampledQueries("properties", 160);
      assert.ok(queries.length > 120);
      assert.equal(await compare("properties", queries), queries.length, "a stored value always finds its row");
    });

    await t.test("hand-picked and sampled queries match the same rentals", async () => {
      await compare("rentals", QUERIES);
      const queries = await sampledQueries("rentals", 120);
      assert.equal(await compare("rentals", queries), queries.length);
    });

    await t.test("search combines with the default archived filter", async () => {
      for (const query of ["بغداد", "0770", "L-0012", "متاح", "12/3"]) {
        const q = encodeURIComponent(query);
        const active = (await pool.query("SELECT id FROM properties WHERE status <> 'archived'")).rows.map((r) => Number(r.id));
        const expected = (await referenceIds("properties", query)).filter((id) => active.includes(id));
        assert.deepEqual(ids(await get(`/properties?search=${q}`)), expected, query);
        assert.deepEqual(await pagedIds(`/properties/paged?q=${q}`), expected, query);
      }
    });

    await t.test("LIKE's wildcards and escape character match only themselves", async () => {
      const all = (await pool.query("SELECT count(*)::int AS n FROM properties")).rows[0].n;
      const values = OLD_PROPERTY_COLUMNS.map((c) => `coalesce("${c}", '')`).join(" || ' ' || ");
      // No digits (those also match phone digits) and no status label.
      for (const query of ["%", "_", "\\", "a_b", "back\\slash"]) {
        const found = ids(await get(`/properties?search=${encodeURIComponent(query)}&include_archived=true`));
        const { rows } = await pool.query(`SELECT id FROM properties WHERE strpos(${values}, $1) > 0 ORDER BY id`, [query]);
        assert.deepEqual(found, rows.map((row) => Number(row.id)), query);
        assert.ok(found.length > 0 && found.length < all, `${query}: some rows, not all`);
      }
    });

    await t.test("the district and plot filters match their text as typed too", async () => {
      const found = async (filter: string, value: string) =>
        ids(await get(`/properties?${filter}=${encodeURIComponent(value)}&include_archived=true`));
      const containing = async (column: string, value: string) =>
        (await pool.query(`SELECT id FROM properties WHERE strpos("${column}", $1) > 0 ORDER BY id`, [value])).rows.map(
          (row) => Number(row.id),
        );
      for (const value of ["%", "_", "a_b", "50%"]) {
        const expected = await containing("district", value);
        assert.ok(expected.length > 0, `some district contains ${value}`);
        assert.deepEqual(await found("district", value), expected, `district=${value}`);
      }
      // As a wildcard, 1_3 would match the plot 1234.
      assert.ok((await containing("plot_number", "1234")).length > 0);
      assert.deepEqual(await found("plot_number", "1_3"), []);
      assert.deepEqual(await found("plot_number", "%"), []);
      assert.deepEqual(await found("plot_letter", "_"), []);
      assert.deepEqual(await found("plot_number", "12/3"), await containing("plot_number", "12/3"), "plain text as before");
    });

    await t.test("search_text follows inserts and updates", async () => {
      const find = async (table: string, query: string) =>
        ids(await get(`/${table}?q=${encodeURIComponent(query)}&include_archived=true`));
      const property = Number(
        (await pool.query(
          `INSERT INTO properties(code, property_type, legal_type, area_value, area_unit, pricing_method, total_price,
             owner_name, owner_phone, notes)
           VALUES ('NEW-0001', 'بيت', 'طابو ملك صرف', 321.5, 'متر', 'سعر إجمالي مباشر', 4560000, 'Penthouse Owner',
             '0799-111-2233', 'ملاحظة أولى') RETURNING id`,
        )).rows[0].id,
      );
      for (const query of ["07991112233", "0799-111", "penthouse", "ملاحظة أولى", "321.50", "4560000"])
        assert.ok((await find("properties", query)).includes(property), `new row: ${query}`);
      await pool.query("UPDATE properties SET owner_phone = '0788 000 1111', notes = 'معدلة' WHERE id = $1", [property]);
      for (const query of ["07880001111", "0788-000", "معدلة"])
        assert.ok((await find("properties", query)).includes(property), `updated row: ${query}`);
      for (const query of ["07991112233", "0799-111", "أولى"])
        assert.ok(!(await find("properties", query)).includes(property), `old value: ${query}`);

      const rental = Number(
        (await pool.query(
          `INSERT INTO rentals(code, property_type, rent_period, area_value, area_unit, rent_price, owner_name,
             owner_phone, other_details) VALUES ('NEW-R1', 'house', 'monthly', 90, 'متر', 650000, 'مؤجر جديد',
             '0790 222 3344', 'Garden') RETURNING id`,
        )).rows[0].id,
      );
      assert.ok((await find("rentals", "garden")).includes(rental));
      await pool.query("UPDATE rentals SET other_details = 'Roof' WHERE id = $1", [rental]);
      assert.ok((await find("rentals", "roof")).includes(rental));
      assert.ok(!(await find("rentals", "garden")).includes(rental));
      await pool.query("DELETE FROM properties WHERE id = $1", [property]);
      await pool.query("DELETE FROM rentals WHERE id = $1", [rental]);
    });

    await t.test("every search form can use the trigram index on search_text", async () => {
      await pool.query("ANALYZE properties, rentals");
      const searches = [
        ["/properties/paged?q=بغداد الكرادة&include_archived=true", "idx_properties_search_text_trgm"],
        ["/properties?search=07701234567", "idx_properties_search_text_trgm"],
        // A token with digits and other characters adds the phone-digits match.
        ["/properties/paged?q=L-0012", "idx_properties_search_text_trgm"],
        // A status label adds the status match.
        ["/properties?q=محجوز", "idx_properties_search_text_trgm"],
        ["/rentals/paged?q=الجادرية", "idx_rentals_search_text_trgm"],
        ["/rentals?q=Villa Royal", "idx_rentals_search_text_trgm"],
      ];
      for (const [url, index] of searches) {
        const { text, values } = await captureSearch(() => get(encodeURI(url)));
        const client = await pool.connect();
        try {
          // The test tables are small enough that a scan is cheaper; forbid it
          // to see whether the index can serve the statement at all.
          await client.query("BEGIN");
          await client.query("SET LOCAL enable_seqscan = off");
          const plan = (await client.query(`EXPLAIN ${text}`, values)).rows.map((row) => row["QUERY PLAN"]).join("\n");
          assert.match(plan, new RegExp(index), `${url}\n${plan}`);
          assert.doesNotMatch(plan, /Seq Scan on (properties|rentals)/, `${url}\n${plan}`);
        } finally {
          await client.query("ROLLBACK");
          client.release();
        }
      }
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
