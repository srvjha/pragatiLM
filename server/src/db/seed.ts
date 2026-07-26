import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, closeDb } from "@/db/client";
import { notebooks, sources, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { putFile } from "@/db/repositories/source-file.repository";
import { enqueueIngest, closeQueues } from "@/queues";
import { logger } from "@/lib/logger";

/**
 * Populates a demo notebook so the project is inspectable within a minute of
 * cloning. Sources are enqueued rather than indexed inline, which means the seed
 * also demonstrates the pipeline: run the worker and watch the dots move.
 */
const FIXTURES = join(import.meta.dirname, "..", "..", "tests", "fixtures");

const demoSources: { type: "PDF" | "TEXT" | "VTT"; file: string; title: string; mime: string }[] = [
  {
    type: "PDF",
    file: "distributed-systems.pdf",
    title: "Consensus in distributed systems",
    mime: "application/pdf",
  },
  { type: "VTT", file: "lecture.vtt", title: "Recorded lecture", mime: "text/vtt" },
  { type: "TEXT", file: "notes.md", title: "Research notes", mime: "text/plain" },
];

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password-1";

/** The demo account, created if it is not already there. */
async function demoUser(): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .limit(1);

  if (existing) return existing.id;

  const created = await auth.api.signUpEmail({
    body: { name: "Demo", email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });

  logger.info({ email: DEMO_EMAIL, password: DEMO_PASSWORD }, "demo account created, sign in with");
  return created.user.id;
}

async function main(): Promise<void> {
  const existing = await db.select({ id: notebooks.id }).from(notebooks).limit(1);

  if (existing.length > 0) {
    logger.info("database already has notebooks, seed skipped");
    await closeDb();
    await closeQueues();
    return;
  }

  // The notebook needs an owner, and an owner nobody can sign in as would make
  // the seeded data unreachable through the UI. Going through Better Auth
  // rather than inserting a row gives the demo account a real password hash.
  const userId = await demoUser();

  const [notebook] = await db
    .insert(notebooks)
    .values({ userId, name: "Demo notebook" })
    .returning();
  if (!notebook) throw new Error("Could not create the demo notebook");

  let queued = 0;

  for (const demo of demoSources) {
    const path = join(FIXTURES, demo.file);

    // The fixtures are test assets, so a checkout without them still seeds a
    // usable notebook rather than failing.
    if (!existsSync(path)) {
      logger.warn({ file: demo.file }, "fixture missing, skipping");
      continue;
    }

    const [source] = await db
      .insert(sources)
      .values({
        notebookId: notebook.id,
        type: demo.type,
        title: demo.title,
        contentHash: `seed-${demo.file}`,
        status: "QUEUED",
      })
      .returning();

    if (!source) continue;

    await putFile({
      sourceId: source.id,
      kind: "original",
      filename: demo.file,
      mimeType: demo.mime,
      bytes: readFileSync(path),
    });

    await enqueueIngest({ sourceId: source.id });
    queued += 1;
  }

  logger.info(
    { notebookId: notebook.id, queued },
    queued > 0
      ? "seeded the demo notebook, start the worker to index it"
      : "seeded an empty demo notebook",
  );

  await closeDb();
  await closeQueues();
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "seed failed");
  process.exit(1);
});
