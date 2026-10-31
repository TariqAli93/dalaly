// The business modules' API costs against a seeded year: deals, tasks,
// commissions, vouchers and the journal, leases and their installments,
// the financial and operational reports, and the dashboard's business
// summary and alerts. Each is timed against the plan's targets
// (docs/BUSINESS_SYSTEM_PLAN.md, "Performance targets"): a paged list under
// 15 ms median and 50 ms p95, a report under 500 ms, posting a receipt
// under 50 ms.
//
//   node scripts/perf/business.mjs [--server server/dist/index.js] [--label name]
//        [--properties 5000] [--deals 1500] [--activities 10000]
//        [--commissions 600] [--expenses 1200] [--leases 200] [--keep]
//        [--reuse dalaly_perf_<n>]
//
// --server is a built API bundle (`pnpm --filter @dalaly/server build`;
// copy server/dist/index.js aside to keep a baseline). Deals and tasks are
// written in SQL; commissions, vouchers and leases go through the API, so
// their postings are real journal entries and are timed too. Results go to
// perf-results/<label>-business.json. --keep leaves the seeded database in
// place (and prints its name) to look at query plans; --reuse measures one
// again without seeding (before and after a change). Drop it afterwards.
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
    label: { type: "string", default: "business" },
    properties: { type: "string", default: "5000" },
    deals: { type: "string", default: "1500" },
    activities: { type: "string", default: "10000" },
    commissions: { type: "string", default: "600" },
    expenses: { type: "string", default: "1200" },
    leases: { type: "string", default: "200" },
    keep: { type: "boolean", default: false },
    // A database kept by an earlier --keep run: measure only, no seeding.
    reuse: { type: "string" },
  },
});

const serverEntry = path.resolve(root, options.server);
if (!fs.existsSync(serverEntry)) throw new Error(`No API bundle at ${serverEntry}`);
const label = options.label.replace(/[^A-Za-z0-9._-]+/g, "-");
const count = (key) => Number(options[key]);
const propertyCount = count("properties");
const sizes = {
  properties: propertyCount,
  rentals: Math.round(propertyCount * 0.4),
  people: Math.round(propertyCount * 0.3),
  requests: Math.round(propertyCount * 0.1),
  documents: Math.round(propertyCount * 0.6),
  auditLogs: propertyCount * 4,
};
const business = {
  deals: count("deals"),
  activities: count("activities"),
  commissions: count("commissions"),
  expenses: count("expenses"),
  leases: count("leases"),
};
const app = {
  exe: process.execPath,
  serverEntry,
  migrations: path.join(root, "server/drizzle"),
};

const TARGETS = { list: { median: 15, p95: 50 }, report: { median: 500 }, posting: { median: 50 } };
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Baghdad",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const shiftDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const yearAgo = shiftDays(today, -364);

const results = {
  label,
  server: serverEntry,
  measuredAt: new Date().toISOString(),
  machine: { platform: process.platform, node: process.version },
  dataset: { ...sizes, ...business },
  targets: TARGETS,
};

