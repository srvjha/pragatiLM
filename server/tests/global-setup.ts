import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const TEST_DB = "notebook_rag_test";

/**
 * Tests run against a real database rather than a mocked one, because the things
 * most worth testing here are the generated column, the cascade behaviour and
 * the ownership boundary, none of which a mock would exercise. The test database
 * is created and migrated once per run, and never touches the development one.
 */
export default async function setup(): Promise<void> {
  process.env.NODE_ENV = "test";

  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error("DATABASE_URL is not set");

  const testUrl = adminUrl.replace(/\/[^/?]+(\?|$)/, `/${TEST_DB}$1`);
  process.env.DATABASE_URL = testUrl;
  // The SQL route is not exercised by these tests and the role is not
  // provisioned in the test database, so the connection is left unset.
  delete process.env.DATABASE_URL_READONLY;

  // Dropped and recreated rather than reused, so every run also proves the
  // migrations apply from empty. A stale test database would otherwise mask a
  // migration that only works against the schema it already has.
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const pool = new Pool({ connectionString: testUrl, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
