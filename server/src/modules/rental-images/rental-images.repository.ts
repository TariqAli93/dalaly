import { and, asc, eq, max } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { rentalImages } from "../../infrastructure/database/schema.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";

export async function listRentalImages(rentalId: number) {
  return toApiObjects(
    await db
      .select()
      .from(rentalImages)
      .where(eq(rentalImages.rentalId, rentalId))
      .orderBy(asc(rentalImages.sortOrder), asc(rentalImages.id)),
  );
}
export async function getRentalImage(rentalId: number, imageId: number) {
  const [row] = await db
    .select()
    .from(rentalImages)
    .where(
      and(eq(rentalImages.id, imageId), eq(rentalImages.rentalId, rentalId)),
    )
    .limit(1);
  return row ?? null;
}
export async function countRentalImages(rentalId: number) {
  return (
    await db
      .select({ id: rentalImages.id })
      .from(rentalImages)
      .where(eq(rentalImages.rentalId, rentalId))
  ).length;
}
export async function addRentalImage(input: {
  rentalId: number;
  filePath: string;
  originalName?: string | null;
  isPrimary: boolean;
}) {
  const [{ value: currentMax }] = await db
    .select({ value: max(rentalImages.sortOrder) })
    .from(rentalImages)
    .where(eq(rentalImages.rentalId, input.rentalId));
  const [row] = await db
    .insert(rentalImages)
    .values({
      ...input,
      originalName: input.originalName ?? null,
      sortOrder: (currentMax ?? 0) + 1,
    })
    .returning();
  return toApiObject(row);
}
export async function setPrimaryRentalImage(rentalId: number, imageId: number) {
  await db.transaction(async (tx) => {
    await tx
      .update(rentalImages)
      .set({ isPrimary: false })
      .where(eq(rentalImages.rentalId, rentalId));
    await tx
      .update(rentalImages)
      .set({ isPrimary: true })
      .where(
        and(eq(rentalImages.id, imageId), eq(rentalImages.rentalId, rentalId)),
      );
  });
}
export async function reorderRentalImages(
  rentalId: number,
  orderedIds: number[],
) {
  await db.transaction(async (tx) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      await tx
        .update(rentalImages)
        .set({ sortOrder: index + 1 })
        .where(
          and(
            eq(rentalImages.id, orderedIds[index]),
            eq(rentalImages.rentalId, rentalId),
          ),
        );
    }
  });
}
export async function deleteRentalImage(rentalId: number, imageId: number) {
  const [row] = await db
    .delete(rentalImages)
    .where(
      and(eq(rentalImages.id, imageId), eq(rentalImages.rentalId, rentalId)),
    )
    .returning();
  return row ?? null;
}
export async function ensurePrimaryRentalImage(rentalId: number) {
  const rows = await db
    .select()
    .from(rentalImages)
    .where(eq(rentalImages.rentalId, rentalId))
    .orderBy(asc(rentalImages.sortOrder), asc(rentalImages.id));
  if (rows.length && !rows.some((row) => row.isPrimary))
    await db
      .update(rentalImages)
      .set({ isPrimary: true })
      .where(eq(rentalImages.id, rows[0].id));
}
