import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const [url, destination] = process.argv.slice(2);
if (!url?.startsWith("https://mirror.freedif.org/TDF/libreoffice/") || !destination) throw new Error("Invalid document renderer source");
const { stdout } = await run("curl.exe", ["-I", "--fail", "--silent", "--show-error", "--max-time", "30", url], { windowsHide: true });
const size = Number([...stdout.matchAll(/content-length:\s*(\d+)/ig)].at(-1)?.[1]);
if (!size || size > 600 * 1024 * 1024) throw new Error("Invalid download size");
const chunk = 4 * 1024 * 1024, count = Math.ceil(size / chunk);
let next = 0, complete = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < count) {
    const index = next++, start = index * chunk, end = Math.min(size - 1, start + chunk - 1);
    const file = `${destination}.part-${index}`;
    let received = 0;
    try { received = (await fs.stat(file)).size; } catch { await fs.writeFile(file, Buffer.alloc(0)); }
    if (received > end - start + 1) throw new Error("Invalid existing chunk");
    let failures = 0;
    while (received < end - start + 1) {
      const partial = `${file}.next`;
      const pieceEnd = Math.min(end, start + received + 1024 * 1024 - 1);
      try { await run("curl.exe", ["--fail", "--silent", "--show-error", "--connect-timeout", "15", "--max-time", "60", "--range", `${start + received}-${pieceEnd}`, "-o", partial, url], { windowsHide: true }); } catch { /* keep successfully transferred range bytes */ }
      let bytes = Buffer.alloc(0);
      try { bytes = await fs.readFile(partial); await fs.unlink(partial); } catch { /* no response */ }
      if (bytes.length > pieceEnd - start - received + 1) throw new Error("Server did not honor byte ranges");
      if (!bytes.length) { if (++failures > 4) throw new Error("Document renderer download stalled"); continue; }
      failures = 0;
      await fs.appendFile(file, bytes); received += bytes.length;
    }
    if ((await fs.stat(file)).size !== end - start + 1) throw new Error("Invalid ranged download");
    complete++;
    if (complete % 20 === 0) process.stdout.write(`Document renderer downloaded: ${Math.round(100 * complete / count)}%\n`);
  }
}));
const output = await fs.open(destination, "w");
try { for (let i = 0; i < count; i++) await output.write(await fs.readFile(`${destination}.part-${i}`)); }
finally { await output.close(); }
for (let i = 0; i < count; i++) await fs.unlink(`${destination}.part-${i}`);
