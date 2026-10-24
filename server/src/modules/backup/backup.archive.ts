import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import zlib from "node:zlib";
import yauzl from "yauzl";
import yazl from "yazl";
import { DomainError } from "../../shared/errors.js";

/**
 * Backup archives are streamed: files go from disk into the zip and back out
 * one at a time, compressed by zlib on the thread pool, so a backup or restore
 * of gigabytes of images neither holds them in memory nor blocks the API.
 * The layout is the one adm-zip wrote before (directory entries included),
 * so archives restore across versions in both directions.
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

/** A zip of `buffers` alone, in memory: the database-only archive. */
export async function zipBuffers(
  buffers: Array<{ name: string; data: Buffer }>,
) {
  const zip = new yazl.ZipFile();
  for (const { name, data } of buffers) zip.addBuffer(data, name);
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
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

export type ArchiveEntry = yauzl.Entry;

/** An archive opened for reading; close() releases its file. */
export type BackupArchive = {
  /** Every entry by name; directory names end with "/". */
  entries: Map<string, ArchiveEntry>;
  /** One entry's contents, after its size and CRC-32 matched. */
  read(entry: ArchiveEntry): Promise<Buffer>;
  close(): Promise<void>;
};

const READ_OPTIONS: yauzl.Options = { lazyEntries: true, autoClose: false };
const inflateRaw = promisify(zlib.inflateRaw);

/**
 * Opens an archive from a file path, read from disk as entries are needed,
 * or from an uploaded buffer. Only the central directory is read up front;
 * each entry is then read in one piece and inflated in one zlib call on the
 * thread pool, which is much cheaper than yauzl's chunked streams.
 */
export async function openArchive(
  source: string | Buffer,
): Promise<BackupArchive> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    const done = (error: Error | null, opened?: yauzl.ZipFile) =>
      error || !opened ? reject(error) : resolve(opened);
    if (typeof source === "string") yauzl.open(source, READ_OPTIONS, done);
    else yauzl.fromBuffer(source, READ_OPTIONS, done);
  });
  let file: fs.promises.FileHandle | undefined;
  try {
    const entries = new Map<string, ArchiveEntry>();
    await new Promise<void>((resolve, reject) => {
      zip.on("entry", (entry: ArchiveEntry) => {
        entries.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.once("end", resolve);
      zip.once("error", reject);
      zip.readEntry();
    });
    if (typeof source === "string") file = await fs.promises.open(source, "r");
    const stored = async (start: number, length: number) => {
      if (!file) return (source as Buffer).subarray(start, start + length);
      const data = Buffer.allocUnsafe(length);
      const { bytesRead } = await file.read(data, 0, length, start);
      if (bytesRead !== length)
        throw new DomainError(
          400,
          "ملف النسخة الاحتياطية ناقص أو تغيّر أثناء القراءة.",
        );
      return data;
    };
    return {
      entries,
      async read(entry) {
        if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod))
          throw new DomainError(
            400,
            `صيغة ملف غير مدعومة داخل النسخة: ${entry.fileName}`,
          );
        const { fileDataStart } = await new Promise<{ fileDataStart: number }>(
          (resolve, reject) =>
            zip.readLocalFileHeader(
              entry,
              { minimal: true },
              (error, header) => (error ? reject(error) : resolve(header)),
            ),
        );
        const raw = await stored(fileDataStart, entry.compressedSize);
        const data =
          entry.compressionMethod === 8 ? await inflateRaw(raw) : raw;
        if (
          data.length !== entry.uncompressedSize ||
          zlib.crc32(data) !== entry.crc32
        )
          throw new DomainError(
            400,
            `ملف تالف داخل النسخة الاحتياطية: ${entry.fileName}`,
          );
        return data;
      },
      async close() {
        zip.close();
        await file?.close();
      },
    };
  } catch (error) {
    zip.close();
    await file?.close();
    throw error;
  }
}