const temporary = makeTempDir(label);
let databaseName;
let apiChild;
try {
  databaseName = options.reuse ?? (await createDatabase());
  const port = await freePort();
  if (!options.reuse) {
  apiChild = startApi(app, { databaseName, port, dataDir: temporary });
  await waitForHealth(
    port,
    (health) => health.startup_state === "SETUP_REQUIRED" && health.startup_reason === "ADMIN_REQUIRED",
  );
  await api(port, "/auth/setup-admin", { method: "POST", body: ADMIN });
  await seedDataset(databaseName, sizes);
  const { body: session } = await api(port, "/auth/login", { method: "POST", body: ADMIN });
  const token = session.token;
  const call = (pathname, method = "GET", body) => api(port, pathname, { token, method, body });

  const ids = async (sql) => (await query(databaseName, sql)).rows.map((row) => Number(row.id));
  const people = await ids("SELECT id FROM people ORDER BY id");
  const properties = await ids("SELECT id FROM properties ORDER BY id");
  const rentals = await ids("SELECT id FROM rentals ORDER BY id");
  const users = await ids(
    `INSERT INTO users(username, display_name, pin_hash)
     SELECT 'agent_' || g, 'موظف ' || g, 'x' FROM generate_series(1, 6) g RETURNING id`,
  );
  await seedDeals(databaseName, business.deals, { people, properties, rentals, users });
  await seedActivities(databaseName, business.activities, { people, users });
  console.log(`Seeded ${databaseName}`, results.dataset);

  // Money: capital, commissions on won deals and their collection,
  // expenses, client funds in and out, all through the API.
  const accounts = new Map(
    (await query(databaseName, "SELECT system_key, id FROM accounts WHERE system_key IS NOT NULL")).rows.map(
      (row) => [row.system_key, Number(row.id)],
    ),
  );
  const cash = accounts.get("cash.IQD");
  await call("/accounting/journal", "POST", {
    entry_date: yearAgo,
    currency: "IQD",
    description: "رأس المال",
    post: true,
    lines: [
      { account_id: cash, debit: "900000000000", credit: "0" },
      { account_id: accounts.get("capital.IQD"), debit: "0", credit: "900000000000" },
    ],
  });
  const won = (
    await query(
      databaseName,
      `SELECT id, client_person_id, owner_person_id,
         to_char(closed_at AT TIME ZONE 'Asia/Baghdad', 'YYYY-MM-DD') AS closed_on
       FROM deals WHERE stage = 'won' ORDER BY id LIMIT $1`,
      [business.commissions],
    )
  ).rows;
  const receipts = [];
  const timedPost = async (body) => {
    const started = performance.now();
    const { body: saved } = await call("/vouchers", "POST", body);
    receipts.push(performance.now() - started);
    return saved;
  };
  for (const [index, deal] of won.entries()) {
    const amount = 1_000_000 + (index % 10) * 100_000;
    const { body: commission } = await call("/commissions", "POST", {
      deal_id: Number(deal.id),
      payer_role: "client",
      basis: "fixed",
      amount: String(amount),
      commission_date: deal.closed_on,
      splits: [{ user_id: users[index % users.length], basis: "fixed", amount: String(amount / 4) }],
    });
    await timedPost({
      kind: "receipt",
      voucher_date: deal.closed_on,
      currency: "IQD",
      purpose: "commission",
      money_account_id: cash,
      amount: String((amount * 3) / 5),
      description: "تحصيل عمولة",
      commission_id: commission.id,
    });
    if (index % 3 === 0) {
      await call("/vouchers", "POST", {
        kind: "receipt",
        voucher_date: deal.closed_on,
        currency: "IQD",
        purpose: "client_funds",
        money_account_id: cash,
        amount: "5000000",
        description: "عربون",
        person_id: Number(deal.client_person_id),
        deal_id: Number(deal.id),
      });
      await call("/vouchers", "POST", {
        kind: "payment",
        voucher_date: deal.closed_on,
        currency: "IQD",
        purpose: "client_funds",
        money_account_id: cash,
        amount: "2500000",
        description: "تسليم عربون",
        person_id: Number(deal.owner_person_id),
        deal_id: Number(deal.id),
      });
    }
  }
  const { body: categories } = await call("/expense-categories");
  for (let index = 0; index < business.expenses; index += 1)
    await call("/vouchers", "POST", {
      kind: "payment",
      voucher_date: shiftDays(today, -(index % 360)),
      currency: "IQD",
      purpose: "expense",
      money_account_id: cash,
      amount: String(50_000 + (index % 20) * 10_000),
      description: "مصروف",
      party_name: "مورّد",
      expense_category_id: categories[index % categories.length].id,
    });

  // Leases started over the last year, half of them collected up to date.
  for (let index = 0; index < business.leases; index += 1) {
    const start = shiftDays(today, -((index * 37) % 330));
    const { body: lease } = await call("/leases", "POST", {
      rental_id: null,
      landlord_person_id: people[index % people.length],
      tenant_person_id: people[(index + 1) % people.length],
      currency: "IQD",
      rent_amount: String(500_000 + (index % 8) * 100_000),
      frequency: "monthly",
      start_date: start,
      end_date: shiftDays(start, 364),
      deposit: null,
      office_collects: true,
      notes: null,
    });
    if (index % 2) continue;
    for (const installment of lease.installments.filter((row) => row.due_date <= today))
      await timedPost({
        kind: "receipt",
        voucher_date: installment.due_date,
        currency: "IQD",
        purpose: "client_funds",
        money_account_id: cash,
        amount: installment.amount,
        description: "إيجار",
        lease_installment_id: installment.id,
      });
  }
  results.posting = { "POST /vouchers (receipt)": stats(receipts) };
  const counts = (
    await query(
      databaseName,
      `SELECT (SELECT count(*) FROM vouchers)::int AS vouchers, (SELECT count(*) FROM journal_lines)::int AS journal_lines,
         (SELECT count(*) FROM commissions)::int AS commissions, (SELECT count(*) FROM lease_installments)::int AS installments`,
    )
  ).rows[0];
  results.dataset = { ...results.dataset, ...counts };
  console.log("Money and leases", counts, results.posting);
  }

  // Statistics as a database in use has them: without, the first plans
  // after a bulk seed differ from later ones.
  await query(databaseName, "ANALYZE");
  // Restart so the API runs against the seeded data with cold caches.
  await stopProcess(apiChild);
  apiChild = startApi(app, { databaseName, port, dataDir: temporary });
  await waitForHealth(port, (health) => health.startup_state === "READY");
  const { body: fresh } = await api(port, "/auth/login", { method: "POST", body: ADMIN });
  const get = (pathname) => () => api(port, pathname, { token: fresh.token });

  const [firstWon] = (
    await query(databaseName, "SELECT id, client_person_id FROM deals WHERE stage = 'won' ORDER BY id LIMIT 1")
  ).rows;
  const dealId = Number(firstWon.id);
  const personId = Number(firstWon.client_person_id);
  const cash = Number(
    (await query(databaseName, "SELECT id FROM accounts WHERE system_key = 'cash.IQD'")).rows[0].id,
  );
  const { body: voucherPage } = await api(port, "/vouchers/paged?page=1&page_size=1&sort_by=voucher_date&sort_order=desc", { token: fresh.token });
  const { body: leasePage } = await api(port, "/leases/paged?page=1&page_size=1&sort_by=start_date&sort_order=desc", { token: fresh.token });
  const page = "page=1&page_size=25";
  const year = `from=${yearAgo}&to=${today}`;
  const lists = {
    "GET /deals/paged": `/deals/paged?${page}&sort_by=updated_at&sort_order=desc`,
    "GET /deals/paged (stalled)": `/deals/paged?${page}&sort_by=updated_at&sort_order=desc&stalled_days=14`,
    "GET /deals/pipeline": "/deals/pipeline",
    "GET /deals/:id": `/deals/${dealId}`,
    "GET /tasks/paged": `/tasks/paged?${page}`,
    "GET /tasks/paged (overdue)": `/tasks/paged?${page}&due=overdue`,
    "GET /vouchers/paged": `/vouchers/paged?${page}&sort_by=voucher_date&sort_order=desc`,
    "GET /vouchers/:id": `/vouchers/${voucherPage.items[0].id}`,
    "GET /commissions/paged": `/commissions/paged?${page}&sort_by=commission_date&sort_order=desc`,
    "GET /commissions/payable": "/commissions/payable",
    "GET /accounting/journal/paged": `/accounting/journal/paged?${page}&sort_by=entry_date&sort_order=desc`,
    "GET /cash/balances": "/cash/balances",
    "GET /finance/deals/:id": `/finance/deals/${dealId}`,
    "GET /finance/people/:id": `/finance/people/${personId}`,
    "GET /leases/paged": `/leases/paged?${page}&sort_by=start_date&sort_order=desc`,
    "GET /leases/:id": `/leases/${leasePage.items[0].id}`,
    "GET /leases/installments/overdue": `/leases/installments/overdue?${page}`,
    "GET /dashboard/alerts": "/dashboard/alerts",
  };
  const reports = {
    "GET /accounting/accounts/:id/statement": `/accounting/accounts/${cash}/statement?from=${yearAgo}`,
    "GET /dashboard/business": "/dashboard/business",
    "GET /reports/financial/trial-balance": `/reports/financial/trial-balance?${year}`,
    "GET /reports/financial/income-statement": `/reports/financial/income-statement?${year}&group=month`,
    "GET /reports/financial/balance-sheet": "/reports/financial/balance-sheet",
    "GET /reports/financial/cash-flow": `/reports/financial/cash-flow?${year}`,
    "GET /reports/financial/commissions": `/reports/financial/commissions?${year}`,
    "GET /reports/financial/receivables": "/reports/financial/receivables",
    "GET /reports/financial/payables": "/reports/financial/payables",
    "GET /reports/operations/deals": `/reports/operations/deals?${year}`,
    "GET /reports/operations/customers": `/reports/operations/customers?${year}`,
    "GET /reports/operations/listings (sale)": `/reports/operations/listings?kind=sale&${year}`,
    "GET /reports/operations/listings (rental)": `/reports/operations/listings?kind=rental&${year}`,
    "GET /reports/operations/leases": `/reports/operations/leases?${year}`,
  };
  results.lists = {};
  for (const [name, pathname] of Object.entries(lists)) {
    results.lists[name] = await timeRequests(get(pathname), { warmup: 3, count: 30 });
    report(name, results.lists[name], TARGETS.list);
  }
  results.reports = {};
  for (const [name, pathname] of Object.entries(reports)) {
    results.reports[name] = await timeRequests(get(pathname), { warmup: 2, count: 10 });
    report(name, results.reports[name], TARGETS.report);
  }
  if (results.posting)
    report("POST /vouchers (receipt)", results.posting["POST /vouchers (receipt)"], TARGETS.posting);
} finally {
  await stopProcess(apiChild);
  if (databaseName && !options.keep && !options.reuse) await dropDatabase(databaseName);
  else if (databaseName) console.log(`Kept ${databaseName}`);
  fs.rmSync(temporary, { recursive: true, force: true });
}

