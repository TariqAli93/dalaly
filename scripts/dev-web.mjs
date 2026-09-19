/**
 * pnpm dev:web — يشغّل دلالي كنسخة ويب محلية (وضع web-demo).
 *
 *   API   : http://127.0.0.1:45699/api   (قاعدة dalaly_demo، معزولة)
 *   الواجهة: http://127.0.0.1:5199
 *
 * لا يغيّر شيئاً في نسخة Electron: منفذ مختلف، قاعدة مختلفة، ملف بيئة مختلف.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import {
  RENDERER_DIR,
  SERVER_DIR,
  WEB_DEMO,
  WEB_DEMO_BASE_URL,
  serverEnv,
} from "./web-demo-env.mjs";

const children = [];
let shuttingDown = false;

function run(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  const prefix = `[${name}]`;
  child.stdout.on("data", (chunk) => process.stdout.write(`${prefix} ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`${prefix} ${chunk}`));
  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.error(`${prefix} انتهى برمز ${code}.`);
    shutdown(code ?? 1);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // تجاهل
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function waitForPort(host, port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, host);
      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`تعذّر الاتصال بـ ${host}:${port} خلال المهلة.`));
          return;
        }
        setTimeout(attempt, 400);
      });
    };
    attempt();
  });
}

console.log("→ تشغيل API في وضع web-demo…");
run("api", "pnpm", ["exec", "tsx", "watch", "src/index.ts"], SERVER_DIR, serverEnv());

await waitForPort(WEB_DEMO.apiHost, WEB_DEMO.apiPort).catch((error) => {
  console.error(`✗ ${error.message}`);
  shutdown(1);
});

console.log("→ تشغيل واجهة Vite في وضع web-demo…");
run(
  "web",
  "pnpm",
  [
    "exec",
    "vite",
    "--mode",
    "web-demo",
    "--host",
    WEB_DEMO.webHost,
    "--port",
    String(WEB_DEMO.webPort),
    "--strictPort",
  ],
  RENDERER_DIR,
  process.env,
);

await waitForPort(WEB_DEMO.webHost, WEB_DEMO.webPort).catch((error) => {
  console.error(`✗ ${error.message}`);
  shutdown(1);
});

console.log("");
console.log(`✓ نسخة الويب جاهزة: ${WEB_DEMO_BASE_URL}`);
console.log(`  الحساب: ${WEB_DEMO.adminUsername} / ${WEB_DEMO.adminPin}`);
console.log("");
