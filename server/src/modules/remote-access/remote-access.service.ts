import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "../../infrastructure/config.js";

type RemoteStatus = {
  running: boolean;
  url: string | null;
  message: string | null;
};

let processRef: ChildProcessWithoutNullStreams | null = null;
let publicUrl: string | null = null;
let lastMessage: string | null = null;

export function getRemoteStatus(): RemoteStatus {
  return {
    running: Boolean(processRef && !processRef.killed),
    url: publicUrl,
    message: lastMessage,
  };
}

/**
 * The running tunnel's process id, so the next start can stop a cloudflared
 * this API left behind (its process was terminated before it could stop it).
 */
function pidFile() {
  return path.join(config.appDataDir, "remote-access.pid");
}

export function enableRemoteAccess(): RemoteStatus {
  if (processRef && !processRef.killed) {
    return getRemoteStatus();
  }

  const executablePath = resolveCloudflaredPath();

  if (!fs.existsSync(executablePath)) {
    lastMessage = "cloudflared.exe غير موجود. الاتصال الخارجي غير متاح.";
    return getRemoteStatus();
  }

  publicUrl = null;
  lastMessage = "جاري تشغيل الاتصال الخارجي.";
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(
      executablePath,
      ["tunnel", "--url", `http://${config.apiHost}:${config.apiPort}`],
      { windowsHide: true },
    );
  } catch {
    lastMessage = "تعذر تشغيل الاتصال الخارجي.";
    return getRemoteStatus();
  }
  processRef = child;
  writePid(child.pid);

  child.stdout.on("data", (chunk) => parseCloudflaredOutput(child, chunk));
  child.stderr.on("data", (chunk) => parseCloudflaredOutput(child, chunk));
  // A failed spawn (blocked by antivirus, no permission) is an "error" event;
  // without a listener it would crash the API.
  child.on("error", () => {
    if (processRef !== child) return;
    processRef = null;
    publicUrl = null;
    removePid(child.pid);
    lastMessage = "تعذر تشغيل الاتصال الخارجي.";
  });
  // Only the current tunnel's exit clears the state: after a disable and a
  // new enable, the old process exits later and must not forget the new one.
  child.on("exit", () => {
    removePid(child.pid);
    if (processRef !== child) return;
    processRef = null;
    publicUrl = null;
    lastMessage = "تم إيقاف الاتصال الخارجي.";
  });

  return getRemoteStatus();
}

export function disableRemoteAccess(): RemoteStatus {
  stopRemoteAccess();
  lastMessage = "تم إيقاف الاتصال الخارجي.";
  return getRemoteStatus();
}

/** Stops the tunnel without waiting; also called when the API exits. */
export function stopRemoteAccess() {
  const child = processRef;
  processRef = null;
  publicUrl = null;
  if (child && !child.killed) {
    child.kill();
    removePid(child.pid);
  }
}

/**
 * Stops a cloudflared that a previous run of the API started and could not
 * stop, if its recorded process is still a cloudflared. Windows only, where
 * terminating the API leaves its children running.
 */
export function stopLeftoverTunnel() {
  let pid: number;
  try {
    pid = Number(fs.readFileSync(pidFile(), "utf8").trim());
  } catch {
    return false;
  }
  removePid(pid);
  if (process.platform !== "win32" || !Number.isInteger(pid) || pid <= 0)
    return false;
  const listed = spawnSync(
    "tasklist",
    ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
    { encoding: "utf8", windowsHide: true },
  );
  if (!/^"cloudflared(?:\.exe)?",/im.test(listed.stdout ?? "")) return false;
  spawnSync("taskkill", ["/PID", String(pid), "/F"], { windowsHide: true });
  return true;
}

function writePid(pid: number | undefined) {
  if (!pid) return;
  try {
    fs.mkdirSync(config.appDataDir, { recursive: true });
    fs.writeFileSync(pidFile(), String(pid));
  } catch {
    // Without the file a leftover tunnel is not stopped at the next start.
  }
}

function removePid(pid: number | undefined) {
  try {
    if (pid && fs.readFileSync(pidFile(), "utf8").trim() === String(pid))
      fs.rmSync(pidFile(), { force: true });
  } catch {
    // Already gone.
  }
}

function parseCloudflaredOutput(
  child: ChildProcessWithoutNullStreams,
  output: unknown,
) {
  if (processRef !== child) return;
  const match = String(output).match(/https:\/\/[^\s]+\.trycloudflare\.com/);
  if (match) {
    publicUrl = match[0];
    lastMessage = "الاتصال الخارجي يعمل.";
  }
}

function resolveCloudflaredPath() {
  if (path.isAbsolute(config.cloudflaredPath)) {
    return config.cloudflaredPath;
  }

  return path.resolve(process.cwd(), "..", config.cloudflaredPath);
}
