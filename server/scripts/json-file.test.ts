import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readJsonFile, writeJsonFile } from "../../apps/desktop/src/json-file.js";

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dalaly-json-"));
  return { file: path.join(dir, "config.json"), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("a missing config reads as empty, not from the backup copy", () => {
  const { file, cleanup } = tempFile();
  try {
    fs.writeFileSync(`${file}.bak`, JSON.stringify({ databaseUrl: "old" }));
    assert.deepEqual(readJsonFile(file), { value: {} });
  } finally {
    cleanup();
  }
});

test("writes replace the file, keep the previous version and leave no temp file", () => {
  const { file, cleanup } = tempFile();
  try {
    writeJsonFile(file, { databaseUrl: "first" });
    writeJsonFile(file, { databaseUrl: "second" });
    assert.deepEqual(readJsonFile(file).value, { databaseUrl: "second" });
    assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, "utf8")), { databaseUrl: "first" });
    assert.equal(fs.existsSync(`${file}.tmp`), false);
  } finally {
    cleanup();
  }
});

test("a truncated config falls back to the backup copy", () => {
  const { file, cleanup } = tempFile();
  try {
    writeJsonFile(file, { databaseUrl: "good" });
    writeJsonFile(file, { databaseUrl: "newer" });
    fs.writeFileSync(file, '{"databaseUrl": "ne'); // torn write
    const result = readJsonFile(file);
    assert.deepEqual(result.value, { databaseUrl: "good" });
    assert.equal(result.recoveredFrom, `${file}.bak`);
    fs.rmSync(`${file}.bak`);
    assert.deepEqual(readJsonFile(file).value, {}, "no usable copy reads as empty");
  } finally {
    cleanup();
  }
});
