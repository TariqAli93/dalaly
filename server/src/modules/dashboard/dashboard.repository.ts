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
} from "drizzle-orm";
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

export async function getDashboard() {
  const statusRows = await db
    .select({ status: properties.status, count: sql<number>`count(*)::int` })
    .from(properties)
    .groupBy(properties.status);

  const counts = {
    total: 0,
    available: 0,
    reserved: 0,
    negotiating: 0,
    sold: 0,
    rented: 0,
    archived: 0,
  };
  for (const row of statusRows) {
    const value = Number(row.count);
    counts.total += value;
    if (row.status in counts) {
      (counts as Record<string, number>)[row.status] = value;
    }
  }

  const [financialRow] = await db
    .select({
      total_value: sql<string>`coalesce(sum(${properties.totalPrice}), 0)`,
      avg_price: sql<string>`coalesce(avg(${properties.totalPrice}), 0)`,
      max_price: sql<string>`coalesce(max(${properties.totalPrice}), 0)`,
      min_price: sql<string>`coalesce(min(${properties.totalPrice}), 0)`,
    })
    .from(properties)
    .where(ne(properties.status, "archived"));

  const financial = {
    total_value: Number(financialRow?.total_value ?? 0),
    avg_price: Math.round(Number(financialRow?.avg_price ?? 0)),
    max_price: Number(financialRow?.max_price ?? 0),
    min_price: Number(financialRow?.min_price ?? 0),
  };

  const salesByTypeRows = await db
    .select({ name: properties.propertyType, count: sql<number>`count(*)::int` })
    .from(properties)
    .where(ne(properties.status, "archived"))
    .groupBy(properties.propertyType)
    .orderBy(desc(sql`count(*)`))
    .limit(6);

  const salesActivityRows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${properties.createdAt}), 'YYYY-MM')`,
      created: sql<number>`count(*)::int`,
    })
    .from(properties)
    .where(
      and(
        ne(properties.status, "archived"),
        gte(
          properties.createdAt,
          sql`date_trunc('month', current_date) - interval '5 months'`,
        ),
      ),
    )
    .groupBy(sql`date_trunc('month', ${properties.createdAt})`)
    .orderBy(asc(sql`date_trunc('month', ${properties.createdAt})`));

  const rentalStatusRows = await db
    .select({ status: rentals.status, count: sql<number>`count(*)::int` })
    .from(rentals)
    .groupBy(rentals.status);

  const rentalCounts = {
    total: 0,
    active: 0,
    available: 0,
    reserved: 0,
    negotiating: 0,
    rented: 0,
    archived: 0,
  };
  for (const row of rentalStatusRows) {
    const value = Number(row.count);
    rentalCounts.total += value;
    if (row.status in rentalCounts) {
      (rentalCounts as Record<string, number>)[row.status] = value;
    }
  }
  rentalCounts.active = rentalCounts.total - rentalCounts.archived;

  // Normalize each rent period to a monthly value so the summary compares like with like.
  const monthlyRent = sql`
    case
      when ${rentals.rentPeriod} = 'annual' then ${rentals.rentPrice} / 12
      when ${rentals.rentPeriod} = 'semi_annual' then ${rentals.rentPrice} / 6
      else ${rentals.rentPrice}
    end
  `;
  const [rentalFinancialRow] = await db
    .select({
      monthly_value: sql<string>`coalesce(sum(${monthlyRent}), 0)`,
      avg_monthly_price: sql<string>`coalesce(avg(${monthlyRent}), 0)`,
      available_monthly_value: sql<string>`coalesce(sum(case when ${rentals.status} = 'available' then ${monthlyRent} else 0 end), 0)`,
      rented_monthly_value: sql<string>`coalesce(sum(case when ${rentals.status} = 'rented' then ${monthlyRent} else 0 end), 0)`,
    })
    .from(rentals)
    .where(ne(rentals.status, "archived"));

  const rentalByTypeRows = await db
    .select({ name: rentals.propertyType, count: sql<number>`count(*)::int` })
    .from(rentals)
    .where(ne(rentals.status, "archived"))
    .groupBy(rentals.propertyType)
    .orderBy(desc(sql`count(*)`))
    .limit(6);

  const rentalActivityRows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${rentals.createdAt}), 'YYYY-MM')`,
      created: sql<number>`count(*)::int`,
    })
    .from(rentals)
    .where(
      gte(
        rentals.createdAt,
        sql`date_trunc('month', current_date) - interval '5 months'`,
      ),
    )
    .groupBy(sql`date_trunc('month', ${rentals.createdAt})`)
    .orderBy(asc(sql`date_trunc('month', ${rentals.createdAt})`));

  const rentalFinancial = {
    monthly_value: Number(rentalFinancialRow?.monthly_value ?? 0),
    avg_monthly_price: Math.round(
      Number(rentalFinancialRow?.avg_monthly_price ?? 0),
    ),
    available_monthly_value: Number(
      rentalFinancialRow?.available_monthly_value ?? 0,
    ),
    rented_monthly_value: Number(
      rentalFinancialRow?.rented_monthly_value ?? 0,
    ),
  };

  const latestRows = await db
    .select()
    .from(properties)
    .orderBy(desc(properties.createdAt), desc(properties.id))
    .limit(10);

  const recentActivity = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entity_id: auditLogs.entityId,
      property_code: properties.code,
      user_name: users.username,
      created_at: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .leftJoin(properties, eq(auditLogs.entityId, properties.id))
    .where(eq(auditLogs.entityType, "property"))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(20);

  const topGovernorates = await db
    .select({ name: properties.governorate, count: sql<number>`count(*)::int` })
    .from(properties)
    .where(
      and(ne(properties.status, "archived"), isNotNull(properties.governorate)),
    )
    .groupBy(properties.governorate)
    .orderBy(desc(sql`count(*)`))
    .limit(6);

  const topDistricts = await db
    .select({ name: properties.district, count: sql<number>`count(*)::int` })
    .from(properties)
    .where(
      and(ne(properties.status, "archived"), isNotNull(properties.district)),
    )
    .groupBy(properties.district)
    .orderBy(desc(sql`count(*)`))
    .limit(6);

  const cutoff = new Date(Date.now() - REVIEW_DAYS * 24 * 60 * 60 * 1000);
  const needsReviewRows = await db
    .select()
    .from(properties)
    .where(
      and(
        notInArray(properties.status, ["archived", "sold", "rented"]),
        lt(properties.updatedAt, cutoff),
      ),
    )
    .orderBy(asc(properties.updatedAt))
    .limit(15);

  const reminders = await listUpcomingReminders(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
    20,
  );

  return {
    counts,
    financial,
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
    rentals: {
      counts: rentalCounts,
      financial: rentalFinancial,
      by_type: rentalByTypeRows.map((row) => ({
        name: row.name,
        count: Number(row.count),
      })),
      monthly_activity: rentalActivityRows.map((row) => ({
        month: row.month,
        created: Number(row.created),
      })),
    },
  };
}
