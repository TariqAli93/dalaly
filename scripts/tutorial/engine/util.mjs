// Shared helpers for Dalaly Tutorial Studio: paths, structured logging,
// hashing, child processes and the small schema checks the planner relies on.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const STUDIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = path.resolve(STUDIO_DIR, "../..");
export const SERVER_DIR = path.join(ROOT, "server");
export const RENDERER_DIR = path.join(ROOT, "apps", "renderer");
export const DESKTOP_DIR = path.join(ROOT, "apps", "desktop");

// Workspace packages are not hoisted to the root by pnpm.
export const requireServer = createRequire(path.join(SERVER_DIR, "package.json"));
export const requireRenderer = createRequire(path.join(RENDERER_DIR, "package.json"));
export const requireDesktop = createRequire(path.join(DESKTOP_DIR, "package.json"));

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
}

export function fileHash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** JSON-lines log in the run folder plus a short console line. */
export function createLogger(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stream = fs.createWriteStream(file, { flags: "a" });
  const write = (level, event, data = {}) => {
    const entry = { time: new Date().toISOString(), level, event, ...data };
    stream.write(`${JSON.stringify(entry)}\n`);
    const detail = data.message ?? data.lesson ?? data.step ?? "";
    const line = `[${entry.time.slice(11, 19)}] ${level === "error" ? "✗" : level === "warn" ? "!" : "·"} ${event}${detail ? ` — ${detail}` : ""}`;
    (level === "error" ? console.error : console.log)(line);
  };
  return {
    info: (event, data) => write("info", event, data),
    warn: (event, data) => write("warn", event, data),
    error: (event, data) => write("error", event, data),
    close: () => new Promise((resolve) => stream.end(resolve)),
  };
}

/** Runs a command to completion; rejects with its output on a non-zero exit. */
export function run(command, args, { cwd = ROOT, env = process.env, input, timeoutMs = 10 * 60_000, quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!quiet) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (!quiet) process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(`${path.basename(command)} exited with ${code}: ${(stderr || stdout).slice(-2000)}`), { code, stdout, stderr }));
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

export function portInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect(port, host);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** A minimal dotenv reader: KEY=VALUE lines, comments ignored. Read only. */
export function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

/** process.env first, then the developer's root .env (never written). */
export function secret(name) {
  return process.env[name]?.trim() || readEnvFile(path.join(ROOT, ".env"))[name]?.trim() || "";
}

/**
 * Deletes a folder only when it lies inside `parent` and carries the studio's
 * ownership marker, so a misconfigured path can never remove user data.
 */
export const OWNER_MARKER = ".dalaly-tutorial-studio";
export function removeOwnedDirectory(directory, parent) {
  const resolved = path.resolve(directory);
  const base = path.resolve(parent);
  if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error(`Refusing to remove ${resolved}: outside ${base}`);
  if (!fs.existsSync(resolved)) return;
  if (!fs.existsSync(path.join(resolved, OWNER_MARKER))) throw new Error(`Refusing to remove ${resolved}: no ${OWNER_MARKER} marker`);
  fs.rmSync(resolved, { recursive: true, force: true });
}
export function createOwnedDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, OWNER_MARKER), "Created by Dalaly Tutorial Studio (scripts/tutorial). Safe to delete.\n");
}

/**
 * Structural checks for planner output. `shape` mirrors the value:
 * "string" | "number" | "boolean" | [shape] | { key: shape, "key?": shape }.
 * Returns a list of problems (empty when valid).
 */
export function checkShape(value, shape, where = "$") {
  const problems = [];
  if (typeof shape === "string") {
    const kind = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    if (shape === "any") return problems;
    if (kind !== shape) problems.push(`${where}: expected ${shape}, got ${kind}`);
    return problems;
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) return [`${where}: expected array`];
    value.forEach((item, index) => problems.push(...checkShape(item, shape[0], `${where}[${index}]`)));
    return problems;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`${where}: expected object`];
  for (const [rawKey, inner] of Object.entries(shape)) {
    const optional = rawKey.endsWith("?");
    const key = optional ? rawKey.slice(0, -1) : rawKey;
    if (value[key] === undefined) {
      if (!optional) problems.push(`${where}.${key}: missing`);
      continue;
    }
    problems.push(...checkShape(value[key], inner, `${where}.${key}`));
  }
  return problems;
}

export function formatDuration(seconds) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
