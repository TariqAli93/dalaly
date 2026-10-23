// Server-side query costs against a seeded throwaway database: the Excel
// property import (validate + commit), the users and roles lists, and
// creating a property with its location picked from the lists.
//
//   node scripts/perf/queries.mjs [--server server/dist/index.js]
//        [--label name] [--rounds 3] [--import-sizes 1000,5000]
//        [--properties 5000] [--users 50] [--roles 20]
//
// --server is a built API bundle (`pnpm --filter @dalaly/server build`;
// copy server/dist/index.js aside to keep a baseline). It runs under this
// Node, not a packaged build: these are database round trips, not startup.
// Results go to perf-results/<label>-queries.json.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  ADMIN,
  api,
  createDatabase,
  dropDatabase,
  freePort,
  makeTempDir,
  query,
  root,
  seedDataset,
  startApi,
  stats,
  stopProcess,
  timeRequests,
  waitForHealth,
} from "./lib.mjs";

const { values: options } = parseArgs({
  args: process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--")),
  options: {
    server: { type: "string", default: "server/dist/index.js" },
    label: { type: "string", default: "queries" },
    rounds: { type: "string", default: "3" },
    "import-sizes": { type: "string", default: "1000,5000" },
    properties: { type: "string", default: "5000" },
    users: { type: "string", default: "50" },
    roles: { type: "string", default: "20" },
  },
});

const serverEntry = path.resolve(root, options.server);
if (!fs.existsSync(serverEntry)) throw new Error(`No API bundle at ${serverEntry}`);
const label = options.label.replace(/[^A-Za-z0-9._-]+/g, "-");
const rounds = Number(options.rounds);
const importSizes = options["import-sizes"].split(",").map(Number);
const propertyCount = Number(options.properties);
const userCount = Number(options.users);
const roleCount = Number(options.roles);
const sizes = {
  properties: propertyCount,
  rentals: Math.round(propertyCount * 0.4),
  people: Math.round(propertyCount * 0.3),
  requests: Math.round(propertyCount * 0.1),
  documents: Math.round(propertyCount * 0.6),
  auditLogs: propertyCount * 4,
};
// startApi runs `exe serverEntry`; ELECTRON_RUN_AS_NODE means nothing to Node.
const app = {
  exe: process.execPath,
  serverEntry,
  migrations: path.join(root, "server/drizzle"),
};

const results = {
  label,
  server: serverEntry,
  measuredAt: new Date().toISOString(),
  machine: { platform: process.platform, node: process.version },
  dataset: { ...sizes, users: userCount, roles: roleCount },
};

const temporary = makeTempDir(label);
let databaseName;
let apiChild;
try {
  databaseName = await createDatabase();
  const port = await freePort();
  apiChild = startApi(app, { databaseName, port, dataDir: temporary });
  await waitForHealth(
    port,
    (health) => health.startup_state === "SETUP_REQUIRED" && health.startup_reason === "ADMIN_REQUIRED",
  );
  await api(port, "/auth/setup-admin", { method: "POST", body: ADMIN });
  await seedDataset(databaseName, sizes);
  const location = await seedLocations(databaseName);
  await seedUsersAndRoles(databaseName, userCount, roleCount);
  console.log(`Seeded ${databaseName}`, results.dataset);

  // Restart so the API runs against the seeded data with cold caches.
  await stopProcess(apiChild);
  apiChild = startApi(app, { databaseName, port, dataDir: temporary });
  await waitForHealth(port, (health) => health.startup_state === "READY");
  const { body: session } = await api(port, "/auth/login", { method: "POST", body: ADMIN });
  const token = session.token;

  results.users = await timeRequests(() => api(port, "/users", { token }));
  results.roles = await timeRequests(() => api(port, "/roles", { token }));
  let plot = 0;
  results.propertyCreate = await timeRequests(() =>
    api(port, "/properties", {
      token,
      method: "POST",
      body: propertyPayload(location, (plot += 1)),
    }),
  );
  console.log("GET /users", results.users);
  console.log("GET /roles", results.roles);
  console.log("POST /properties", results.propertyCreate);

  results.import = {};
  for (const size of importSizes) {
    const runs = [];
    for (let round = 0; round < rounds; round += 1) {
      const rows = importRows(size, round);
      const validate = await timed(() =>
        api(port, "/import/properties/validate", { token, method: "POST", body: { rows } }),
      );
      const { result: commit, ms: commitMs, probes } = await whileProbing(port, token, () =>
        api(port, "/import/properties/commit", { token, method: "POST", body: { rows } }),
      );
      runs.push({
        validateMs: round1(validate.ms),
        commitMs: round1(commitMs),
        inserted: commit.body.inserted,
        skipped: commit.body.skipped,
        // GET /auth/me sent one after another while the commit ran.
        probes: probes.length ? stats(probes) : null,
      });
      console.log(`import ${size} #${round + 1}`, runs.at(-1));
      // Keep the dataset the same size for every round.
      await query(databaseName, "DELETE FROM properties WHERE owner_phone LIKE '075%'");
      await query(databaseName, "DELETE FROM audit_logs WHERE entity_type = 'property' AND new_value->>'owner_phone' LIKE '075%'");
    }
    results.import[size] = {
      runs,
      validate: stats(runs.map((run) => run.validateMs)),
      commit: stats(runs.map((run) => run.commitMs)),
    };
  }
} finally {
  await stopProcess(apiChild);
  if (databaseName) await dropDatabase(databaseName);
  fs.rmSync(temporary, { recursive: true, force: true });
}

