import fs from "node:fs/promises";
import path from "node:path";
import { asc, desc, inArray } from "drizzle-orm";
import { config } from "../../infrastructure/config.js";
import {
  propertyImages,
  rentalImages,
} from "../../infrastructure/database/schema.js";

const inside = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    !path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`)
  );
};

// Optional photos are embedded in new immutable document models. Never resolve
// live image URLs while printing an issued contract, or borrow the other domain.
export async function snapshotAssetImages(
  kind: string,
  ids: number[],
  executor: any,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (!ids.length) return result;
  const table = kind === "rental" ? rentalImages : propertyImages;
  const sourceId =
    kind === "rental" ? rentalImages.rentalId : propertyImages.propertyId;
  const rows = await executor
    .select({ assetId: sourceId, filePath: table.filePath })
    .from(table)
    .where(inArray(sourceId, ids))
    .orderBy(desc(table.isPrimary), asc(table.sortOrder), asc(table.id));
  const root = path.resolve(config.imagesDir);
  for (const row of rows as Array<{ assetId: number; filePath: string }>) {
    if (result.has(row.assetId) || path.isAbsolute(row.filePath)) continue;
    const absolute = path.resolve(root, row.filePath);
    if (!inside(root, absolute)) continue;
    try {
      const real = await fs.realpath(absolute);
      if (!inside(await fs.realpath(root), real)) continue;
      const stat = await fs.stat(real);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024 || stat.size === 0)
        continue;
      const bytes = await fs.readFile(real);
      const mime = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "png"
        : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
          ? "jpeg"
          : bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP"
            ? "webp"
            : null;
      if (mime)
        result.set(
          row.assetId,
          `data:image/${mime};base64,${bytes.toString("base64")}`,
        );
    } catch {
      /* An unavailable optional photo must not block issuance. */
    }
  }
  return result;
}
