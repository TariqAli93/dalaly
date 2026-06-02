import { and, asc, eq, max } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { propertyImages } from "../../infrastructure/database/schema.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";

export async function listImages(propertyId: number) {
  const rows = await db
    .select()
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, propertyId))
    .orderBy(asc(propertyImages.sortOrder), asc(propertyImages.id));
  return toApiObjects(rows);
}

export async function getImage(imageId: number) {
  const [row] = await db
    .select()
    .from(propertyImages)
    .where(eq(propertyImages.id, imageId))
    .limit(1);
  return row ?? null;
}

export async function countImages(propertyId: number) {
  const rows = await db
    .select({ id: propertyImages.id })
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, propertyId));
  return rows.length;
}

export async function addImage(input: {
  propertyId: number;
  filePath: string;
  originalName?: string | null;
  isPrimary: boolean;
}) {
  const [{ value: currentMax }] = await db
    .select({ value: max(propertyImages.sortOrder) })
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, input.propertyId));

  const [row] = await db
    .insert(propertyImages)
    .values({
      propertyId: input.propertyId,
      filePath: input.filePath,
      originalName: input.originalName ?? null,
      isPrimary: input.isPrimary,
      sortOrder: (currentMax ?? 0) + 1
    })
    .returning();
  return toApiObject(row);
}

export async function setPrimaryImage(propertyId: number, imageId: number) {
  await db.transaction(async (tx) => {
    await tx
      .update(propertyImages)
      .set({ isPrimary: false })
      .where(eq(propertyImages.propertyId, propertyId));
    await tx
      .update(propertyImages)
      .set({ isPrimary: true })
      .where(and(eq(propertyImages.id, imageId), eq(propertyImages.propertyId, propertyId)));
  });
}

export async function reorderImages(propertyId: number, orderedIds: number[]) {
  await db.transaction(async (tx) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      await tx
        .update(propertyImages)
        .set({ sortOrder: index + 1 })
        .where(
          and(eq(propertyImages.id, orderedIds[index]), eq(propertyImages.propertyId, propertyId))
        );
    }
  });
}

export async function deleteImageRow(imageId: number) {
  const [row] = await db
    .delete(propertyImages)
    .where(eq(propertyImages.id, imageId))
    .returning();
  return row ?? null;
}

/** يضمن وجود صورة رئيسية واحدة على الأقل بعد الحذف. */
export async function ensurePrimary(propertyId: number) {
  const rows = await db
    .select()
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, propertyId))
    .orderBy(asc(propertyImages.sortOrder), asc(propertyImages.id));

  if (!rows.length) return;
  if (rows.some((row) => row.isPrimary)) return;

  await db
    .update(propertyImages)
    .set({ isPrimary: true })
    .where(eq(propertyImages.id, rows[0].id));
}
