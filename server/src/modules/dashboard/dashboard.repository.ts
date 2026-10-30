import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  lt,
  ne,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  auditLogs,
  properties,
  rentals,
  users,
} from "../../infrastructure/database/schema.js";
import { toApiObjects } from "../../shared/utils/case.js";
import { listUpcomingReminders } from "../followups/followups.repository.js";

const REVIEW_DAYS = 30;
const activityMonths = sql`generate_series(
  date_trunc('month', current_timestamp at time zone 'Asia/Baghdad') - interval '5 months',
  date_trunc('month', current_timestamp at time zone 'Asia/Baghdad'),
  interval '1 month'
) as activity_months(month)`;

/**
 * What the caller may see beyond properties (the route requires
 * properties.read). Sections without permission keep their shape but are
 * empty, and their queries are skipped.
 */
export type DashboardAccess = {
  rentals: boolean;
  audit: boolean;
  followups: boolean;
};

const PROPERTY_STATUSES = [
  "available",
  "reserved",
  "negotiating",
  "sold",
  "rented",
  "archived",
] as const;
const RENTAL_STATUSES = [
  "available",
  "reserved",
  "negotiating",
  "rented",
  "archived",
] as const;

/** `count(*) filter (where <column> = <status>)` for each status, by name. */
function statusCounts<S extends string>(
  column: AnyPgColumn,
  statuses: readonly S[],
) {
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      sql<number>`count(*) filter (where ${column} = ${status})::int`,
    ]),
  ) as Record<S, SQL<number>>;
}

/**
 * Rows created in each of the last six months (Baghdad time), months
 * without any included: the table is read once and grouped by month, then
 * joined to the month series.
 */
function monthlyActivity(table: PgTable, createdAt: AnyPgColumn, where?: SQL) {
  // Drizzle names a subquery's computed columns without the subquery's
  // alias, so they must not clash with activity_months.month.
  const created = db
    .select({
      month:
        sql`date_trunc('month', ${createdAt} at time zone 'Asia/Baghdad')`.as(
          "created_month",
        ),
      count: sql<number>`count(*)`.as("created_count"),
    })
    .from(table)
    .where(
      and(
        where,
        gte(
          createdAt,
          sql`(date_trunc('month', current_timestamp at time zone 'Asia/Baghdad') - interval '5 months') at time zone 'Asia/Baghdad'`,
        ),
      ),
    )
    .groupBy(sql`1`)
    .as("created_by_month");
  return db
    .select({
      month: sql<string>`to_char(activity_months.month, 'YYYY-MM')`,
      created: sql<number>`coalesce(${created.count}, 0)::int`,
    })
    .from(activityMonths)
    .leftJoin(created, sql`${created.month} = activity_months.month`)
    .orderBy(asc(sql`activity_months.month`));
}

/**
 * How many of the summary's queries run at once, each on its own pool
 * connection. Two is about as fast as any wider setting on a warm pool, and
 * after an idle pause every extra connection is a new PostgreSQL backend,
 * which on Windows starts one at a time (docs/PERFORMANCE.md, "Pool,
 * statement timeout and dashboard").
 */
export const QUERY_WIDTH = 2;

/**
 * Runs the tasks at most `width` at a time, in the order given, and returns
 * their results by name. After a failure no further task starts.
 */
export async function inParallel<
  T extends Record<string, () => PromiseLike<unknown>>,
>(
  width: number,
  tasks: T,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const entries = Object.entries(tasks);
  const results: Record<string, unknown> = {};
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, entries.length) }, async () => {
      while (next < entries.length) {
        const [name, task] = entries[next++];
        try {
          results[name] = await task();
        } catch (error) {
          next = entries.length;
          throw error;
        }
      }
    }),
  );
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
}

/**
 * The summary's independent queries, slowest first so the two running at a
 * time finish together, with one aggregate per table for the status counts
 * and money figures.
 */
