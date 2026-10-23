import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";

/**
 * Backup archives are streamed: files go from disk into the zip one at a
 * time, compressed by zlib on the thread pool, so a backup of gigabytes of
 * images neither holds them in memory nor blocks the API. The layout is the
 * one adm-zip wrote before (directory entries included), so older builds
 * restore new archives.
 */

/** A folder stored under `prefix` (no trailing slash) inside the archive. */
export type ArchiveFolder = { dir: string; prefix: string };

/**
 * Writes `buffers` and then every file below each folder to `filePath`,
 * through `<filePath>.partial` renamed on success, so a failed backup never
 * leaves a truncated archive under the final name.
 */
export async function writeArchive(
  filePath: string,
  buffers: Array<{ name: string; data: Buffer }>,
  folders: ArchiveFolder[],
) {
  const partial = `${filePath}.partial`;
  const zip = new yazl.ZipFile();
  // yazl reports unreadable source files on the ZipFile, not on its stream.
  const failed = new Promise<never>((_, reject) => zip.once("error", reject));
  const written = pipeline(zip.outputStream, fs.createWriteStream(partial));
  // Either may fail while folders are still being listed; both are awaited below.
  failed.catch(() => undefined);
  written.catch(() => undefined);
  try {
    for (const { name, data } of buffers) zip.addBuffer(data, name);
    for (const folder of folders)
      await addFolder(zip, folder.dir, folder.prefix);
    zip.end();
    await Promise.race([written, failed]);
    await renameWithRetry(partial, filePath);
  } catch (error) {
    (zip.outputStream as Readable).destroy();
    await written.catch(() => undefined);
    await fs.promises.rm(partial, { force: true });
    throw error;
  }
}

async function addFolder(zip: yazl.ZipFile, dir: string, prefix: string) {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      zip.addEmptyDirectory(name);
      await addFolder(zip, absolute, name);
    } else if (entry.isFile()) {
      zip.addFile(absolute, name);
    }
  }
}

/** A virus scanner may hold a just-written file open for a moment. */
async function renameWithRetry(from: string, to: string) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fs.promises.rename(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 10 || !["EPERM", "EACCES", "EBUSY"].includes(code ?? ""))
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}
