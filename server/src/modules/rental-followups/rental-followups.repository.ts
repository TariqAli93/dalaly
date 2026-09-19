import { and, desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { rentalFollowups, users } from "../../infrastructure/database/schema.js";
import type { FollowupPayload } from "../followups/followups.schema.js";
function normalizeScheduledAt(value?: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
export async function listRentalFollowups(rentalId: number) { return db.select({ id: rentalFollowups.id, rental_id: rentalFollowups.rentalId, user_id: rentalFollowups.userId, user_name: users.username, type: rentalFollowups.type, notes: rentalFollowups.notes, scheduled_at: rentalFollowups.scheduledAt, created_at: rentalFollowups.createdAt }).from(rentalFollowups).leftJoin(users, eq(rentalFollowups.userId, users.id)).where(eq(rentalFollowups.rentalId, rentalId)).orderBy(desc(rentalFollowups.createdAt), desc(rentalFollowups.id)); }
export async function createRentalFollowup(rentalId: number, userId: number | undefined, payload: FollowupPayload) { const [row] = await db.insert(rentalFollowups).values({ rentalId, userId: userId ?? null, type: payload.type, notes: payload.notes ?? null, scheduledAt: normalizeScheduledAt(payload.scheduled_at) }).returning(); return row; }
export async function updateRentalFollowup(id: number, payload: FollowupPayload) { const [row] = await db.update(rentalFollowups).set({ type: payload.type, notes: payload.notes ?? null, scheduledAt: normalizeScheduledAt(payload.scheduled_at) }).where(eq(rentalFollowups.id, id)).returning(); return row ?? null; }
export async function deleteRentalFollowup(id: number) { const [row] = await db.delete(rentalFollowups).where(eq(rentalFollowups.id, id)).returning(); return row ?? null; }
