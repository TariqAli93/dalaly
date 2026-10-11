import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const root = fileURLToPath(new URL("../../", import.meta.url));
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const name = `dalaly_maps_test_${process.pid}_${Date.now()}`;
assert.match(name, /^dalaly_maps_test_\d+_\d+$/);
const admin = new pg.Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4000 }
  : { host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT ?? 5432), user: process.env.DB_USER ?? "postgres", password: process.env.DB_PASSWORD ?? "root", database: "postgres", connectionTimeoutMillis: 4000 });
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dalaly-maps-"));
let created = false;
let app: Awaited<ReturnType<typeof import("../src/server.js")["buildServer"]>> | undefined;
let pool: pg.Pool | undefined;

try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  if (process.env.DATABASE_URL) {
    const connection = new URL(process.env.DATABASE_URL); connection.pathname = `/${name}`; process.env.DATABASE_URL = connection.href;
  } else { delete process.env.DATABASE_URL; process.env.DB_NAME = name; }
  process.env.APP_DATA_DIR = path.join(temporary, "data");
  process.env.CORS_ORIGINS = "http://127.0.0.1:5189,http://127.0.0.1:5173,null";
  process.env.ADMIN_USERNAME = "maps_test_admin"; process.env.ADMIN_PIN = "918273";
  const migrations = path.join(root, "server/drizzle");
  const oldMigrations = path.join(temporary, "drizzle");
  await fs.cp(migrations, oldMigrations, { recursive: true });
  const journalPath = path.join(oldMigrations, "meta/_journal.json");
  const journal = JSON.parse(await fs.readFile(journalPath, "utf8"));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 18);
  await fs.writeFile(journalPath, JSON.stringify(journal));
  const runner = await import("../src/infrastructure/database/run-migrations.js");
  pool = (await import("../src/infrastructure/database/pool.js")).pool;
  await runner.runDatabaseMigrations(oldMigrations);
  await pool.query("INSERT INTO properties (code,property_type,legal_type,area_value,area_unit,pricing_method,total_price,owner_name,owner_phone) VALUES ('OLD-P','أرض','طابو ملك صرف',100,'متر','سعر إجمالي مباشر',1000000,'مالك سابق','07700000000')");
  await pool.query("INSERT INTO rentals (code,property_type,rent_price,rent_period,area_value,area_unit,owner_name,owner_phone) VALUES ('OLD-R','house',250000,'monthly',100,'متر','مالك سابق','07700000000')");
  await runner.runDatabaseMigrations(migrations);
  await runner.runDatabaseMigrations(migrations); // Already-applied migrations must be safe to rerun.
  for (const table of ["properties", "rentals"]) {
    const { rows } = await pool.query(`SELECT owner_name, latitude, longitude, location_link FROM ${table}`);
    assert.equal(rows.length, 1); assert.equal(rows[0].owner_name, "مالك سابق");
    assert.equal(rows[0].latitude, null); assert.equal(rows[0].longitude, null); assert.equal(rows[0].location_link, null);
  }
  console.log("PASS migration preserves preexisting sale/rental records and reruns safely");
  const { markMigrationsSucceeded } = await import("../src/infrastructure/database/health.js");
  markMigrationsSucceeded(migrations);
  app = await (await import("../src/server.js")).buildServer(); app.log.level = "silent";
  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "maps_test_admin", pin: "918273" } });
  assert.equal(login.statusCode, 200);
  const token = login.json().token;
  const api = async (method: "GET" | "POST" | "PUT", url: string, payload?: object) => {
    const response = await app!.inject({ method, url: `/api${url}`, payload, headers: { authorization: `Bearer ${token}` } });
    return { status: response.statusCode, body: response.json() };
  };
  const property = { property_type: "أرض", legal_type: "طابو ملك صرف", area_value: 100, area_unit: "متر", pricing_method: "سعر إجمالي مباشر", total_price: 1000000, owner_name: "اختبار", owner_phone: "07700000000" };
  const rental = { property_type: "house", area_value: 100, area_unit: "متر", rent_price: 250000, rent_period: "monthly", owner_name: "اختبار", owner_phone: "07700000000" };
  const ids: Record<string, number> = {};
  for (const [entity, base] of [["properties", property], ["rentals", rental]] as const) {
    const empty = await api("POST", `/${entity}`, base);
    assert.equal(empty.status, 201); assert.equal(empty.body.latitude, null); assert.equal(empty.body.longitude, null);
    const located = await api("POST", `/${entity}`, { ...base, latitude: "33.3152", longitude: "44.3661", location_link: "https://www.google.com/maps?q=33.3152,44.3661" });
    assert.equal(located.status, 201); assert.equal(located.body.latitude, 33.3152); assert.equal(typeof located.body.longitude, "number");
    ids[entity] = located.body.id;
    const edited = await api("PUT", `/${entity}/${located.body.id}`, { ...base, latitude: -90, longitude: 180, location_link: null });
    assert.equal(edited.status, 200); assert.equal(edited.body.latitude, -90); assert.equal(edited.body.longitude, 180);
    const legacy = await api("PUT", `/${entity}/${located.body.id}`, base);
    assert.equal(legacy.body.latitude, -90); // Old clients must not erase the new fields.
    const osmLink = "https://www.openstreetmap.org/?mlat=-90&mlon=180#map=16/-90/180";
    const updatedLink = await api("PUT", `/${entity}/${located.body.id}`, { ...base, location_link: osmLink });
    assert.equal(updatedLink.status, 200); assert.equal(updatedLink.body.location_link, osmLink);
    assert.equal(updatedLink.body.latitude, -90); assert.equal(updatedLink.body.longitude, 180);
    const reopened = await api("GET", `/${entity}/${located.body.id}`);
    assert.equal(reopened.body.longitude, 180);
    const invalid = await api("PUT", `/${entity}/${located.body.id}`, { ...base, latitude: 91, longitude: 44 });
    assert.equal(invalid.status, 400);
    assert.equal((await api("GET", `/${entity}/${located.body.id}`)).body.latitude, -90);
    const cleared = await api("PUT", `/${entity}/${located.body.id}`, { ...base, latitude: "", longitude: "", location_link: "" });
    assert.equal(cleared.status, 200); assert.equal(cleared.body.latitude, null); assert.equal(cleared.body.longitude, null); assert.equal(cleared.body.location_link, null);
    await assert.rejects(pool.query(`UPDATE ${entity} SET latitude=91,longitude=0 WHERE id=$1`, [located.body.id]), (error: { code?: string }) => error.code === "23514");
    await assert.rejects(pool.query(`UPDATE ${entity} SET latitude=0,longitude=NULL WHERE id=$1`, [located.body.id]), (error: { code?: string }) => error.code === "23514");
    console.log(`PASS ${entity}: create, optional location, numeric output, edit, legacy update, reopen, invalid rejection, clear and database constraints`);
  }
  assert.equal((await api("POST", "/locations/resolve-map-link", { url: "https://www.google.com/maps?q=33.3152,44.3661" })).body.latitude, 33.3152);
  assert.equal((await api("POST", "/locations/resolve-map-link", { url: "https://www.openstreetmap.org/?mlat=33.3152&mlon=44.3661" })).body.longitude, 44.3661);
  assert.equal((await api("POST", "/locations/resolve-map-link", { url: "https://127.0.0.1/private" })).status, 400);
  assert.equal((await api("POST", "/locations/resolve-map-link", { url: "https://www.google.com/maps/place/Baghdad" })).status, 422);
  assert.equal((await app.inject({ method: "POST", url: "/api/locations/resolve-map-link", payload: { url: "https://www.google.com/maps?q=1,2" } })).statusCode, 401);
  console.log("PASS authenticated resolver and unsafe/unresolved link handling");
  if (process.env.MAPS_UI_TEST === "true") {
    const { verifyLocationUi } = await import("./location-ui.js");
    await verifyLocationUi(app, token, ids, api);
  }
  if (process.env.MAPS_ELECTRON_TEST === "true") {
    const { verifyPackagedMaps } = await import("./location-electron.js");
    await verifyPackagedMaps(app, token, ids.properties, temporary, api);
  }
} finally {
  await app?.close(); await pool?.end();
  if (created) { assert.match(name, /^dalaly_maps_test_\d+_\d+$/); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
  await admin.end();
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir())); assert.ok(path.basename(temporary).startsWith("dalaly-maps-"));
  await fs.rm(temporary, { recursive: true, force: true });
}
