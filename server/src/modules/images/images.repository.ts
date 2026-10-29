import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import type { Transaction } from "../../infrastructure/database/record-codes.js";
import {
  properties,
  propertyImages,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { toApiObjects } from "../../shared/utils/case.js";
import type { StoredImageFile } from "./images.service.js";

export async function listImages(propertyId: number) {
  const rows = await db
    .select()
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, propertyId))
    .orderBy(asc(propertyImages.sortOrder), asc(propertyImages.id));
  return toApiObjects(rows);
}

export type PrimaryImageRow = { id: number; filePath: string };

/** الصورة التي يعرضها جدول العروض لكل عقار: الرئيسية، وإلا الأولى بالترتيب. */
export async function primaryImagesOf(propertyIds: number[]) {
  if (!propertyIds.length) return new Map<number, PrimaryImageRow>();
  const rows = await db
    .selectDistinctOn([propertyImages.propertyId], {
      ownerId: propertyImages.propertyId,
      id: propertyImages.id,
      filePath: propertyImages.filePath,
    })
    .from(propertyImages)
    .where(inArray(propertyImages.propertyId, propertyIds))
    .orderBy(
      propertyImages.propertyId,
      desc(propertyImages.isPrimary),
      asc(propertyImages.sortOrder),
      asc(propertyImages.id),
    );
  return new Map(rows.map(({ ownerId, ...image }) => [ownerId, image]));
}

/** صورة العقار propertyId، أو null إن لم تكن له. */
export async function getImage(propertyId: number, imageId: number) {
  const [row] = await db
    .select()
    .from(propertyImages)
    .where(
      and(
        eq(propertyImages.id, imageId),
        eq(propertyImages.propertyId, propertyId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * يقفل صف العقار حتى نهاية المعاملة، فتتعاقب عمليات صوره ولا يُحذف العقار
 * في أثنائها. يرمي 404 إن لم يكن موجوداً.
 */
async function lockProperty(tx: Transaction, propertyId: number) {
  const [row] = await tx
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .for("no key update");
  if (!row) throw new DomainError(404, "العقار غير موجود.");
}

export async function assertPropertyExists(propertyId: number) {
  const [row] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.id, propertyId));
  if (!row) throw new DomainError(404, "العقار غير موجود.");
}

/**
 * يضيف صفوف دفعة صور حُفظت ملفاتها، في معاملة واحدة: كلها أو لا شيء. أول
 * صورة لعقار بلا صور تصبح الرئيسية.
 */
export async function addImages(propertyId: number, files: StoredImageFile[]) {
  return db.transaction(async (tx) => {
    await lockProperty(tx, propertyId);
    const [{ count, maxOrder }] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        maxOrder: max(propertyImages.sortOrder),
      })
      .from(propertyImages)
      .where(eq(propertyImages.propertyId, propertyId));
    const rows = await tx
      .insert(propertyImages)
      .values(
        files.map((file, index) => ({
          propertyId,
          filePath: file.filePath,
          originalName: file.originalName,
          isPrimary: count === 0 && index === 0,
          sortOrder: (maxOrder ?? 0) + index + 1,
        })),
      )
      .returning();
    return toApiObjects(rows);
  });
}

/** يجعل الصورة رئيسية؛ 404 دون تغيير أي علم إن لم تكن صورة لهذا العقار. */
export async function setPrimaryImage(propertyId: number, imageId: number) {
  await db.transaction(async (tx) => {
    await lockProperty(tx, propertyId);
    const [image] = await tx
      .select({ id: propertyImages.id })
      .from(propertyImages)
      .where(
        and(
          eq(propertyImages.id, imageId),
          eq(propertyImages.propertyId, propertyId),
        ),
      );
    if (!image) throw new DomainError(404, "الصورة غير موجودة.");
    await tx
      .update(propertyImages)
      .set({ isPrimary: sql`${propertyImages.id} = ${imageId}` })
      .where(eq(propertyImages.propertyId, propertyId));
  });
}

export async function reorderImages(propertyId: number, orderedIds: number[]) {
  await db.transaction(async (tx) => {
    await lockProperty(tx, propertyId);
    for (let index = 0; index < orderedIds.length; index += 1) {
      await tx
        .update(propertyImages)
        .set({ sortOrder: index + 1 })
        .where(
          and(
            eq(propertyImages.id, orderedIds[index]),
            eq(propertyImages.propertyId, propertyId),
          ),
        );
    }
  });
}

/**
 * يحذف صف صورة من صور العقار propertyId (null إن لم تكن له)، وإن كانت
 * الرئيسية جعل الأولى بالترتيب مكانها، في المعاملة نفسها.
 */
export async function deleteImage(propertyId: number, imageId: number) {
  return db.transaction(async (tx) => {
    await lockProperty(tx, propertyId);
    const [row] = await tx
      .delete(propertyImages)
      .where(
        and(
          eq(propertyImages.id, imageId),
          eq(propertyImages.propertyId, propertyId),
        ),
      )
      .returning();
    if (!row) return null;
    if (row.isPrimary) {
      const [next] = await tx
        .select({ id: propertyImages.id })
        .from(propertyImages)
        .where(eq(propertyImages.propertyId, propertyId))
        .orderBy(asc(propertyImages.sortOrder), asc(propertyImages.id))
        .limit(1);
      if (next)
        await tx
          .update(propertyImages)
          .set({ isPrimary: true })
          .where(eq(propertyImages.id, next.id));
    }
    return row;
  });
}
