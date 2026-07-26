import { afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db, closeDb } from "@/db/client";

beforeEach(async () => {
  // Everything else cascades from notebooks, so one truncate is the whole reset.
  await db.execute(sql`TRUNCATE TABLE notebooks RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await closeDb();
});
