/**
 * Puts the pinned cloudflared release at tools/cloudflared/cloudflared.exe,
 * where electron-builder copies it into the package (extraResources) and the
 * API looks for it (CLOUDFLARED_PATH). Remote access is optional and the app
 * runs without the file, so only the packaging scripts call this.
 *
 *   node scripts/fetch-cloudflared.mjs
 *
 * Does nothing when the file is already there with the pinned hash. Otherwise
 * it downloads the official release asset from GitHub, checks its SHA-256 and
 * only then replaces the file. Without network access, copy a matching
 * cloudflared.exe there by hand; it is accepted on its hash alone.
 *
 * To move to a newer release, change VERSION and SHA256 to that release's
 * cloudflared-windows-amd64.exe; its release notes list the checksums.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const VERSION = "2026.5.0";
const SHA256 = "f141cded099c239171ad2cea6fb5da0fdaa2bd36104c3074d883f9546519eba7";
const DOWNLOAD_URL = `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-windows-amd64.exe`;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "tools", "cloudflared", "cloudflared.exe");
const PARTIAL = `${TARGET}.download`;
const RELATIVE_TARGET = path.relative(ROOT, TARGET);

async function sha256Of(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** Downloads beside the target and renames only a verified file over it. */
async function download() {
  const response = await fetch(DOWNLOAD_URL, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(PARTIAL));

  const actual = await sha256Of(PARTIAL);
  if (actual !== SHA256) {
    throw new Error(`SHA-256 mismatch: expected ${SHA256}, got ${actual}`);
  }
  fs.renameSync(PARTIAL, TARGET);
}

if (fs.existsSync(TARGET)) {
  if ((await sha256Of(TARGET)) === SHA256) {
    console.log(`cloudflared ${VERSION} already at ${RELATIVE_TARGET} (SHA-256 verified).`);
    process.exit(0);
  }
  console.log(`${RELATIVE_TARGET} does not match cloudflared ${VERSION}; replacing it.`);
}

console.log(`Downloading cloudflared ${VERSION} from ${DOWNLOAD_URL}`);
fs.mkdirSync(path.dirname(TARGET), { recursive: true });
try {
  await download();
  console.log(`cloudflared ${VERSION} written to ${RELATIVE_TARGET} (SHA-256 verified).`);
} catch (error) {
  // fetch() reports network failures as "fetch failed" with the reason in cause.
  const reason = error.cause?.message ? `${error.message}: ${error.cause.message}` : error.message;
  console.error(`Could not fetch cloudflared ${VERSION}: ${reason}`);
  console.error(
    `Place the official cloudflared-windows-amd64.exe ${VERSION} at ${RELATIVE_TARGET} and package again.`,
  );
  process.exitCode = 1;
} finally {
  fs.rmSync(PARTIAL, { force: true });
}
