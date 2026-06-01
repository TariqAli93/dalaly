import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "../../infrastructure/config.js";

type RemoteStatus = {
  enabled: boolean;
  running: boolean;
  url: string | null;
  message: string | null;
};

let processRef: ChildProcessWithoutNullStreams | null = null;
let publicUrl: string | null = null;
let lastMessage: string | null = null;

export function getRemoteStatus(): RemoteStatus {
  return {
    enabled: config.remoteAccessEnabled,
    running: Boolean(processRef && !processRef.killed),
    url: publicUrl,
    message: lastMessage
  };
}

export function enableRemoteAccess(): RemoteStatus {
  if (processRef && !processRef.killed) {
    return getRemoteStatus();
  }

  const executablePath = resolveCloudflaredPath();

  if (!fs.existsSync(executablePath)) {
    lastMessage =
      "cloudflared.exe غير موجود. الاتصال الخارجي غير متاح.";
    return getRemoteStatus();
  }

  publicUrl = null;
  lastMessage = "جاري تشغيل الاتصال الخارجي.";
  processRef = spawn(executablePath, [
    "tunnel",
    "--url",
    `http://${config.apiHost}:${config.apiPort}`
  ]);

  processRef.stdout.on("data", (chunk) => parseCloudflaredOutput(String(chunk)));
  processRef.stderr.on("data", (chunk) => parseCloudflaredOutput(String(chunk)));
  processRef.on("exit", () => {
    processRef = null;
    lastMessage = "تم إيقاف الاتصال الخارجي.";
  });

  return getRemoteStatus();
}

export function disableRemoteAccess(): RemoteStatus {
  if (processRef && !processRef.killed) {
    processRef.kill();
  }

  processRef = null;
  publicUrl = null;
  lastMessage = "تم إيقاف الاتصال الخارجي.";
  return getRemoteStatus();
}

function parseCloudflaredOutput(output: string) {
  const match = output.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
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
