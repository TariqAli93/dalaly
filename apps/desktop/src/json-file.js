import fs from "node:fs";
import path from "node:path";

// Pure file helpers for config.json (unit tested from server/scripts).

/**
 * Writes JSON without ever leaving a half-written file: the new content goes
 * to a temporary file that replaces the old one, and the previous version is
 * kept as `.bak`. A power cut during a plain write used to truncate
 * config.json and send the office back to Setup.
 */
export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  if (fs.existsSync(filePath)) fs.copyFileSync(filePath, `${filePath}.bak`);
  try {
    fs.renameSync(temporary, filePath);
  } catch {
    // Windows can refuse the replace while another process (antivirus,
    // backup software) holds the file open; fall back to a direct write.
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
    fs.rmSync(temporary, { force: true });
  }
}

/**
 * Reads JSON. A missing file means "not configured" ({}); a file that exists
 * but does not parse falls back to the `.bak` copy. `recoveredFrom` names the
 * file actually used when it was not the main one.
 */
export function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return { value: {} };
  try {
    return { value: JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch (error) {
    const backup = `${filePath}.bak`;
    try {
      return {
        value: JSON.parse(fs.readFileSync(backup, "utf8")),
        recoveredFrom: backup,
        error,
      };
    } catch {
      return { value: {}, error };
    }
  }
}
