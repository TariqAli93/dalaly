import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  people,
  type NewPerson,
} from "../../infrastructure/database/schema.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";
import type { PersonFilters, PersonPayload } from "./people.schema.js";

function normalize(payload: PersonPayload): Omit<NewPerson, "code"> {
  return {
    fullName: payload.full_name,
    phonePrimary: payload.phone_primary,
    phoneSecondary: payload.phone_secondary,
    email: payload.email,
    address: payload.address,
    nationalId: payload.national_id,
    personType: payload.person_type,
    status: payload.status,
    notes: payload.notes,
    updatedAt: new Date(),
  };
}

async function generateCode() {
  const [last] = await db
    .select({ code: people.code })
    .from(people)
    .orderBy(desc(people.id))
    .limit(1);
  const next = last?.code ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `P-${String(next).padStart(4, "0")}`;
}

export async function listPeople(filters: PersonFilters) {
  const where = [];
  if (filters.person_type)
    where.push(eq(people.personType, filters.person_type));
  if (filters.status) where.push(eq(people.status, filters.status));
  else where.push(ne(people.status, "archived"));
  const q = filters.q?.trim();
  if (q)
    where.push(
      or(
        ilike(people.code, `%${q}%`),
        ilike(people.fullName, `%${q}%`),
        ilike(people.phonePrimary, `%${q}%`),
        ilike(people.email, `%${q}%`),
        ilike(people.nationalId, `%${q}%`),
      ),
    );
  return toApiObjects(
    await db
      .select()
      .from(people)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(people.updatedAt), desc(people.id)),
    "people",
  );
}

export async function getPerson(id: number) {
  const [row] = await db
    .select()
    .from(people)
    .where(eq(people.id, id))
    .limit(1);
  return row ? toApiObject(row, "people") : null;
}

export async function createPerson(payload: PersonPayload) {
  const [row] = await db
    .insert(people)
    .values({ ...normalize(payload), code: await generateCode() })
    .returning();
  return toApiObject(row, "people");
}

export async function updatePerson(id: number, payload: PersonPayload) {
  const [row] = await db
    .update(people)
    .set(normalize(payload))
    .where(eq(people.id, id))
    .returning();
  return row ? toApiObject(row, "people") : null;
}

export async function archivePerson(id: number) {
  const [row] = await db
    .update(people)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(people.id, id))
    .returning();
  return row ? toApiObject(row, "people") : null;
}

export async function restorePerson(id: number) {
  const [row] = await db
    .update(people)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(people.id, id))
    .returning();
  return row ? toApiObject(row, "people") : null;
}
