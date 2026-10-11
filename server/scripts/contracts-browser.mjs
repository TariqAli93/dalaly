import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(import.meta.resolve("tsx/cli")),
    "--test",
    "scripts/contracts-legal.test.ts",
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, CONTRACT_BROWSER_TEST: "1" },
  },
);
process.exit(result.status ?? 1);