const outDir = path.join(root, "perf-results");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${label}-queries.json`);
fs.writeFileSync(outFile, `${JSON.stringify(results, null, 2)}\n`);
console.log(`Wrote ${outFile}`);

async function seedLocations(databaseName) {
  const { rows } = await query(
    databaseName,
    `WITH g AS (INSERT INTO governorates(name) VALUES ('محافظة القياس') RETURNING id),
          d AS (INSERT INTO districts(governorate_id, name) SELECT id, 'منطقة القياس' FROM g RETURNING id),
          n AS (INSERT INTO neighborhoods(district_id, name) SELECT id, 'حي القياس' FROM d RETURNING id)
     SELECT g.id AS governorate_id, d.id AS district_id, n.id AS neighborhood_id FROM g, d, n`,
  );
  return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
}

/**
 * Roles with a spread of permissions and users holding one to three roles
 * each. PIN hashes are placeholders: these users only appear in lists.
 */
async function seedUsersAndRoles(databaseName, users, roles) {
  await query(
    databaseName,
    `INSERT INTO roles(name, description)
     SELECT 'دور ' || g, 'وصف ' || g FROM generate_series(1, $1::int) g`,
    [roles],
  );
  await query(
    databaseName,
    `INSERT INTO role_permissions(role_id, permission_id)
     SELECT r.id, p.id FROM roles r JOIN permissions p ON (r.id + p.id) % 3 <> 0
     WHERE NOT r.is_system`,
  );
  await query(
    databaseName,
    `INSERT INTO users(username, display_name, pin_hash)
     SELECT 'perf_user_' || g, 'مستخدم ' || g, 'perf-not-a-hash' FROM generate_series(1, $1::int) g`,
    [users],
  );
  await query(
    databaseName,
    `INSERT INTO user_roles(user_id, role_id)
     SELECT u.id, r.id FROM users u
     JOIN LATERAL (SELECT id FROM roles WHERE NOT is_system ORDER BY (id * 7 + u.id) % 11 LIMIT 1 + u.id % 3) r ON true
     WHERE u.username LIKE 'perf_user_%'`,
  );
}

function propertyPayload(location, plot) {
  return {
    property_type: "أرض",
    legal_type: "طابو ملك صرف",
    area_value: 400,
    area_unit: "متر",
    pricing_method: "سعر على المتر",
    unit_price: 250000,
    owner_name: `مالك القياس ${plot}`,
    owner_phone: `0760${String(plot).padStart(7, "0")}`,
    ...location,
    plot_number: `Q${plot}`,
  };
}

/** Rows as the renderer's Excel import sends them (text locations). */
function importRows(size, round) {
  return Array.from({ length: size }, (_, index) => {
    const n = round * 100_000 + index;
    return {
      property_type: "أرض",
      legal_type: "طابو ملك صرف",
      area_value: 200 + (index % 800),
      area_unit: "متر",
      pricing_method: "سعر على المتر",
      unit_price: 150000 + (index % 50) * 1000,
      governorate_text: ["بغداد", "البصرة", "النجف"][index % 3],
      district_text: `منطقة ${index % 40}`,
      neighborhood_text: `حي ${index % 15}`,
      plot_number: `I${n}`,
      plot_letter: index % 2 ? "أ" : "ب",
      owner_name: `مالك مستورد ${n}`,
      owner_phone: `075${String(n).padStart(8, "0")}`,
    };
  });
}

async function timed(fn) {
  const started = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - started };
}

/** Runs fn while sending GET /auth/me back to back, timing each one. */
async function whileProbing(port, token, fn) {
  let done = false;
  const probes = [];
  const prober = (async () => {
    while (!done) {
      const { ms } = await timed(() => api(port, "/auth/me", { token }));
      if (!done) probes.push(ms);
    }
  })();
  try {
    const result = await timed(fn);
    return { ...result, probes };
  } finally {
    done = true;
    await prober;
  }
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
