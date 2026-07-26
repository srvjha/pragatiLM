import { afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db, closeDb } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Every notebook needs an owner, so the reset recreates one rather than only
 * clearing. The id is fixed so tests can reference it without threading a
 * return value through their own setup.
 */
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(async () => {
  // Notebooks cascade from users and everything else cascades from notebooks,
  // so these two are the whole reset.
  await db.execute(sql`TRUNCATE TABLE users, notebooks RESTART IDENTITY CASCADE`);

  await db.insert(users).values({
    id: TEST_USER_ID,
    name: "Test user",
    email: "test@example.com",
    emailVerified: true,
  });
});

afterAll(async () => {
  await closeDb();
});
