import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  lt,
  ne,
  notInArray,
  sql
} from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  auditLogs,
  properties,
  users
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
    archived: 0
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
      min_price: sql<string>`coalesce(min(${properties.totalPrice}), 0)`
    })
    .from(properties)
    .where(ne(properties.status, "archived"));

  const financial = {
    total_value: Number(financialRow?.total_value ?? 0),
    avg_price: Math.round(Number(financialRow?.avg_price ?? 0)),
    max_price: Number(financialRow?.max_price ?? 0),
    min_price: Number(financialRow?.min_price ?? 0)
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
      created_at: auditLogs.createdAt
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
    .where(and(ne(properties.status, "archived"), isNotNull(properties.governorate)))
    .groupBy(properties.governorate)
    .orderBy(desc(sql`count(*)`))
    .limit(6);

  const topDistricts = await db
    .select({ name: properties.district, count: sql<number>`count(*)::int` })
    .from(properties)
    .where(and(ne(properties.status, "archived"), isNotNull(properties.district)))
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
        lt(properties.updatedAt, cutoff)
      )
    )
    .orderBy(asc(properties.updatedAt))
    .limit(15);

  const reminders = await listUpcomingReminders(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
    20
  );

  return {
    counts,
    financial,
    latest: toApiObjects(latestRows),
    recent_activity: recentActivity,
    top_governorates: topGovernorates.map((r) => ({ name: r.name, count: Number(r.count) })),
    top_districts: topDistricts.map((r) => ({ name: r.name, count: Number(r.count) })),
    needs_review: toApiObjects(needsReviewRows),
    reminders
  };
}
