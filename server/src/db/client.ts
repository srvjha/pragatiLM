import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/config/env";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });

/**
 * A second connection on the least privilege role, used only by the SQL
 * retrieval route. It is separate so that a generated statement cannot reach a
 * connection that is allowed to write, whatever the statement inspection layer
 * happens to miss.
 */
const readOnlyPool = env.DATABASE_URL_READONLY
  ? new Pool({
      connectionString: env.DATABASE_URL_READONLY,
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: env.SQL_TIMEOUT_MS,
    })
  : null;

export function getReadOnlyPool(): Pool {
  if (!readOnlyPool) {
    throw new Error(
      "DATABASE_URL_READONLY is not configured, the SQL retrieval route cannot run without it.",
    );
  }
  return readOnlyPool;
}

export async function closeDb(): Promise<void> {
  await Promise.allSettled([pool.end(), readOnlyPool?.end()]);
}

export { schema };
