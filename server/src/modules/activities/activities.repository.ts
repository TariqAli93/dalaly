import { and, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  activities,
  people,
  purchaseRequests,
  rentalRequests,
  users,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { assertTaskLinks } from "../tasks/tasks.links.js";
import {
  completedAtFor,
  initialStatus,
  normalizeScheduledAt,
  type TaskStatus,
} from "../tasks/tasks.schema.js";
import type { ActivityFilters, ActivityPayload } from "./activities.schema.js";

const assignee = alias(users, "assignee");

function selectActivities() {
  return db
    .select({
      id: activities.id,
      person_id: activities.personId,
      person_name: people.fullName,
      purchase_request_id: activities.purchaseRequestId,
      purchase_request_code: purchaseRequests.code,
      rental_request_id: activities.rentalRequestId,
      rental_request_code: rentalRequests.code,
      user_id: activities.userId,
      user_name: users.username,
      type: activities.type,
      notes: activities.notes,
      scheduled_at: activities.scheduledAt,
      created_at: activities.createdAt,
      updated_at: activities.updatedAt,
      status: activities.status,
      priority: activities.priority,
      completed_at: activities.completedAt,
      outcome: activities.outcome,
      assigned_user_id: activities.assignedUserId,
      assigned_user_name: assignee.displayName,
    })
    .from(activities)
    .innerJoin(people, eq(activities.personId, people.id))
    .leftJoin(
      purchaseRequests,
      eq(activities.purchaseRequestId, purchaseRequests.id),
    )
    .leftJoin(rentalRequests, eq(activities.rentalRequestId, rentalRequests.id))
    .leftJoin(users, eq(activities.userId, users.id))
    .leftJoin(assignee, eq(activities.assignedUserId, assignee.id));
}

export async function listActivities(filters: ActivityFilters) {
  const where: SQL[] = [];
  if (filters.person_id) where.push(eq(activities.personId, filters.person_id));
  if (filters.purchase_request_id)
    where.push(eq(activities.purchaseRequestId, filters.purchase_request_id));
  if (filters.rental_request_id)
    where.push(eq(activities.rentalRequestId, filters.rental_request_id));
  return selectActivities()
    .where(and(...where))
    .orderBy(desc(activities.createdAt), desc(activities.id));
}

export async function getActivity(id: number) {
  const [row] = await selectActivities().where(eq(activities.id, id));
  return row ?? null;
}

/** The customer exists, and a linked request is one of theirs. */
async function assertActivityLinks(payload: ActivityPayload) {
  await assertTaskLinks(payload);
  const checks = [
    { table: purchaseRequests, id: payload.purchase_request_id },
    { table: rentalRequests, id: payload.rental_request_id },
  ];
  for (const { table, id } of checks) {
    if (!id) continue;
    const [request] = await db
      .select({ personId: table.personId })
      .from(table)
      .where(eq(table.id, id));
    if (!request || request.personId !== payload.person_id)
      throw new DomainError(400, "الطلب المحدد ليس من طلبات هذا الزبون.");
  }
}

export async function createActivity(
  userId: number | undefined,
  payload: ActivityPayload,
) {
  await assertActivityLinks(payload);
  const status = initialStatus(payload);
  const [row] = await db
    .insert(activities)
    .values({
      personId: payload.person_id,
      purchaseRequestId: payload.purchase_request_id ?? null,
      rentalRequestId: payload.rental_request_id ?? null,
      userId: userId ?? null,
      type: payload.type,
      notes: payload.notes ?? null,
      scheduledAt: normalizeScheduledAt(payload.scheduled_at),
      status,
      priority: payload.priority ?? "normal",
      completedAt: completedAtFor(status, null),
      outcome: payload.outcome ?? null,
      assignedUserId: payload.assigned_user_id ?? null,
    })
    .returning({ id: activities.id });
  return getActivity(row.id);
}

export async function updateActivity(id: number, payload: ActivityPayload) {
  const [current] = await db
    .select({
      status: activities.status,
      completedAt: activities.completedAt,
    })
    .from(activities)
    .where(eq(activities.id, id));
  if (!current) return null;
  await assertActivityLinks(payload);
  const status = (payload.status ?? current.status) as TaskStatus;
  await db
    .update(activities)
    .set({
      personId: payload.person_id,
      purchaseRequestId: payload.purchase_request_id ?? null,
      rentalRequestId: payload.rental_request_id ?? null,
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
      updatedAt: new Date(),
    })
    .where(eq(activities.id, id));
  return getActivity(id);
}

export async function deleteActivity(id: number) {
  const [row] = await db
    .delete(activities)
    .where(eq(activities.id, id))
    .returning({ id: activities.id });
  return row ?? null;
}
