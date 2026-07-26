import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

/**
 * Applies the committed migrations in drizzle/. Deliberately not a schema push:
 * what runs here is the same SQL that is in version control and the same SQL
 * that will run in deploy.
 */
async function main(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const db = drizzle(pool);

  logger.info("applying migrations");
  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("migrations applied");

  await pool.end();
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "migration failed");
  process.exit(1);
});
