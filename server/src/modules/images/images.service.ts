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
  "image/bmp": ".bmp"
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
export function saveImageToDisk(propertyId: number, data: string, originalName?: string) {
  const { buffer, ext } = decodeImage(data, originalName);
  if (!buffer.length) {
    throw new Error("ملف الصورة فارغ أو غير صالح.");
  }

  const dir = path.join(config.imagesDir, String(propertyId));
  fs.mkdirSync(dir, { recursive: true });

  const fileName = `${crypto.randomUUID()}${ext}`;
  const absolutePath = path.join(dir, fileName);
  fs.writeFileSync(absolutePath, buffer);

  // مسار نسبي لقابلية النقل والنسخ الاحتياطي: "125/uuid.jpg"
  return { filePath: `${propertyId}/${fileName}`, size: buffer.length };
}

export function resolveImageAbsolutePath(filePath: string) {
  return path.join(config.imagesDir, filePath);
}

export function deleteImageFromDisk(filePath: string) {
  try {
    const absolute = resolveImageAbsolutePath(filePath);
    if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
  } catch {
    // تجاهل أخطاء حذف الملف.
  }
}

export function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp"
  };
  return map[ext] ?? "application/octet-stream";
}
