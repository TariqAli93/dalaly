// The property and rental search, and the writes it adds to, for one version
// of the server code: EXPLAIN (ANALYZE, BUFFERS) of the SQL the repositories
// send, their in-process timings, and insert/update timings, against a seeded
// dalaly_perf_* database. Runs under tsx, since it imports that version's
// TypeScript sources. To measure another commit, extract its server/src and
// server/drizzle (git archive) somewhere node_modules resolves from.
//
//   pnpm perf:search -- --label branch --properties 50000
//   pnpm perf:search -- --label main --src perf-results/main/server/src --drizzle perf-results/main/server/drizzle
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createDatabase, credentials, databaseUrl, dropDatabase, root, seedDataset, stats } from "./lib.mjs";

const { values: options } = parseArgs({
  args: process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--")),
  options: {
    label: { type: "string", default: "search" },
    src: { type: "string", default: "server/src" },
    drizzle: { type: "string", default: "server/drizzle" },
    properties: { type: "string", default: "5000" },
    runs: { type: "string", default: "20" },
  },
});
const resolve = (p) => path.resolve(root, p);
const src = resolve(options.src);
const runs = Number(options.runs);
const count = Number(options.properties);
const sizes = {
  properties: count,
  rentals: Math.round(count * 0.4),
  people: Math.round(count * 0.3),
  requests: Math.round(count * 0.1),
  documents: Math.round(count * 0.6),
  auditLogs: count * 4,
};
const pg = createRequire(path.join(root, "server/package.json"))("pg");

// What a user looks for: a governorate (one row in six), the harness's
// unselective two-word search, an owner name, a phone as stored and typed
// with dashes, a code, a plot number, a price, and nothing.
const g = Math.round(count * 0.4321);
const price = 50000000 + ((g * 7919) % 900000000);
const PROPERTY_SEARCHES = {
  governorate: "بغداد",
  "two words": "شارع 1",
  owner: `مالك ${g % sizes.people}`,
  phone: `0780${String(g % sizes.people).padStart(7, "0")}`,
  "phone with dashes": `0780-${String(g % sizes.people).padStart(7, "0").replace(/^(\d{3})/, "$1-")}`,
  code: `PERF-P${g}`,
  plot: String(g),
  price: String(price),
  "no match": "غيرموجود",
};
const rg = Math.round(sizes.rentals * 0.4321);
const RENTAL_SEARCHES = {
  governorate: "بغداد",
  "two words": "شارع 1",
  phone: `0790${String(rg % sizes.people).padStart(7, "0")}`,
  code: `PERF-R${rg}`,
};
const page = { page: 1, page_size: 10, sort_by: "created_at", sort_order: "desc" };

