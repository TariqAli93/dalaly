import { and, asc, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  properties,
  propertyFollowups,
  users,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import {
  normalizeScheduledAt,
  type FollowupPayload,
} from "./followups.schema.js";

export async function listFollowups(propertyId: number) {
  return db
    .select({
      id: propertyFollowups.id,
      property_id: propertyFollowups.propertyId,
      user_id: propertyFollowups.userId,
      user_name: users.username,
      type: propertyFollowups.type,
      notes: propertyFollowups.notes,
      scheduled_at: propertyFollowups.scheduledAt,
      created_at: propertyFollowups.createdAt,
    })
    .from(propertyFollowups)
    .leftJoin(users, eq(propertyFollowups.userId, users.id))
    .where(eq(propertyFollowups.propertyId, propertyId))
    .orderBy(desc(propertyFollowups.createdAt), desc(propertyFollowups.id));
}

export async function createFollowup(
  propertyId: number,
  userId: number | undefined,
  payload: FollowupPayload,
) {
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.id, propertyId));
  if (!property) throw new DomainError(404, "العقار غير موجود.");
  const [row] = await db
    .insert(propertyFollowups)
    .values({
      propertyId,
      userId: userId ?? null,
      type: payload.type,
      notes: payload.notes ?? null,
      scheduledAt: normalizeScheduledAt(payload.scheduled_at),
    })
    .returning();
  return row;
}

export async function updateFollowup(
  propertyId: number,
  id: number,
  payload: FollowupPayload,
) {
  const [row] = await db
    .update(propertyFollowups)
    .set({
      type: payload.type,
      notes: payload.notes ?? null,
      scheduledAt: normalizeScheduledAt(payload.scheduled_at),
    })
    .where(
      and(
        eq(propertyFollowups.id, id),
        eq(propertyFollowups.propertyId, propertyId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteFollowup(propertyId: number, id: number) {
  const [row] = await db
    .delete(propertyFollowups)
    .where(
      and(
        eq(propertyFollowups.id, id),
        eq(propertyFollowups.propertyId, propertyId),
      ),
    )
    .returning();
  return row ?? null;
}

/** المتابعات المجدولة القادمة/المستحقة لعرضها كتنبيهات في لوحة البداية. */
export async function listUpcomingReminders(fromDate: Date, limit = 20) {
  return db
    .select({
      id: propertyFollowups.id,
      property_id: propertyFollowups.propertyId,
      property_code: properties.code,
      type: propertyFollowups.type,
      notes: propertyFollowups.notes,
      scheduled_at: propertyFollowups.scheduledAt,
    })
    .from(propertyFollowups)
    .innerJoin(properties, eq(propertyFollowups.propertyId, properties.id))
    .where(
      and(
        isNotNull(propertyFollowups.scheduledAt),
        gte(propertyFollowups.scheduledAt, fromDate),
      ),
    )
    .orderBy(asc(propertyFollowups.scheduledAt))
    .limit(limit);
}
