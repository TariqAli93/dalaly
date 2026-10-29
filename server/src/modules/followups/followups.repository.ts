import { and, asc, desc, eq, gte, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  people,
  properties,
  propertyFollowups,
  users,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import {
  completedAtFor,
  initialStatus,
  normalizeScheduledAt,
  type TaskStatus,
} from "../tasks/tasks.schema.js";
import { assertTaskLinks } from "../tasks/tasks.links.js";
import type { FollowupPayload } from "./followups.schema.js";

const assignee = alias(users, "assignee");

function selectFollowups() {
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
      updated_at: propertyFollowups.updatedAt,
      status: propertyFollowups.status,
      priority: propertyFollowups.priority,
      completed_at: propertyFollowups.completedAt,
      outcome: propertyFollowups.outcome,
      person_id: propertyFollowups.personId,
      person_name: people.fullName,
      assigned_user_id: propertyFollowups.assignedUserId,
      assigned_user_name: assignee.displayName,
    })
    .from(propertyFollowups)
    .leftJoin(users, eq(propertyFollowups.userId, users.id))
    .leftJoin(assignee, eq(propertyFollowups.assignedUserId, assignee.id))
    .leftJoin(people, eq(propertyFollowups.personId, people.id));
}

export async function listFollowups(propertyId: number) {
  return selectFollowups()
    .where(eq(propertyFollowups.propertyId, propertyId))
    .orderBy(desc(propertyFollowups.createdAt), desc(propertyFollowups.id));
}

async function getFollowup(propertyId: number, id: number) {
  const [row] = await selectFollowups().where(
    and(
      eq(propertyFollowups.id, id),
      eq(propertyFollowups.propertyId, propertyId),
    ),
  );
  return row ?? null;
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
  await assertTaskLinks(payload);
  const status = initialStatus(payload);
  const [row] = await db
    .insert(propertyFollowups)
    .values({
      propertyId,
      userId: userId ?? null,
      type: payload.type,
      notes: payload.notes ?? null,
      scheduledAt: normalizeScheduledAt(payload.scheduled_at),
      status,
      priority: payload.priority ?? "normal",
      completedAt: completedAtFor(status, null),
      outcome: payload.outcome ?? null,
      assignedUserId: payload.assigned_user_id ?? null,
      personId: payload.person_id ?? null,
    })
    .returning({ id: propertyFollowups.id });
  return getFollowup(propertyId, row.id);
}

export async function updateFollowup(
  propertyId: number,
  id: number,
  payload: FollowupPayload,
) {
  const [current] = await db
    .select({
      status: propertyFollowups.status,
      completedAt: propertyFollowups.completedAt,
    })
    .from(propertyFollowups)
    .where(
      and(
        eq(propertyFollowups.id, id),
        eq(propertyFollowups.propertyId, propertyId),
      ),
    );
  if (!current) return null;
  await assertTaskLinks(payload);
  const status = (payload.status ?? current.status) as TaskStatus;
  await db
    .update(propertyFollowups)
    .set({
      type: payload.type,
      notes: payload.notes ?? null,
      scheduledAt: normalizeScheduledAt(payload.scheduled_at),
      status,
      completedAt: completedAtFor(status, current),
      ...(payload.priority === undefined ? {} : { priority: payload.priority }),
      ...(payload.outcome === undefined ? {} : { outcome: payload.outcome }),
      ...(payload.assigned_user_id === undefined
        ? {}
        : { assignedUserId: payload.assigned_user_id }),
      ...(payload.person_id === undefined
        ? {}
        : { personId: payload.person_id }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(propertyFollowups.id, id),
        eq(propertyFollowups.propertyId, propertyId),
      ),
    );
  return getFollowup(propertyId, id);
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
