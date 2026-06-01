import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db.js";
import { bootstrapDefaultAdmin } from "../../modules/auth/auth.service.js";
import { seedSystemRbac } from "../../modules/rbac/rbac.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runDatabaseMigrations() {
  const migrationsFolder = path.resolve(__dirname, "..", "..", "..", "drizzle");
  await migrate(db, { migrationsFolder });
  await seedSystemRbac();
  await bootstrapDefaultAdmin();
}
