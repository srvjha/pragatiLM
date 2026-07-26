import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const TEST_DB = "notebook_rag_test";
const TEST_COLLECTION = "chunks_test";

/**
 * Removed before every run, so a stale collection cannot carry vectors from a
 * previous suite into this one. A failure here is not fatal: Qdrant may not be
 * running, and the tests that need it will say so far more clearly than a
 * crash in setup would.
 */
async function dropTestCollection(): Promise<void> {
  const base = process.env.QDRANT_URL;
  if (!base) return;

  try {
    await fetch(`${base.replace(/\/$/, "")}/collections/${TEST_COLLECTION}`, {
      method: "DELETE",
      ...(process.env.QDRANT_API_KEY ? { headers: { "api-key": process.env.QDRANT_API_KEY } } : {}),
    });
  } catch {
    // Left to the tests that actually need a vector store.
  }
}

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

  // Qdrant needs isolating for exactly the same reason Postgres does, and did
  // not have it. The suite ran against a separate database and then wrote its
  // stand-in vectors straight into the development collection, deleting real
  // ones on the way through. A single `npm test` silently emptied the vector
  // store of whatever had just been indexed, and the only symptom was a
  // notebook that had every chunk in Postgres, no vectors, and refused every
  // question.
  process.env.QDRANT_COLLECTION = TEST_COLLECTION;
  await dropTestCollection();

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
