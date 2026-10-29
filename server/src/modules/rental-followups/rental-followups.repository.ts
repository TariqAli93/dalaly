import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  people,
  rentalFollowups,
  rentals,
  users,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import type { FollowupPayload } from "../followups/followups.schema.js";
import {
  completedAtFor,
  initialStatus,
  normalizeScheduledAt,
  type TaskStatus,
} from "../tasks/tasks.schema.js";
import { assertTaskLinks } from "../tasks/tasks.links.js";

const assignee = alias(users, "assignee");

function selectRentalFollowups() {
  return db
    .select({
      id: rentalFollowups.id,
      rental_id: rentalFollowups.rentalId,
      user_id: rentalFollowups.userId,
      user_name: users.username,
      type: rentalFollowups.type,
      notes: rentalFollowups.notes,
      scheduled_at: rentalFollowups.scheduledAt,
      created_at: rentalFollowups.createdAt,
      updated_at: rentalFollowups.updatedAt,
      status: rentalFollowups.status,
      priority: rentalFollowups.priority,
      completed_at: rentalFollowups.completedAt,
      outcome: rentalFollowups.outcome,
      person_id: rentalFollowups.personId,
      person_name: people.fullName,
      assigned_user_id: rentalFollowups.assignedUserId,
      assigned_user_name: assignee.displayName,
    })
    .from(rentalFollowups)
    .leftJoin(users, eq(rentalFollowups.userId, users.id))
    .leftJoin(assignee, eq(rentalFollowups.assignedUserId, assignee.id))
    .leftJoin(people, eq(rentalFollowups.personId, people.id));
}

export async function listRentalFollowups(rentalId: number) {
  return selectRentalFollowups()
    .where(eq(rentalFollowups.rentalId, rentalId))
    .orderBy(desc(rentalFollowups.createdAt), desc(rentalFollowups.id));
}

async function getRentalFollowup(rentalId: number, id: number) {
  const [row] = await selectRentalFollowups().where(
    and(eq(rentalFollowups.id, id), eq(rentalFollowups.rentalId, rentalId)),
  );
  return row ?? null;
}

export async function createRentalFollowup(
  rentalId: number,
  userId: number | undefined,
  payload: FollowupPayload,
) {
  const [rental] = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(eq(rentals.id, rentalId));
  if (!rental) throw new DomainError(404, "الإيجار غير موجود.");
  await assertTaskLinks(payload);
  const status = initialStatus(payload);
  const [row] = await db
    .insert(rentalFollowups)
    .values({
      rentalId,
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
    .returning({ id: rentalFollowups.id });
  return getRentalFollowup(rentalId, row.id);
}

export async function updateRentalFollowup(
  rentalId: number,
  id: number,
  payload: FollowupPayload,
) {
  const where = and(
    eq(rentalFollowups.id, id),
    eq(rentalFollowups.rentalId, rentalId),
  );
  const [current] = await db
    .select({
      status: rentalFollowups.status,
      completedAt: rentalFollowups.completedAt,
    })
    .from(rentalFollowups)
    .where(where);
  if (!current) return null;
  await assertTaskLinks(payload);
  const status = (payload.status ?? current.status) as TaskStatus;
  await db
    .update(rentalFollowups)
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
    .where(where);
  return getRentalFollowup(rentalId, id);
}

export async function deleteRentalFollowup(rentalId: number, id: number) {
  const [row] = await db
    .delete(rentalFollowups)
    .where(
      and(eq(rentalFollowups.id, id), eq(rentalFollowups.rentalId, rentalId)),
    )
    .returning();
  return row ?? null;
}
