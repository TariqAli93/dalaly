import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  customers,
  type NewCustomer,
} from "../../infrastructure/database/schema.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";
import type { CustomerFilters, CustomerPayload } from "./customers.schema.js";

function normalize(payload: CustomerPayload): Omit<NewCustomer, "code"> {
  return {
    fullName: payload.full_name,
    phonePrimary: payload.phone_primary,
    phoneSecondary: payload.phone_secondary,
    email: payload.email,
    address: payload.address,
    nationalId: payload.national_id,
    customerType: payload.customer_type,
    status: payload.status,
    notes: payload.notes,
    updatedAt: new Date(),
  };
}

async function generateCode() {
  const [last] = await db
    .select({ code: customers.code })
    .from(customers)
    .orderBy(desc(customers.id))
    .limit(1);
  const next = last?.code ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `C-${String(next).padStart(4, "0")}`;
}

export async function listCustomers(filters: CustomerFilters) {
  const where = [];
  if (filters.customer_type)
    where.push(eq(customers.customerType, filters.customer_type));
  if (filters.status) where.push(eq(customers.status, filters.status));
  else where.push(ne(customers.status, "archived"));
  const q = filters.q?.trim();
  if (q)
    where.push(
      or(
        ilike(customers.code, `%${q}%`),
        ilike(customers.fullName, `%${q}%`),
        ilike(customers.phonePrimary, `%${q}%`),
        ilike(customers.email, `%${q}%`),
      ),
    );
  return toApiObjects(
    await db
      .select()
      .from(customers)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(customers.updatedAt), desc(customers.id)),
    "customers",
  );
}

export async function getCustomer(id: number) {
  const [row] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  return row ? toApiObject(row, "customers") : null;
}

export async function createCustomer(payload: CustomerPayload) {
  const [row] = await db
    .insert(customers)
    .values({ ...normalize(payload), code: await generateCode() })
    .returning();
  return toApiObject(row, "customers");
}

export async function updateCustomer(id: number, payload: CustomerPayload) {
  const [row] = await db
    .update(customers)
    .set(normalize(payload))
    .where(eq(customers.id, id))
    .returning();
  return row ? toApiObject(row, "customers") : null;
}

export async function archiveCustomer(id: number) {
  const [row] = await db
    .update(customers)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();
  return row ? toApiObject(row, "customers") : null;
}

export async function restoreCustomer(id: number) {
  const [row] = await db
    .update(customers)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();
  return row ? toApiObject(row, "customers") : null;
}