const results = {
  label: options.label,
  measuredAt: new Date().toISOString(),
  src: path.relative(root, src),
  dataset: sizes,
  searches: {},
  writes: {},
  sizes: {},
};
let databaseName;
let admin;
try {
  databaseName = await createDatabase();
  // The sources read their database from the environment when imported.
  process.env.DATABASE_URL = databaseUrl(databaseName);
  const load = (file) => import(pathToFileURL(path.join(src, file)).href);
  const { pool } = await load("infrastructure/database/pool.ts");
  const { runDatabaseMigrations } = await load("infrastructure/database/run-migrations.ts");
  const propertiesRepo = await load("modules/properties/properties.repository.ts");
  const rentalsRepo = await load("modules/rentals/rentals.repository.ts");
  await runDatabaseMigrations(resolve(options.drizzle));
  admin = new pg.Pool({ ...credentials, database: databaseName, max: 1 });
  await admin.query("INSERT INTO users(username, display_name, pin_hash) VALUES ('perf_admin', 'perf_admin', '-')");
  await seedDataset(databaseName, sizes);
  // The harness's rows leave most optional text empty; give every property a
  // plot number and a landmark, and every third one notes, as offices do.
  await admin.query(`
    UPDATE properties SET
      plot_number = substring(code from 7),
      nearest_landmark = (ARRAY['قرب جامع الرحمن', 'مقابل مدرسة الأمل', 'خلف السوق', 'قرب المستشفى'])[1 + id % 4],
      notes = CASE WHEN id % 3 = 0 THEN 'واجهة ' || (id % 30) || ' متر، شارع مبلط، قريبة من الخدمات' END`);
  await admin.query("VACUUM FULL properties");
  await admin.query("ANALYZE");

  // Captures the statement a repository call sends to the listed table.
  const capture = async (table, call) => {
    const original = pg.Client.prototype.query;
    let statement;
    pg.Client.prototype.query = function (config, values, ...rest) {
      const text = typeof config === "string" ? config : config?.text;
      if (!statement && text && new RegExp(`from "${table}"`, "i").test(text))
        statement = { text, values: (typeof config === "string" ? undefined : config.values) ?? values };
      return original.call(this, config, values, ...rest);
    };
    try {
      await call();
    } finally {
      pg.Client.prototype.query = original;
    }
    return statement;
  };

  const measure = async (table, name, call) => {
    for (let i = 0; i < 3; i += 1) await call();
    const samples = [];
    let rows = 0;
    for (let i = 0; i < runs; i += 1) {
      const started = performance.now();
      const result = await call();
      samples.push(performance.now() - started);
      rows = Array.isArray(result) ? result.length : result.total;
    }
    const statement = await capture(table, call);
    const explain = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.text}`;
    const executions = [];
    let plan;
    for (let i = 0; i < 5; i += 1) {
      [plan] = (await admin.query(explain, statement.values)).rows[0]["QUERY PLAN"];
      executions.push(plan["Execution Time"]);
    }
    const text = (await admin.query(`EXPLAIN (ANALYZE, BUFFERS) ${statement.text}`, statement.values)).rows
      .map((row) => row["QUERY PLAN"])
      .join("\n");
    const scans = [];
    const walk = (node) => {
      if (/Scan$/.test(node["Node Type"]))
        scans.push(`${node["Node Type"]}${node["Index Name"] ? ` (${node["Index Name"]})` : ""}`);
      for (const child of node.Plans ?? []) walk(child);
    };
    walk(plan.Plan);
    results.searches[`${table}: ${name}`] = {
      rows,
      call: stats(samples),
      executionMs: Math.round([...executions].sort((a, b) => a - b)[2] * 100) / 100,
      sharedHit: plan.Plan["Shared Hit Blocks"],
      sharedRead: plan.Plan["Shared Read Blocks"],
      scans: [...new Set(scans)].join(", "),
      plan: text,
    };
  };

  for (const [name, term] of Object.entries(PROPERTY_SEARCHES)) {
    await measure("properties", `${name} (paged)`, () => propertiesRepo.listPropertiesPage({ ...page, q: term }));
    await measure("properties", `${name} (search=)`, () => propertiesRepo.listProperties({ search: term }));
  }
  for (const [name, term] of Object.entries(RENTAL_SEARCHES)) {
    await measure("rentals", `${name} (paged)`, () => rentalsRepo.listRentalsPage({ ...page, q: term }));
    await measure("rentals", `${name} (q=)`, () => rentalsRepo.listRentals({ q: term }));
  }

  // Sizes before the writes below leave dead rows behind.
  const { rows: relations } = await admin.query(`
    SELECT c.relname AS name, pg_relation_size(c.oid) AS bytes
    FROM pg_class c WHERE c.relname IN ('properties', 'rentals')
       OR c.oid IN (SELECT indexrelid FROM pg_index WHERE indrelid IN ('properties'::regclass, 'rentals'::regclass))
    ORDER BY c.relname`);
  for (const { name, bytes } of relations) results.sizes[name] = Math.round(Number(bytes) / 1024);

  // Writes. Bulk ones run in a transaction that is rolled back, then VACUUM
  // (which also empties the GIN pending list) so each run starts alike.
  const timed = async (sql, params) => {
    const started = performance.now();
    await admin.query(sql, params);
    return performance.now() - started;
  };
  const bulk = async (sql) => {
    const samples = [];
    for (let i = 0; i < 3; i += 1) {
      await admin.query("BEGIN");
      samples.push(await timed(sql));
      await admin.query("ROLLBACK");
      await admin.query("VACUUM properties");
    }
    return stats(samples);
  };
  results.writes[`insert ${count} rows (one statement)`] = await bulk(`
    INSERT INTO properties(code, name, property_type, legal_type, area_value, area_unit, pricing_method,
      total_price, owner_name, owner_phone, governorate, address_details, plot_number, nearest_landmark, notes)
    SELECT 'BULK-P' || g, 'عقار ' || g, 'بيت', 'طابو ملك صرف', 100 + g % 900, 'متر', 'سعر إجمالي مباشر',
           50000000 + g, 'مالك ' || g, '0781' || lpad(g::text, 7, '0'), 'بغداد', 'شارع ' || (g % 200),
           'B' || g, 'قرب جامع الرحمن', CASE WHEN g % 3 = 0 THEN 'واجهة ' || (g % 30) || ' متر' END
    FROM generate_series(1, ${count}) g`);
  results.writes[`update notes of all ${count} rows (one statement)`] = await bulk(
    "UPDATE properties SET owner_notes = coalesce(owner_notes, '') || ' اتصل مساءً'",
  );
  // One row per statement, each committed on its own, as the app saves.
  const single = async (statement) => {
    const samples = [];
    for (let i = 0; i < 300; i += 1) samples.push(await timed(...statement(i)));
    return stats(samples);
  };
  results.writes["insert one row (300 times)"] = await single((i) => [
    `INSERT INTO properties(code, name, property_type, legal_type, area_value, area_unit, pricing_method,
       total_price, owner_name, owner_phone, governorate, address_details, plot_number, notes)
     VALUES ($1, $2, 'بيت', 'طابو ملك صرف', 250, 'متر', 'سعر إجمالي مباشر', 120000000, $3, $4, 'بغداد',
       'شارع فلسطين قرب جامع الرحمن', $5, 'واجهة 12 متر، شارع مبلط')`,
    [`ONE-P${i}`, `عقار جديد ${i}`, `مالك جديد ${i}`, `0782 ${String(i).padStart(7, "0")}`, `S${i}`],
  ]);
  const { rows: ids } = await admin.query("SELECT id FROM properties WHERE code LIKE 'PERF-P%' ORDER BY id LIMIT 300");
  results.writes["update one row's notes (300 times)"] = await single((i) => [
    "UPDATE properties SET notes = $2, updated_at = now() WHERE id = $1",
    [ids[i].id, `ملاحظة معدلة ${i}: المالك يقبل التفاوض`],
  ]);
  await pool.end();
} finally {
  await admin?.end();
  if (databaseName) await dropDatabase(databaseName);
}

const fileLabel = options.label.replace(/[^A-Za-z0-9._-]+/g, "-");
const out = path.join(root, "perf-results", `${fileLabel}-search.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.table(
  Object.fromEntries(
    Object.entries(results.searches).map(([name, r]) => [
      name,
      { rows: r.rows, "call ms": r.call.median, "exec ms": r.executionMs, buffers: r.sharedHit + r.sharedRead, scans: r.scans },
    ]),
  ),
);
console.table(Object.fromEntries(Object.entries(results.writes).map(([name, r]) => [name, r])));
console.table(results.sizes);
console.log(`Written to ${path.relative(root, out)}`);