const outDir = path.join(root, "perf-results");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${label}-business.json`);
fs.writeFileSync(outFile, `${JSON.stringify(results, null, 2)}\n`);
console.log(`Wrote ${outFile}`);

/** One line per request: its median and p95, and whether it meets its target. */
function report(name, result, target) {
  const met =
    result.median <= target.median && (target.p95 === undefined || result.p95 <= target.p95);
  console.log(
    `${met ? "ok  " : "SLOW"} ${name.padEnd(46)} median ${String(result.median).padStart(7)} ms  p95 ${String(result.p95).padStart(7)} ms`,
  );
}

/**
 * Deals over the last year, deterministic: every stage, sale and rent,
 * spread over six employees; the closed ones with their closing date.
 */
async function seedDeals(databaseName, total, { people, properties, rentals, users }) {
  await query(
    databaseName,
    `INSERT INTO deals(code, deal_type, stage, client_person_id, owner_person_id, property_id, rental_id,
       assigned_user_id, currency, expected_commission, agreed_price, lost_reason,
       created_at, stage_changed_at, closed_at)
     SELECT 'D-P' || lpad(g::text, 6, '0'), kind, stage,
       ($1::bigint[])[1 + g % cardinality($1::bigint[])],
       ($1::bigint[])[1 + (g + 1) % cardinality($1::bigint[])],
       CASE WHEN kind = 'sale' THEN ($2::bigint[])[1 + g % cardinality($2::bigint[])] END,
       CASE WHEN kind = 'rent' THEN ($3::bigint[])[1 + g % cardinality($3::bigint[])] END,
       ($4::bigint[])[1 + g % cardinality($4::bigint[])], 'IQD', 2000000 + (g % 10) * 100000,
       CASE WHEN stage IN ('agreed', 'won') THEN 150000000 + (g % 50) * 1000000 END,
       CASE WHEN stage = 'lost' THEN (ARRAY['السعر', 'الموقع', 'التمويل'])[1 + g % 3] END,
       created, changed, CASE WHEN stage IN ('won', 'lost', 'cancelled') THEN changed END
     FROM (
       SELECT g, CASE WHEN g % 4 = 0 THEN 'rent' ELSE 'sale' END AS kind,
         (ARRAY['new', 'contacted', 'qualified', 'viewing_scheduled', 'viewing_done', 'negotiating',
                'agreed', 'won', 'won', 'lost', 'cancelled', 'won'])[1 + g % 12] AS stage,
         now() - make_interval(days => 1 + g % 360) AS created,
         least(now(), now() - make_interval(days => 1 + g % 360) + make_interval(days => g % 30)) AS changed
       FROM generate_series(1, $5::int) g
     ) d`,
    [people, properties, rentals, users, total],
  );
}

/** Tasks on customers: two in three done, the rest open around today. */
async function seedActivities(databaseName, total, { people, users }) {
  await query(
    databaseName,
    `INSERT INTO activities(user_id, assigned_user_id, type, notes, person_id, status, scheduled_at, created_at, completed_at)
     SELECT ($2::bigint[])[1 + g % cardinality($2::bigint[])], ($2::bigint[])[1 + (g + 2) % cardinality($2::bigint[])],
       (ARRAY['phone_call', 'meeting', 'message', 'visit', 'negotiation', 'task'])[1 + g % 6], 'مهمة',
       ($1::bigint[])[1 + g % cardinality($1::bigint[])],
       CASE WHEN g % 3 = 0 THEN 'open' ELSE 'done' END,
       now() + make_interval(days => g % 40 - 20),
       now() - make_interval(days => g % 300),
       CASE WHEN g % 3 <> 0 THEN now() - make_interval(days => g % 300) END
     FROM generate_series(1, $3::int) g`,
    [people, users, total],
  );
}
