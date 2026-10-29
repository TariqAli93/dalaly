import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import type { Transaction } from "../../infrastructure/database/record-codes.js";
import { rentalImages, rentals } from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { toApiObjects } from "../../shared/utils/case.js";
import { type PrimaryImageRow } from "../images/images.repository.js";
import type { StoredImageFile } from "../images/images.service.js";

export async function listRentalImages(rentalId: number) {
  return toApiObjects(
    await db
      .select()
      .from(rentalImages)
      .where(eq(rentalImages.rentalId, rentalId))
      .orderBy(asc(rentalImages.sortOrder), asc(rentalImages.id)),
  );
}
/** الصورة التي يعرضها جدول الإيجارات لكل إيجار: الرئيسية، وإلا الأولى بالترتيب. */
export async function primaryRentalImagesOf(rentalIds: number[]) {
  if (!rentalIds.length) return new Map<number, PrimaryImageRow>();
  const rows = await db
    .selectDistinctOn([rentalImages.rentalId], {
      ownerId: rentalImages.rentalId,
      id: rentalImages.id,
      filePath: rentalImages.filePath,
    })
    .from(rentalImages)
    .where(inArray(rentalImages.rentalId, rentalIds))
    .orderBy(
      rentalImages.rentalId,
      desc(rentalImages.isPrimary),
      asc(rentalImages.sortOrder),
      asc(rentalImages.id),
    );
  return new Map(rows.map(({ ownerId, ...image }) => [ownerId, image]));
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
/**
 * يقفل صف الإيجار حتى نهاية المعاملة، فتتعاقب عمليات صوره ولا يُحذف في
 * أثنائها. يرمي 404 إن لم يكن موجوداً.
 */
async function lockRental(tx: Transaction, rentalId: number) {
  const [row] = await tx
    .select({ id: rentals.id })
    .from(rentals)
    .where(eq(rentals.id, rentalId))
    .for("no key update");
  if (!row) throw new DomainError(404, "الإيجار غير موجود.");
}

export async function assertRentalExists(rentalId: number) {
  const [row] = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(eq(rentals.id, rentalId));
  if (!row) throw new DomainError(404, "الإيجار غير موجود.");
}

/** صفوف دفعة صور حُفظت ملفاتها، كلها أو لا شيء؛ كما في صور العقارات. */
export async function addRentalImages(
  rentalId: number,
  files: StoredImageFile[],
) {
  return db.transaction(async (tx) => {
    await lockRental(tx, rentalId);
    const [{ count, maxOrder }] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        maxOrder: max(rentalImages.sortOrder),
      })
      .from(rentalImages)
      .where(eq(rentalImages.rentalId, rentalId));
    const rows = await tx
      .insert(rentalImages)
      .values(
        files.map((file, index) => ({
          rentalId,
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

/** يجعل الصورة رئيسية؛ 404 دون تغيير أي علم إن لم تكن صورة لهذا الإيجار. */
export async function setPrimaryRentalImage(rentalId: number, imageId: number) {
  await db.transaction(async (tx) => {
    await lockRental(tx, rentalId);
    const [image] = await tx
      .select({ id: rentalImages.id })
      .from(rentalImages)
      .where(
        and(eq(rentalImages.id, imageId), eq(rentalImages.rentalId, rentalId)),
      );
    if (!image) throw new DomainError(404, "الصورة غير موجودة.");
    await tx
      .update(rentalImages)
      .set({ isPrimary: sql`${rentalImages.id} = ${imageId}` })
      .where(eq(rentalImages.rentalId, rentalId));
  });
}
export async function reorderRentalImages(
  rentalId: number,
  orderedIds: number[],
) {
  await db.transaction(async (tx) => {
    await lockRental(tx, rentalId);
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
/** يحذف صف صورة الإيجار ويعيّن رئيسية بدلها إن كانت هي، في معاملة واحدة. */
export async function deleteRentalImage(rentalId: number, imageId: number) {
  return db.transaction(async (tx) => {
    await lockRental(tx, rentalId);
    const [row] = await tx
      .delete(rentalImages)
      .where(
        and(eq(rentalImages.id, imageId), eq(rentalImages.rentalId, rentalId)),
      )
      .returning();
    if (!row) return null;
    if (row.isPrimary) {
      const [next] = await tx
        .select({ id: rentalImages.id })
        .from(rentalImages)
        .where(eq(rentalImages.rentalId, rentalId))
        .orderBy(asc(rentalImages.sortOrder), asc(rentalImages.id))
        .limit(1);
      if (next)
        await tx
          .update(rentalImages)
          .set({ isPrimary: true })
          .where(eq(rentalImages.id, next.id));
    }
    return row;
  });
}
