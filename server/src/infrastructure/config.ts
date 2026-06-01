import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

export const config = {
  appVersion: process.env.APP_VERSION ?? "0.1.0",
  apiHost: process.env.API_HOST ?? "127.0.0.1",
  apiPort: Number(process.env.API_PORT ?? 45678),
  db: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? "codel_dalaly",
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "root",
    connectionTimeoutMillis: Number(
      process.env.DB_CONNECTION_TIMEOUT_MS ?? 1500,
    ),
  },
  admin: {
    username: process.env.ADMIN_USERNAME ?? "admin",
    pin: process.env.ADMIN_PIN ?? "1234",
  },
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  remoteAccessEnabled: process.env.REMOTE_ACCESS_ENABLED === "true",
  cloudflaredPath:
    process.env.CLOUDFLARED_PATH ?? "tools/cloudflared/cloudflared.exe",
};
