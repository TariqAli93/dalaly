import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import pg from "pg";
import { buildPoolConfig, config } from "../src/infrastructure/config.js";
import { pool, reconfigurePool } from "../src/infrastructure/database/pool.js";
import { runDatabaseMigrations } from "../src/infrastructure/database/run-migrations.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { exportBackup, restoreBackup } from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* databases.
// Follow-ups are tasks (status, assignee, priority, outcome), customers have
// activities, and the tasks list unions them by the caller's permissions
// (Phase 2a).

const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

test("migration 0005 makes past follow-ups history and keeps future ones open", async () => {
  const name = `dalaly_removal_test_${Date.now()}_upgrade`;
  const admin = new pg.Pool(buildPoolConfig());
  await admin.query(`CREATE DATABASE "${name}"`);
  const root = path.resolve(`data/removal-tests/${name}`);
  try {
    const url = new URL(
      `postgresql://${encodeURIComponent(config.db.user)}:${encodeURIComponent(config.db.password)}@${config.db.host}:${config.db.port}/${name}`,
    );
    await reconfigurePool(url.toString());
    // The migrations of the release before this one: 0000-0004.
    const before = path.join(root, "drizzle");
    fs.mkdirSync(path.join(before, "meta"), { recursive: true });
    const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
    const previous = journal.entries.filter((entry: { tag: string }) => entry.tag < "0005");
    for (const entry of previous)
      fs.copyFileSync(`drizzle/${entry.tag}.sql`, path.join(before, `${entry.tag}.sql`));
    fs.writeFileSync(path.join(before, "meta/_journal.json"), JSON.stringify({ ...journal, entries: previous }));
    await runDatabaseMigrations(before);

    const property = (
      await pool.query(
        "INSERT INTO properties(code,property_type,legal_type,area_value,area_unit,pricing_method,total_price,owner_name,owner_phone) VALUES('UP-1','بيت','طابو',100,'متر','total',1,'م','0770') RETURNING id",
      )
    ).rows[0].id;
    const insert = async (scheduled: string | null) =>
      Number(
        (
          await pool.query(
            "INSERT INTO property_followups(property_id,type,notes,scheduled_at,created_at) VALUES($1,'phone_call','x',$2,now() - interval '10 days') RETURNING id",
            [property, scheduled],
          )
        ).rows[0].id,
      );
    const logged = await insert(null);
    const past = await insert(iso(-3 * DAY));
    const upcoming = await insert(iso(3 * DAY));

    await runDatabaseMigrations(path.resolve("drizzle"));
    const rows = new Map(
      (
        await pool.query(
          "SELECT id, status, completed_at, scheduled_at, created_at, updated_at, priority FROM property_followups",
        )
      ).rows.map((row) => [Number(row.id), row]),
    );
    assert.equal(rows.get(logged).status, "done");
    assert.deepEqual(rows.get(logged).completed_at, rows.get(logged).created_at);
    assert.equal(rows.get(past).status, "done");
    assert.deepEqual(rows.get(past).completed_at, rows.get(past).scheduled_at);
    assert.equal(rows.get(upcoming).status, "open");
    assert.equal(rows.get(upcoming).completed_at, null);
    for (const row of rows.values()) {
      assert.equal(row.priority, "normal");
      assert.deepEqual(row.updated_at, row.created_at, "updated_at keeps the row's own time");
    }
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("follow-ups and activities are tasks, listed by permission", async (t) => {
  const ctx = await removalTestContext("crmtasks");
  try {
    const call = (
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url: string,
      body?: unknown,
      token = ctx.token,
    ) =>
      ctx.app.inject({
        method,
        url,
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
      });
    const ok = async (method: "GET" | "POST" | "PUT" | "PATCH", url: string, body?: unknown, token = ctx.token) => {
      const result = await call(method, url, body, token);
      assert.ok(result.statusCode < 300, `${method} ${url}: ${result.statusCode} ${result.body}`);
      return result.json();
    };
    async function userWith(username: string, keys: string[], active = true) {
      const role = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [`role_${username}`])).rows[0];
      await pool.query(
        "INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = ANY($2)",
        [role.id, keys],
      );
      const user = (
        await pool.query("INSERT INTO users(username, display_name, pin_hash, is_active) VALUES($1, $1, $2, $3) RETURNING id", [
          username,
          await hashPin("5678"),
          active,
        ])
      ).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      return { id: Number(user.id), token: active ? (await login(username, "5678"))!.token : "" };
    }
    const [owner, customer] = ctx.people;
    const sale = `/api/properties/${ctx.property.id}/followups`;
    const rental = `/api/rentals/${ctx.rental.id}/followups`;

    let saleTask: { id: number };
    await t.test("a follow-up without a date is done; one with a date is an open task", async () => {
      const logged = await ok("POST", sale, { type: "phone_call", notes: "اتصل بالمالك" });
      assert.equal(logged.status, "done");
      assert.ok(logged.completed_at);
      assert.equal(logged.property_id, ctx.property.id, "the response is the listed shape, snake_case");
      saleTask = await ok("POST", sale, {
        type: "visit",
        notes: "معاينة مع زبون",
        scheduled_at: iso(DAY),
        person_id: customer.id,
        assigned_user_id: ctx.adminId,
        priority: "high",
      });
      const listed = ((await ok("GET", sale)) as Array<Record<string, unknown>>).find((row) => row.id === saleTask.id)!;
      assert.equal(listed.status, "open");
      assert.equal(listed.completed_at, null);
      assert.equal(listed.person_name, customer.full_name);
      assert.equal(listed.assigned_user_name, "removal_admin");
      assert.equal(listed.priority, "high");
    });

    await t.test("an older client's edit keeps the task fields it does not send", async () => {
      const edited = await ok("PUT", `${sale}/${saleTask.id}`, { type: "visit", notes: "موعد جديد", scheduled_at: iso(2 * DAY) });
      assert.equal(edited.person_id, customer.id);
      assert.equal(edited.assigned_user_id, ctx.adminId);
      assert.equal(edited.priority, "high");
      assert.equal(edited.notes, "موعد جديد");
    });

    await t.test("a stale customer or an inactive assignee is refused in Arabic", async () => {
      const inactive = await userWith("left_office", ["followups.read"], false);
      const missing = await call("POST", sale, { type: "other", person_id: 987654 });
      assert.equal(missing.statusCode, 400);
      assert.equal(missing.json().message, "الزبون المحدد غير موجود.");
      const gone = await call("POST", sale, { type: "other", assigned_user_id: inactive.id });
      assert.equal(gone.statusCode, 400);
      assert.equal(gone.json().message, "الموظف المكلَّف غير موجود أو غير نشط.");
      assert.equal((await call("POST", sale, { type: "other", status: "finished" })).statusCode, 400);
    });

    let activity: { id: number };
    await t.test("a customer's activity may name one of their requests, not someone else's", async () => {
      const request = await ok("POST", "/api/purchase-requests", { person_id: customer.id, property_type: "بيت" });
      const othersRequest = await ok("POST", "/api/purchase-requests", { person_id: owner.id, property_type: "بيت" });
      const refused = await call("POST", "/api/activities", {
        person_id: customer.id,
        purchase_request_id: othersRequest.id,
        type: "meeting",
      });
      assert.equal(refused.statusCode, 400);
      assert.equal(refused.json().message, "الطلب المحدد ليس من طلبات هذا الزبون.");
      activity = await ok("POST", "/api/activities", {
        person_id: customer.id,
        purchase_request_id: request.id,
        type: "meeting",
        notes: "اجتماع",
        scheduled_at: iso(-2 * DAY),
      });
      const [listed] = await ok("GET", `/api/activities?person_id=${customer.id}`);
      assert.equal(listed.purchase_request_code, request.code);
      assert.equal(listed.status, "open");
    });

    await t.test("the tasks list filters by status, due date, assignee and customer", async () => {
      await ok("POST", rental, { type: "message", scheduled_at: iso(5 * 60_000) });
      const page = async (query: string) =>
        (await ok("GET", `/api/tasks/paged?page=1&page_size=50&${query}`)) as {
          items: Array<{ source: string; id: number; overdue: boolean; status: string }>;
          total: number;
        };
      const open = await page("status=open");
      assert.deepEqual(
        open.items.map((item) => item.source).sort(),
        ["activity", "rental_followup", "sale_followup"],
      );
      const overdue = await page("status=overdue");
      assert.deepEqual(overdue.items.map((item) => [item.source, item.id]), [["activity", activity.id]]);
      assert.equal(overdue.items[0].overdue, true);
      assert.equal((await page("assigned=me")).items.length, 1, "assigned to the admin: the sale viewing");
      assert.equal((await page("due=today")).items.length, 1, "the rental message in five minutes");
      assert.equal((await page(`person_id=${customer.id}&status=all`)).total, 2);
      const done = await page("status=done&sort_by=created_at&sort_order=desc");
      assert.ok(done.items.every((item) => item.status === "done"));
      assert.equal((await page("q=موعد")).items.length, 1);
    });

    await t.test("each source is listed only with its permissions", async () => {
      const rentalsOnly = await userWith("rentals_only", ["rentals.read", "rentals.followups.read"]);
      const followupsNoPeople = await userWith("no_people", ["followups.read", "properties.read"]);
      const sources = async (token: string) =>
        [...new Set(((await ok("GET", "/api/tasks/paged?status=all&page_size=50", undefined, token)).items as Array<{ source: string }>).map((item) => item.source))].sort();
      assert.deepEqual(await sources(rentalsOnly.token), ["rental_followup"]);
      assert.deepEqual(await sources(followupsNoPeople.token), ["sale_followup"], "activities need people.read");
      const nothing = await userWith("nothing", ["people.read"]);
      assert.equal((await ok("GET", "/api/tasks/paged", undefined, nothing.token)).total, 0);
      assert.equal((await call("GET", "/api/tasks/assignees", undefined, nothing.token)).statusCode, 403);
      assert.equal(
        (await call("PATCH", `/api/tasks/sale_followup/${saleTask.id}`, { status: "done" }, rentalsOnly.token)).statusCode,
        403,
        "changing a sale follow-up needs followups.update",
      );
    });

    await t.test("completing, reopening and rescheduling keep completed_at right", async () => {
      const done = await ok("PATCH", `/api/tasks/activity/${activity.id}`, { status: "done", outcome: "اتفقنا على معاينة" });
      assert.equal(done.status, "done");
      assert.ok(done.completed_at);
      assert.equal(done.outcome, "اتفقنا على معاينة");
      const again = await ok("PATCH", `/api/tasks/activity/${activity.id}`, { status: "done" });
      assert.equal(again.completed_at, done.completed_at, "completing again keeps the first time");
      const reopened = await ok("PATCH", `/api/tasks/activity/${activity.id}`, { status: "open", scheduled_at: iso(DAY) });
      assert.equal(reopened.completed_at, null);
      assert.equal(reopened.overdue, false);
      assert.equal((await call("PATCH", "/api/tasks/activity/987654", { status: "done" })).statusCode, 404);
      assert.equal((await call("PATCH", `/api/tasks/nothing/${activity.id}`, { status: "done" })).statusCode, 400);
      const assignees = (await ok("GET", "/api/tasks/assignees")) as Array<{ id: number }>;
      assert.ok(assignees.some((user) => user.id === ctx.adminId));
      assert.ok(!assignees.some((user) => user.id === undefined));
    });

    await t.test("the customer timeline sums up contact and what is due", async () => {
      const timeline = await ok("GET", `/api/people/${customer.id}/timeline`);
      assert.equal(timeline.total, 2);
      assert.equal(timeline.open_count, 2);
      assert.equal(timeline.overdue_count, 0);
      assert.ok(timeline.next_followup_at);
      assert.equal((await call("GET", "/api/people/987654/timeline")).statusCode, 404);
    });

    await t.test("the dashboard leaves out cancelled appointments and viewings with an outcome", async () => {
      const overview = async () => ok("GET", "/api/dashboard/overview?stale_days=30");
      const before = (await overview()).appointments.next_days;
      const cancelled = await ok("POST", sale, { type: "phone_call", scheduled_at: iso(DAY) });
      assert.equal((await overview()).appointments.next_days, before + 1);
      await ok("PATCH", `/api/tasks/sale_followup/${cancelled.id}`, { status: "cancelled" });
      assert.equal((await overview()).appointments.next_days, before);

      // On a listing of its own: any later follow-up there would count as its outcome.
      const quiet = (
        await pool.query(
          "INSERT INTO properties(code,property_type,legal_type,area_value,area_unit,pricing_method,total_price,owner_name,owner_phone) VALUES('CT-V','بيت','طابو',100,'متر','total',1,'م','0770') RETURNING id",
        )
      ).rows[0].id;
      const viewing = await ok("POST", `/api/properties/${quiet}/followups`, { type: "visit", scheduled_at: iso(-DAY), status: "open" });
      await pool.query("UPDATE property_followups SET created_at = now() - interval '2 days' WHERE id = $1", [viewing.id]);
      const pending = async () =>
        ((await overview()).viewings_without_outcome.items as Array<{ id: number }>).some((item) => item.id === viewing.id);
      assert.equal(await pending(), true);
      await ok("PATCH", `/api/tasks/sale_followup/${viewing.id}`, { status: "done", outcome: "لم يعجبه الموقع" });
      assert.equal(await pending(), false);
    });

    await t.test("a customers-only restore keeps the links to customers", async () => {
      await pool.query("UPDATE properties SET owner_person_id = $1 WHERE id = $2", [owner.id, ctx.property.id]);
      const archive = path.join(ctx.root, "crm.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      await restoreBackup(archive, "crm", ctx.adminId);
      const property = (await pool.query("SELECT owner_person_id FROM properties WHERE id = $1", [ctx.property.id])).rows[0];
      assert.equal(Number(property.owner_person_id), owner.id, "the listing still has its owner");
      const followup = (await pool.query("SELECT person_id FROM property_followups WHERE id = $1", [saleTask.id])).rows[0];
      assert.equal(Number(followup.person_id), customer.id, "the follow-up still names its customer");
      assert.equal(Number((await pool.query("SELECT count(*) FROM activities")).rows[0].count), 1);
    });

    await t.test("follow-ups from an archive written before tasks get their status", async () => {
      const archive = path.join(ctx.root, "full.zip");
      assert.equal((await exportBackup(archive, ctx.adminId)).ok, true);
      const zip = new AdmZip(archive);
      const data = JSON.parse(zip.readAsText("data.json"));
      const strip = (rows: Array<Record<string, unknown>>) =>
        rows.map(({ status, priority, completedAt, outcome, updatedAt, personId, assignedUserId, ...row }) => {
          void [status, priority, completedAt, outcome, updatedAt, personId, assignedUserId];
          return row;
        });
      data.property_followups = strip(data.property_followups);
      data.rental_followups = strip(data.rental_followups);
      delete data.activities;
      zip.updateFile("data.json", Buffer.from(JSON.stringify(data)));
      const old = path.join(ctx.root, "old.zip");
      zip.writeZip(old);
      await restoreBackup(old, "full", ctx.adminId);
      const rows = (
        await pool.query("SELECT status, completed_at, scheduled_at FROM property_followups ORDER BY id")
      ).rows;
      assert.ok(rows.length >= 4);
      for (const row of rows) {
        const upcoming = row.scheduled_at && row.scheduled_at > new Date();
        assert.equal(row.status, upcoming ? "open" : "done", JSON.stringify(row));
        assert.equal(row.completed_at === null, Boolean(upcoming));
      }
      assert.equal(Number((await pool.query("SELECT count(*) FROM activities")).rows[0].count), 0, "absent from the archive: restored empty");
    });
  } finally {
    await ctx.close();
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});
