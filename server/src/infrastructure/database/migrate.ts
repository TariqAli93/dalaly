import { pool } from "./pool.js";
import { runDatabaseMigrations } from "./run-migrations.js";

async function main() {
  await runDatabaseMigrations();
  console.log("Database migration complete.");
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
