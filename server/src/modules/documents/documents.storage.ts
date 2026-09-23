import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../../infrastructure/config.js";

function decode(data: string) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(data);
  return Buffer.from(match?.[2] ?? data, "base64");
}
function extension(originalName: string | null | undefined, fileType: string) {
  const fromName = originalName?.match(/\.[a-z0-9]{1,8}$/i)?.[0];
  if (fromName) return fromName.toLowerCase();
  const fromType = fileType.split("/")[1]?.replace(/[^a-z0-9]/gi, "");
  return fromType ? `.${fromType}` : ".bin";
}
export function saveManagedFile(
  scope: string,
  data: string,
  originalName: string | null | undefined,
  fileType: string,
) {
  const buffer = decode(data);
  if (!buffer.length) throw new Error("الملف فارغ أو غير صالح.");
  const relativeDirectory = scope.replace(/[^a-z0-9_-]/gi, "-");
  const directory = path.join(config.documentsDir, relativeDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const fileName = `${crypto.randomUUID()}${extension(originalName, fileType)}`;
  const absolute = path.join(directory, fileName);
  fs.writeFileSync(absolute, buffer, { flag: "wx" });
  return {
    filePath: path.join(relativeDirectory, fileName).replaceAll("\\", "/"),
    fileSize: buffer.length,
  };
}
export function resolveManagedFile(filePath: string) {
  const root = path.resolve(config.documentsDir);
  const absolute = path.resolve(root, filePath);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`))
    throw new Error("مسار الملف غير صالح.");
  return absolute;
}
export function deleteManagedFile(filePath: string) {
  try {
    const absolute = resolveManagedFile(filePath);
    if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
  } catch {
    /* لا نحذف أي ملف خارج مجلد المستندات. */
  }
}
export function contentTypeForFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    (
      {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".doc": "application/msword",
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      } as Record<string, string>
    )[ext] ?? "application/octet-stream"
  );
}