export async function getDashboard(access: DashboardAccess) {
  const cutoff = new Date(Date.now() - REVIEW_DAYS * 24 * 60 * 60 * 1000);
  const live = ne(properties.status, "archived");
  const {
    totals: [summaryRow],
    salesByTypeRows,
    salesActivityRows,
    latestRows,
    topGovernorates,
    topDistricts,
    needsReviewRows,
    rentalSummary,
    recentActivity,
    reminders,
  } = await inParallel(QUERY_WIDTH, {
    salesActivityRows: () =>
      monthlyActivity(properties, properties.createdAt, live),
    rentalSummary: async () =>
      access.rentals ? getRentalSummary() : emptyRentalSummary(),
    // Audit rows carry usernames and history; only audit.read may see them.
    recentActivity: async () => (access.audit ? getRecentActivity() : []),
    totals: () =>
      db
        .select({
          total: sql<number>`count(*)::int`,
          ...statusCounts(properties.status, PROPERTY_STATUSES),
          total_value: sql<string>`coalesce(sum(${properties.totalPrice}) filter (where ${live}), 0)`,
          avg_price: sql<string>`coalesce(avg(${properties.totalPrice}) filter (where ${live}), 0)`,
          max_price: sql<string>`coalesce(max(${properties.totalPrice}) filter (where ${live}), 0)`,
          min_price: sql<string>`coalesce(min(${properties.totalPrice}) filter (where ${live}), 0)`,
        })
        .from(properties),
    needsReviewRows: () =>
      db
        .select()
        .from(properties)
        .where(
          and(
            notInArray(properties.status, ["archived", "sold", "rented"]),
            lt(properties.updatedAt, cutoff),
          ),
        )
        .orderBy(asc(properties.updatedAt))
        .limit(15),
    topGovernorates: () =>
      db
        .select({
          name: properties.governorate,
          count: sql<number>`count(*)::int`,
        })
        .from(properties)
        .where(and(live, isNotNull(properties.governorate)))
        .groupBy(properties.governorate)
        .orderBy(desc(sql`count(*)`))
        .limit(6),
    salesByTypeRows: () =>
      db
        .select({
          name: properties.propertyType,
          count: sql<number>`count(*)::int`,
        })
        .from(properties)
        .where(live)
        .groupBy(properties.propertyType)
        .orderBy(desc(sql`count(*)`), asc(properties.propertyType)),
    latestRows: () =>
      db
        .select()
        .from(properties)
        .orderBy(desc(properties.createdAt), desc(properties.id))
        .limit(10),
    reminders: async () =>
      access.followups
        ? listUpcomingReminders(new Date(Date.now() - 24 * 60 * 60 * 1000), 20)
        : [],
    topDistricts: () =>
      db
        .select({
          name: properties.district,
          count: sql<number>`count(*)::int`,
        })
        .from(properties)
        .where(and(live, isNotNull(properties.district)))
        .groupBy(properties.district)
        .orderBy(desc(sql`count(*)`))
        .limit(6),
  });

  const { total, total_value, avg_price, max_price, min_price, ...byStatus } =
    summaryRow;
  return {
    counts: { total, ...byStatus },
    financial: {
      total_value: Number(total_value),
      avg_price: Math.round(Number(avg_price)),
      max_price: Number(max_price),
      min_price: Number(min_price),
    },
    latest: toApiObjects(latestRows, "properties"),
    recent_activity: recentActivity,
    top_governorates: topGovernorates.map((r) => ({
      name: r.name,
      count: Number(r.count),
    })),
    top_districts: topDistricts.map((r) => ({
      name: r.name,
      count: Number(r.count),
    })),
    needs_review: toApiObjects(needsReviewRows, "properties"),
    reminders,
    sales: {
      by_type: salesByTypeRows.map((row) => ({
        name: row.name,
        count: Number(row.count),
      })),
      monthly_activity: salesActivityRows.map((row) => ({
        month: row.month,
        created: Number(row.created),
      })),
    },
    rentals: rentalSummary,
  };
}

/**
 * The 20 newest property audit rows, joined to their user and property
 * after the limit rather than before it.
 */
function getRecentActivity() {
  const recent = db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityId: auditLogs.entityId,
      userId: auditLogs.userId,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(eq(auditLogs.entityType, "property"))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(20)
    .as("recent");
  return db
    .select({
      id: recent.id,
      action: recent.action,
      entity_id: recent.entityId,
      property_code: properties.code,
      user_name: users.username,
      created_at: recent.createdAt,
    })
    .from(recent)
    .leftJoin(users, eq(recent.userId, users.id))
    .leftJoin(properties, eq(recent.entityId, properties.id))
    .orderBy(desc(recent.createdAt), desc(recent.id));
}

async function getRentalSummary() {
  // Normalize each rent period to a monthly value so the summary compares like with like.
  const monthlyRent = sql`
    case
      when ${rentals.rentPeriod} = 'annual' then ${rentals.rentPrice} / 12
      when ${rentals.rentPeriod} = 'semi_annual' then ${rentals.rentPrice} / 6
      else ${rentals.rentPrice}
    end
  `;
  // Its three statements run one after another, beside the dashboard's
  // other queries.
  // Status counts and money figures from one pass over the table.
  const live = ne(rentals.status, "archived");
  const [summaryRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      ...statusCounts(rentals.status, RENTAL_STATUSES),
      monthly_value: sql<string>`coalesce(sum(${monthlyRent}) filter (where ${live}), 0)`,
      avg_monthly_price: sql<string>`coalesce(avg(${monthlyRent}) filter (where ${live}), 0)`,
      available_monthly_value: sql<string>`coalesce(sum(case when ${rentals.status} = 'available' then ${monthlyRent} else 0 end) filter (where ${live}), 0)`,
      rented_monthly_value: sql<string>`coalesce(sum(case when ${rentals.status} = 'rented' then ${monthlyRent} else 0 end) filter (where ${live}), 0)`,
    })
    .from(rentals);
  const {
    total,
    monthly_value,
    avg_monthly_price,
    available_monthly_value,
    rented_monthly_value,
    ...byStatus
  } = summaryRow;

  const rentalByTypeRows = await db
    .select({ name: rentals.propertyType, count: sql<number>`count(*)::int` })
    .from(rentals)
    .where(live)
    .groupBy(rentals.propertyType)
    .orderBy(desc(sql`count(*)`), asc(rentals.propertyType));

  const rentalActivityRows = await monthlyActivity(rentals, rentals.createdAt);

  return {
    counts: {
      total,
      active: total - byStatus.archived,
      ...byStatus,
    },
    financial: {
      monthly_value: Number(monthly_value),
      avg_monthly_price: Math.round(Number(avg_monthly_price)),
      available_monthly_value: Number(available_monthly_value),
      rented_monthly_value: Number(rented_monthly_value),
    },
    by_type: rentalByTypeRows.map((row) => ({
      name: row.name,
      count: Number(row.count),
    })),
    monthly_activity: rentalActivityRows.map((row) => ({
      month: row.month,
      created: Number(row.created),
    })),
  };
}

function emptyRentalSummary(): Awaited<ReturnType<typeof getRentalSummary>> {
  return {
    counts: {
      total: 0,
      active: 0,
      available: 0,
      reserved: 0,
      negotiating: 0,
      rented: 0,
      archived: 0,
    },
    financial: {
      monthly_value: 0,
      avg_monthly_price: 0,
      available_monthly_value: 0,
      rented_monthly_value: 0,
    },
    by_type: [],
    monthly_activity: [],
  };
}
