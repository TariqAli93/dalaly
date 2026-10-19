import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const sources = fs.readdirSync(root, { recursive: true })
  .filter((file) => /\.(?:c?js)$/.test(file))
  .map((file) => path.join(root, file));
for (const source of sources) {
  const result = spawnSync(process.execPath, ["--check", source], {
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Electron JavaScript syntax verified (${sources.length} files).`);
