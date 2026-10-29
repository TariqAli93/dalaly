import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../../infrastructure/config.js";
import { DomainError } from "../../shared/errors.js";

/**
 * امتداد الصورة من بايتاتها الأولى لا من نوعها المعلن أو اسمها، فلا يُخزَّن
 * باسم صورة ملف ليس صورة. null لما ليس صورة مدعومة.
 */
export function imageExtension(buffer: Buffer) {
  const starts = (bytes: number[], offset = 0) =>
    buffer.length >= offset + bytes.length &&
    bytes.every((byte, index) => buffer[offset + index] === byte);
  if (starts([0xff, 0xd8, 0xff])) return ".jpg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return ".png";
  if (starts([0x47, 0x49, 0x46, 0x38])) return ".gif";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8))
    return ".webp";
  if (starts([0x42, 0x4d])) return ".bmp";
  return null;
}

/** يحوّل data URL أو base64 خام إلى Buffer ويتحقق أنه صورة مدعومة. */
function decodeImage(data: string) {
  const match = /^data:image\/[a-zA-Z+.-]+;base64,(.*)$/s.exec(data);
  const buffer = Buffer.from(match ? match[1] : data, "base64");
  if (!buffer.length)
    throw new DomainError(400, "ملف الصورة فارغ أو غير صالح.");
  const ext = imageExtension(buffer);
  if (!ext)
    throw new DomainError(
      400,
      "الملف ليس صورة مدعومة (JPEG أو PNG أو WebP أو GIF أو BMP).",
    );
  return { buffer, ext };
}

/** يحفظ صورة واحدة على القرص ويعيد المسار النسبي (البذور والاختبارات). */
function saveScopedImageToDisk(
  scope: "" | "rentals",
  entityId: number,
  data: string,
) {
  const { buffer, ext } = decodeImage(data);
  const dir = scope
    ? path.join(config.imagesDir, scope, String(entityId))
    : path.join(config.imagesDir, String(entityId));
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return {
    filePath: scope
      ? `${scope}/${entityId}/${fileName}`
      : `${entityId}/${fileName}`,
    size: buffer.length,
  };
}

export function saveImageToDisk(propertyId: number, data: string) {
  return saveScopedImageToDisk("", propertyId, data);
}

export function saveRentalImageToDisk(rentalId: number, data: string) {
  return saveScopedImageToDisk("rentals", rentalId, data);
}

export type ImageUpload = {
  data: string;
  original_name?: string | null;
  thumbnail?: string | null;
};

export type StoredImageFile = {
  filePath: string;
  originalName: string | null;
};

/**
 * يحفظ دفعة صور (وما معها من مصغّرات) لعقار أو إيجار، ثم يمرر مساراتها إلى
 * `insertRows`. تُفحص كل الصور والمصغّرات قبل كتابة أي ملف، وإن فشل الإدراج
 * حُذفت ملفات الدفعة كلها، فلا يبقى على القرص ملف بلا صف.
 */
export async function storeImages<T>(
  scope: "" | "rentals",
  ownerId: number,
  images: ImageUpload[],
  insertRows: (files: StoredImageFile[]) => Promise<T>,
) {
  const decoded = images.map((item) => ({
    ...decodeImage(item.data),
    originalName: item.original_name ?? null,
    thumbnail: item.thumbnail ? decodeThumbnail(item.thumbnail) : null,
  }));
  const dir = scope
    ? path.join(config.imagesDir, scope, String(ownerId))
    : path.join(config.imagesDir, String(ownerId));
  const written: string[] = [];
  try {
    fs.mkdirSync(dir, { recursive: true });
    const files = decoded.map((item) => {
      const fileName = `${crypto.randomUUID()}${item.ext}`;
      const filePath = scope
        ? `${scope}/${ownerId}/${fileName}`
        : `${ownerId}/${fileName}`;
      fs.writeFileSync(path.join(dir, fileName), item.buffer, { flag: "wx" });
      written.push(filePath);
      if (item.thumbnail) writeThumbnail(filePath, item.thumbnail);
      return { filePath, originalName: item.originalName };
    });
    return await insertRows(files);
  } catch (error) {
    for (const filePath of written) deleteImageFromDisk(filePath);
    throw error;
  }
}

/**
 * المسار المطلق لملف صورة، أو null إن خرج المسار المخزَّن عن مجلد الصور
 * (مثلاً صف معدَّل في نسخة احتياطية مستعادة).
 */
export function resolveImageAbsolutePath(filePath: string) {
  const root = path.resolve(config.imagesDir);
  const absolute = path.resolve(root, filePath);
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null;
}

