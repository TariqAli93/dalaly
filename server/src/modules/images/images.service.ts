import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../../infrastructure/config.js";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
};

/** يحوّل data URL أو base64 خام إلى Buffer مع امتداد مناسب. */
function decodeImage(data: string, originalName?: string) {
  let mime = "image/jpeg";
  let base64 = data;
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/s.exec(data);
  if (match) {
    mime = match[1];
    base64 = match[2];
  }

  const buffer = Buffer.from(base64, "base64");
  let ext = EXT_BY_MIME[mime] ?? "";
  if (!ext && originalName) {
    const fromName = path.extname(originalName).toLowerCase();
    if (fromName) ext = fromName;
  }
  if (!ext) ext = ".jpg";

  return { buffer, ext };
}

/** يحفظ صورة على القرص ويعيد المسار النسبي المخزَّن في القاعدة. */
export function saveScopedImageToDisk(
  scope: string,
  entityId: number,
  data: string,
  originalName?: string,
) {
  const { buffer, ext } = decodeImage(data, originalName);
  if (!buffer.length) throw new Error("ملف الصورة فارغ أو غير صالح.");
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

export function saveImageToDisk(
  propertyId: number,
  data: string,
  originalName?: string,
) {
  return saveScopedImageToDisk("", propertyId, data, originalName);
}

export function saveRentalImageToDisk(
  rentalId: number,
  data: string,
  originalName?: string,
) {
  return saveScopedImageToDisk("rentals", rentalId, data, originalName);
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

/** يحذف ملف الصورة ومصغّرتها إن وُجدت. */
export function deleteImageFromDisk(filePath: string) {
  for (const absolute of [
    resolveImageAbsolutePath(filePath),
    resolveThumbnailPath(filePath),
  ]) {
    try {
      if (absolute && fs.existsSync(absolute)) fs.unlinkSync(absolute);
    } catch {
      // تجاهل أخطاء حذف الملف.
    }
  }
}

/** أكبر حجم لمصغّرة: الواجهة تصنعها بعرض 320 بكسل فتأتي بعشرات الكيلوبايت. */
export const THUMBNAIL_MAX_BYTES = 256 * 1024;

export class ThumbnailError extends Error {
  readonly statusCode = 400;
}

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
    throw new ThumbnailError("المصغّرة ليست صورة JPEG صالحة.");
  return buffer;
}

/** يكتب المصغّرة دفعة واحدة (ملف مؤقت ثم إعادة تسمية) فلا تُقرأ نصف مكتوبة. */
export function writeThumbnail(filePath: string, thumbnail: Buffer) {
  const target = resolveThumbnailPath(filePath);
  if (!target) throw new ThumbnailError("مسار الصورة غير صالح.");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, thumbnail);
  fs.renameSync(temporary, target);
}
