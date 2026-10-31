import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  OFFICE_TODAY,
  rawRows,
  type RawRow,
} from "../../infrastructure/database/raw-query.js";
import {
  activities,
  propertyFollowups,
  rentalFollowups,
  users,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { pageOffset } from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import type { AuthUser } from "../auth/auth.service.js";
import { assertTaskLinks } from "./tasks.links.js";
import {
  completedAtFor,
  normalizeScheduledAt,
  type TaskPageQuery,
  type TaskPatch,
  type TaskSource,
  type TaskStatus,
} from "./tasks.schema.js";

/**
 * The tasks read model: listing follow-ups and customer activities as one
 * list. Each source is included only when the caller may read it (and the
 * records it belongs to); writes go back to the source's own table.
 */

type SourceSpec = {
  table: SQL;
  /** Permissions needed to read this source, all of them. */
  read: string[];
  update: string[];
  listing: SQL;
};

const SOURCES: Record<TaskSource, SourceSpec> = {
  sale_followup: {
    table: sql.raw("property_followups"),
    read: ["followups.read", "properties.read"],
    update: ["followups.update", "properties.read"],
    listing: sql.raw(
      "t.property_id, NULL::bigint AS rental_id, NULL::bigint AS purchase_request_id, NULL::bigint AS rental_request_id",
    ),
  },
  rental_followup: {
    table: sql.raw("rental_followups"),
    read: ["rentals.followups.read", "rentals.read"],
    update: ["rentals.followups.update", "rentals.read"],
    listing: sql.raw(
      "NULL::bigint AS property_id, t.rental_id, NULL::bigint AS purchase_request_id, NULL::bigint AS rental_request_id",
    ),
  },
  activity: {
    table: sql.raw("activities"),
    read: ["followups.read", "people.read"],
    update: ["followups.update", "people.read"],
    listing: sql.raw(
      "NULL::bigint AS property_id, NULL::bigint AS rental_id, t.purchase_request_id, t.rental_request_id",
    ),
  },
};

const has = (user: AuthUser, keys: string[]) =>
  keys.every((key) => user.permissions.some((item) => item.key === key));

/** The sources this user may read, in a fixed order. */
export function readableSources(user: AuthUser) {
  return (Object.keys(SOURCES) as TaskSource[]).filter((source) =>
    has(user, SOURCES[source].read),
  );
}

function union(sources: TaskSource[], where: SQL) {
  return sql.join(
    sources.map(
      (source) => sql`SELECT ${source}::text AS source, t.id, t.type, t.notes,
          t.scheduled_at, t.status, t.priority, t.completed_at, t.outcome,
          t.created_at, t.updated_at, t.user_id, t.assigned_user_id, t.person_id,
          ${SOURCES[source].listing}
        FROM ${SOURCES[source].table} t WHERE ${where}`,
    ),
    sql` UNION ALL `,
  );
}

const PRIORITY_RANK = sql`CASE x.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`;

function conditions(query: TaskPageQuery, userId: number): SQL {
  const where: SQL[] = [sql`true`];
  if (query.status === "overdue")
    where.push(sql`t.status = 'open' AND t.scheduled_at < now()`);
  else if (query.status !== "all") where.push(sql`t.status = ${query.status}`);
  if (query.assigned === "me") where.push(sql`t.assigned_user_id = ${userId}`);
  else if (query.assigned === "unassigned")
    where.push(sql`t.assigned_user_id IS NULL`);
  else if (typeof query.assigned === "number")
    where.push(sql`t.assigned_user_id = ${query.assigned}`);
  if (query.due === "today")
    where.push(
      sql`t.scheduled_at >= ${OFFICE_TODAY} AND t.scheduled_at < ${OFFICE_TODAY} + interval '1 day'`,
    );
  else if (query.due === "week")
    where.push(
      sql`t.scheduled_at >= ${OFFICE_TODAY} AND t.scheduled_at < ${OFFICE_TODAY} + interval '7 days'`,
    );
  else if (query.due === "overdue")
    where.push(sql`t.status = 'open' AND t.scheduled_at < now()`);
  else if (query.due === "none") where.push(sql`t.scheduled_at IS NULL`);
  if (query.person_id) where.push(sql`t.person_id = ${query.person_id}`);
  if (query.type) where.push(sql`t.type = ${query.type}`);
  if (query.q) {
    const pattern = containsPattern(query.q);
    where.push(sql`(t.notes ILIKE ${pattern} OR t.outcome ILIKE ${pattern})`);
  }
  return sql.join(where, sql` AND `);
}

function orderBy(query: TaskPageQuery) {
  const direction = sql.raw(query.sort_order === "desc" ? "DESC" : "ASC");
  const key =
    query.sort_by === "priority"
      ? PRIORITY_RANK
      : sql.raw(`x.${query.sort_by}`);
  // Tasks without a date go last whichever way the list is sorted.
  return sql`${key} ${direction} NULLS LAST, x.source, x.id`;
}

export type TaskRow = ReturnType<typeof taskRow>;

function taskRow(row: RawRow) {
  const id = (value: unknown) => (value == null ? null : Number(value));
  return {
    source: row.source as TaskSource,
    id: Number(row.id),
    type: row.type as string,
    notes: (row.notes as string | null) ?? null,
    scheduled_at: (row.scheduled_at as Date | null) ?? null,
    status: row.status as TaskStatus,
    priority: row.priority as string,
    overdue: Boolean(row.overdue),
    completed_at: (row.completed_at as Date | null) ?? null,
    outcome: (row.outcome as string | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    user_name: (row.user_name as string | null) ?? null,
    assigned_user_id: id(row.assigned_user_id),
    assigned_user_name: (row.assigned_user_name as string | null) ?? null,
    person_id: id(row.person_id),
    person_name: (row.person_name as string | null) ?? null,
    property_id: id(row.property_id),
    rental_id: id(row.rental_id),
    listing_code: (row.listing_code as string | null) ?? null,
    listing_name: (row.listing_name as string | null) ?? null,
    purchase_request_id: id(row.purchase_request_id),
    rental_request_id: id(row.rental_request_id),
    request_code: (row.request_code as string | null) ?? null,
  };
}

/**
 * Tasks of `sources` matching `where`, with their names. With a page, the
 * page is cut (and the total counted) before the names are joined, so only
 * its rows are looked up, not every matching task (docs/PERFORMANCE.md).
 */
function taskQuery(
  sources: TaskSource[],
  where: SQL,
  page?: { order: SQL; limit: number; offset: number },
) {
  const matching = page
    ? sql`SELECT x.*, count(*) OVER () AS total FROM (${union(sources, where)}) x
        ORDER BY ${page.order} LIMIT ${page.limit} OFFSET ${page.offset}`
    : sql`SELECT x.*, 1 AS total FROM (${union(sources, where)}) x`;
  return rawRows(sql`SELECT x.*,
      (x.status = 'open' AND x.scheduled_at < now()) AS overdue,
      p.full_name AS person_name,
      au.display_name AS assigned_user_name, cu.username AS user_name,
      coalesce(pr.code, r.code) AS listing_code,
      coalesce(pr.name, 'عقار ' || pr.code, r.name, 'إيجار ' || r.code) AS listing_name,
      coalesce(preq.code, rreq.code) AS request_code
    FROM (${matching}) x
    LEFT JOIN people p ON p.id = x.person_id
    LEFT JOIN users au ON au.id = x.assigned_user_id
    LEFT JOIN users cu ON cu.id = x.user_id
    LEFT JOIN properties pr ON pr.id = x.property_id
    LEFT JOIN rentals r ON r.id = x.rental_id
    LEFT JOIN purchase_requests preq ON preq.id = x.purchase_request_id
    LEFT JOIN rental_requests rreq ON rreq.id = x.rental_request_id
    ${page ? sql`ORDER BY ${page.order}` : sql``}`);
}

/** One page of the tasks the user may read, with the matching total. */
export async function listTasksPage(query: TaskPageQuery, user: AuthUser) {
  const sources = readableSources(user).filter(
    (source) => !query.source || source === query.source,
  );
  const rows = sources.length
    ? await taskQuery(sources, conditions(query, user.id), {
        order: orderBy(query),
        limit: query.page_size,
        offset: pageOffset(query.page, query.page_size),
      })
    : [];
  return {
    items: rows.map(taskRow),
    total: Number(rows[0]?.total ?? 0),
    page: query.page,
    page_size: query.page_size,
  };
}

async function getTask(source: TaskSource, id: number) {
  const [row] = await taskQuery([source], sql`t.id = ${id}`);
  return row ? taskRow(row) : null;
}

/**
 * A customer's timeline: every task and interaction linked to them, newest
 * first, with when they were last contacted and what is due next.
 */
export async function personTimeline(personId: number, user: AuthUser) {
  const sources = readableSources(user);
  const page = await listTasksPage(
    {
      page: 1,
      page_size: 100,
      sort_by: "created_at",
      sort_order: "desc",
      status: "all",
      person_id: personId,
    },
    user,
  );
  if (!sources.length)
    return {
      items: page.items,
      total: 0,
      last_interaction_at: null,
      next_followup_at: null,
      open_count: 0,
      overdue_count: 0,
    };
  const [summary] = await rawRows(sql`SELECT
      max(coalesce(x.completed_at, x.created_at)) FILTER (WHERE x.status = 'done') AS last_interaction_at,
      min(x.scheduled_at) FILTER (WHERE x.status = 'open' AND x.scheduled_at >= now()) AS next_followup_at,
      count(*) FILTER (WHERE x.status = 'open')::int AS open_count,
      count(*) FILTER (WHERE x.status = 'open' AND x.scheduled_at < now())::int AS overdue_count
    FROM (${union(sources, sql`t.person_id = ${personId}`)}) x`);
  return {
    items: page.items,
    total: page.total,
    last_interaction_at: (summary?.last_interaction_at as Date | null) ?? null,
    next_followup_at: (summary?.next_followup_at as Date | null) ?? null,
    open_count: Number(summary?.open_count ?? 0),
    overdue_count: Number(summary?.overdue_count ?? 0),
  };
}

/** Active users a task can be given to (any caller who may handle tasks). */
export async function listAssignees() {
  return db
    .select({ id: users.id, display_name: users.displayName })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(users.displayName);
}

const TABLES = {
  sale_followup: propertyFollowups,
  rental_followup: rentalFollowups,
  activity: activities,
} as const;

/**
 * Completes, reopens, cancels, reschedules or reassigns one task in its own
 * table. Returns null when there is no such task.
 */
export async function patchTask(
  source: TaskSource,
  id: number,
  patch: TaskPatch,
  user: AuthUser,
) {
  if (!has(user, SOURCES[source].update))
    throw new DomainError(
      403,
      "ليست لديك صلاحية تنفيذ هذه العملية.",
      "FORBIDDEN",
    );
  await assertTaskLinks(patch);
  const table = TABLES[source];
  const [current] = await db
    .select({ status: table.status, completedAt: table.completedAt })
    .from(table)
    .where(eq(table.id, id));
  if (!current) return null;
  const status = (patch.status ?? current.status) as TaskStatus;
  await db
    .update(table)
    .set({
      status,
      completedAt: completedAtFor(status, current),
      ...(patch.priority === undefined ? {} : { priority: patch.priority }),
      ...(patch.outcome === undefined ? {} : { outcome: patch.outcome }),
      ...(patch.scheduled_at === undefined
        ? {}
        : { scheduledAt: normalizeScheduledAt(patch.scheduled_at) }),
      ...(patch.assigned_user_id === undefined
        ? {}
        : { assignedUserId: patch.assigned_user_id }),
      updatedAt: new Date(),
    })
    .where(eq(table.id, id));
  return getTask(source, id);
}