/**
 * يحذف ملف الصورة ومصغّرتها إن وُجدت. لا يرمي (الصف حُذف قبله)؛ يعيد false
 * إن بقي ملف لم يُحذف (مقفول مثلاً) ليسجله المستدعي.
 */
export function deleteImageFromDisk(filePath: string) {
  let removed = true;
  for (const absolute of [
    resolveImageAbsolutePath(filePath),
    resolveThumbnailPath(filePath),
  ]) {
    try {
      if (absolute) fs.rmSync(absolute, { force: true });
    } catch {
      removed = false;
    }
  }
  return removed;
}

/**
 * يحذف ملفات صور عقار أو إيجار حُذف (حذفت القاعدة صفوفها معه) ومجلده إن
 * فرغ. يعيد مسارات ما تعذر حذفه.
 */
export function deleteOwnerImageFiles(
  scope: "" | "rentals",
  ownerId: number,
  filePaths: string[],
) {
  const failed = filePaths.filter((filePath) => !deleteImageFromDisk(filePath));
  const dir = scope
    ? path.join(config.imagesDir, scope, String(ownerId))
    : path.join(config.imagesDir, String(ownerId));
  try {
    if (fs.existsSync(dir) && !fs.readdirSync(dir).length) fs.rmdirSync(dir);
  } catch {
    // مجلد فارغ باقٍ لا يضر.
  }
  return failed;
}

/** أكبر حجم لمصغّرة: الواجهة تصنعها بعرض 320 بكسل فتأتي بعشرات الكيلوبايت. */
export const THUMBNAIL_MAX_BYTES = 256 * 1024;

/**
 * مجلد المصغّرات بجوار مجلد الصور لا بداخله، فالنسخ الاحتياطية (التي تضم
 * مجلد الصور) لا تحملها، وتُصنع من جديد متى غابت. تُصنع في الواجهة من
 * الأصل، والخادم يخزنها ويقدمها فقط؛ لا يُعدَّل الأصل أبداً.
 */
function thumbnailsRoot() {
  return path.join(path.dirname(path.resolve(config.imagesDir)), "thumbnails");
}

/**
 * مسار مصغّرة الصورة المخزَّنة في filePath (مشتق منه: الاسم فريد لكل أصل
 * ولا يتغير، فتبقى المصغّرة صحيحة بعد الاسترجاع)، أو null إن خرج عن المجلد.
 */
export function resolveThumbnailPath(filePath: string) {
  const root = thumbnailsRoot();
  const absolute = path.resolve(root, `${filePath}.jpg`);
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null;
}

export async function hasThumbnail(filePath: string) {
  const absolute = resolveThumbnailPath(filePath);
  if (!absolute) return false;
  try {
    await fs.promises.access(absolute);
    return true;
  } catch {
    return false;
  }
}

/** يفك data URL لمصغّرة JPEG ويتحقق أنها JPEG فعلاً. */
export function decodeThumbnail(data: string) {
  const buffer = Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
  const isJpeg =
    buffer.length > 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  if (!isJpeg || buffer.length > THUMBNAIL_MAX_BYTES)
    throw new DomainError(400, "المصغّرة ليست صورة JPEG صالحة.");
  return buffer;
}

/** يكتب المصغّرة دفعة واحدة (ملف مؤقت ثم إعادة تسمية) فلا تُقرأ نصف مكتوبة. */
export function writeThumbnail(filePath: string, thumbnail: Buffer) {
  const target = resolveThumbnailPath(filePath);
  if (!target) throw new DomainError(400, "مسار الصورة غير صالح.");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, thumbnail);
  fs.renameSync(temporary, target);
}

type StoredImage = { id: number; filePath: string };

/**
 * يضيف لكل صف primary_image: الصورة التي يعرضها الجدول ووجود مصغّرتها،
 * فلا يطلب الجدول قائمة صور لكل صف. `primaryImages` يعيدها لمعرفات الصفوف.
 */
export async function withPrimaryImages<T extends Record<string, unknown>>(
  rows: T[],
  primaryImages: (ids: number[]) => Promise<Map<number, StoredImage>>,
) {
  const images = await primaryImages(rows.map((row) => Number(row.id)));
  return Promise.all(
    rows.map(async (row) => {
      const image = images.get(Number(row.id));
      return {
        ...row,
        primary_image: image
          ? { id: image.id, thumbnail: await hasThumbnail(image.filePath) }
          : null,
      };
    }),
  );
}

export function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
  };
  return map[ext] ?? "application/octet-stream";
}
