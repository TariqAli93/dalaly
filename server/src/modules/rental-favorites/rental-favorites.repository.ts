import { and, desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  favoriteRentals,
  rentals,
} from "../../infrastructure/database/schema.js";
import { toApiObjects } from "../../shared/utils/case.js";
export async function listFavoriteRentalIds(userId: number) {
  const rows = await db
    .select({ rentalId: favoriteRentals.rentalId })
    .from(favoriteRentals)
    .where(eq(favoriteRentals.userId, userId));
  return rows.map((row) => row.rentalId);
}
export async function listFavoriteRentals(userId: number) {
  const rows = await db
    .select({ rental: rentals })
    .from(favoriteRentals)
    .innerJoin(rentals, eq(favoriteRentals.rentalId, rentals.id))
    .where(eq(favoriteRentals.userId, userId))
    .orderBy(desc(favoriteRentals.createdAt));
  return toApiObjects(rows.map((row) => row.rental));
}
export async function addFavoriteRental(userId: number, rentalId: number) {
  await db
    .insert(favoriteRentals)
    .values({ userId, rentalId })
    .onConflictDoNothing();
}
export async function removeFavoriteRental(userId: number, rentalId: number) {
  await db
    .delete(favoriteRentals)
    .where(
      and(
        eq(favoriteRentals.userId, userId),
        eq(favoriteRentals.rentalId, rentalId),
      ),
    );
}
