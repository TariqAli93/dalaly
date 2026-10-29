import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { config } from "../src/infrastructure/config.js";
import {
  disableRemoteAccess,
  enableRemoteAccess,
  getRemoteStatus,
  stopLeftoverTunnel,
  stopRemoteAccess,
} from "../src/modules/remote-access/remote-access.service.js";

// No database. A fake cloudflared: Node runs ./tunnel (the first argument the
// service passes) from a temporary folder, prints a tunnel URL and stays up.

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function until(check: () => boolean, what: string, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await delay(25);
  }
}

test("the tunnel process is tracked, stopped and never left behind", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dalaly-tunnel-"));
  const saved = { cwd: process.cwd(), path: config.cloudflaredPath, data: config.appDataDir };
  fs.writeFileSync(
    path.join(root, "tunnel"),
    'process.stdout.write("INF |  https://fake-test.trycloudflare.com  |\\n"); setInterval(() => {}, 1000);',
  );
  process.chdir(root);
  config.cloudflaredPath = process.execPath;
  config.appDataDir = root;
  const pidFile = path.join(root, "remote-access.pid");
  const recordedPid = () => (fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, "utf8")) : null);
  try {
    await t.test("enable starts it, reads its URL and records its process", async () => {
      enableRemoteAccess();
      await until(() => getRemoteStatus().url !== null, "the tunnel URL");
      assert.deepEqual(getRemoteStatus(), {
        running: true,
        url: "https://fake-test.trycloudflare.com",
        message: "الاتصال الخارجي يعمل.",
      });
      assert.ok(recordedPid() && alive(recordedPid()!));
    });

    await t.test("the old process's exit does not forget a tunnel started after it", async () => {
      const first = recordedPid()!;
      disableRemoteAccess();
      enableRemoteAccess();
      const second = recordedPid()!;
      assert.notEqual(second, first);
      await until(() => !alive(first), "the first tunnel to exit");
      await delay(100);
      assert.equal(getRemoteStatus().running, true, "the new tunnel is still tracked");
      disableRemoteAccess();
      await until(() => !alive(second), "the second tunnel to exit");
      assert.equal(getRemoteStatus().running, false);
      assert.equal(recordedPid(), null, "its record is removed");
    });

    await t.test("stopping on API exit ends the process", async () => {
      enableRemoteAccess();
      const pid = recordedPid()!;
      stopRemoteAccess();
      await until(() => !alive(pid), "the tunnel to exit");
      assert.equal(getRemoteStatus().running, false);
    });

    await t.test("a tunnel that cannot start is a message, not a crash", async () => {
      config.cloudflaredPath = root; // a folder: exists, but cannot be run
      const status = enableRemoteAccess();
      await delay(300);
      assert.equal(getRemoteStatus().running, false, JSON.stringify(status));
      assert.equal(getRemoteStatus().message, "تعذر تشغيل الاتصال الخارجي.");
      config.cloudflaredPath = process.execPath;
    });

    await t.test("a leftover record of another program is cleared without stopping it", async () => {
      const other = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
      try {
        fs.writeFileSync(pidFile, String(other.pid));
        assert.equal(stopLeftoverTunnel(), false);
        assert.equal(alive(other.pid!), true, "a process that is not cloudflared keeps running");
        assert.equal(fs.existsSync(pidFile), false);
      } finally {
        other.kill();
      }
    });
  } finally {
    stopRemoteAccess();
    process.chdir(saved.cwd);
    config.cloudflaredPath = saved.path;
    config.appDataDir = saved.data;
    await delay(200);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
