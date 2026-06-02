import { and, desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { favoriteProperties, properties } from "../../infrastructure/database/schema.js";
import { toApiObjects } from "../../shared/utils/case.js";

export async function listFavoriteIds(userId: number) {
  const rows = await db
    .select({ propertyId: favoriteProperties.propertyId })
    .from(favoriteProperties)
    .where(eq(favoriteProperties.userId, userId));
  return rows.map((row) => row.propertyId);
}

export async function listFavoriteProperties(userId: number) {
  const rows = await db
    .select({ property: properties })
    .from(favoriteProperties)
    .innerJoin(properties, eq(favoriteProperties.propertyId, properties.id))
    .where(eq(favoriteProperties.userId, userId))
    .orderBy(desc(favoriteProperties.createdAt));
  return toApiObjects(rows.map((row) => row.property));
}

export async function addFavorite(userId: number, propertyId: number) {
  await db
    .insert(favoriteProperties)
    .values({ userId, propertyId })
    .onConflictDoNothing();
}

export async function removeFavorite(userId: number, propertyId: number) {
  await db
    .delete(favoriteProperties)
    .where(
      and(
        eq(favoriteProperties.userId, userId),
        eq(favoriteProperties.propertyId, propertyId)
      )
    );
}
