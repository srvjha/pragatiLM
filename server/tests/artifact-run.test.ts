import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notebooks, podcasts, roadmaps } from "@/db/schema";
import { podcastRun, roadmapRun } from "@/services/artifact-run.service";
import { TEST_USER_ID } from "./setup";

/**
 * The half of a long running job that only happens when something goes wrong.
 *
 * Both artifact workers used to write their own failure path, and neither was
 * reachable from a test: producing one meant making a real job throw inside
 * BullMQ. Behind this seam it is an ordinary call, so the state a reader is
 * left looking at after a failure is finally something we assert rather than
 * something we hope for.
 */

let notebookId: string;

beforeEach(async () => {
  const [notebook] = await db
    .insert(notebooks)
    .values({ userId: TEST_USER_ID, name: "Runs" })
    .returning();

  notebookId = notebook!.id;
});

async function newPodcast(): Promise<string> {
  const [row] = await db
    .insert(podcasts)
    .values({ notebookId, title: "Generating...", status: "QUEUED", stage: "SCRIPTING" })
    .returning();

  return row!.id;
}

const readPodcast = (id: string) =>
  db
    .select()
    .from(podcasts)
    .where(eq(podcasts.id, id))
    .limit(1)
    .then(([row]) => row!);

const readRoadmap = () =>
  db
    .select()
    .from(roadmaps)
    .where(eq(roadmaps.notebookId, notebookId))
    .limit(1)
    .then(([row]) => row!);

describe("podcastRun", () => {
  it("narrows a counted stage back to the column's enum", async () => {
    const id = await newPodcast();

    // What the worker actually reports mid-synthesis, turn by turn.
    await podcastRun(id).report("SYNTHESIZING 3 of 12", 40);

    const row = await readPodcast(id);
    expect(row.stage).toBe("SYNTHESIZING");
    expect(row.progress).toBe(40);
  });

  it("maps the other stages a run passes through", async () => {
    const id = await newPodcast();
    const run = podcastRun(id);

    await run.report("MIXING", 85);
    expect((await readPodcast(id)).stage).toBe("MIXING");

    await run.report("SCRIPTING", 5);
    expect((await readPodcast(id)).stage).toBe("SCRIPTING");
  });

  it("records a failure as terminal, with the reason attached", async () => {
    const id = await newPodcast();

    await podcastRun(id).fail("That video could not be loaded.");

    const row = await readPodcast(id);
    expect(row.status).toBe("FAILED");
    expect(row.errorMessage).toBe("That video could not be loaded.");
  });

  it("leaves other episodes alone", async () => {
    const mine = await newPodcast();
    const theirs = await newPodcast();

    await podcastRun(mine).fail("boom");

    expect((await readPodcast(theirs)).status).toBe("QUEUED");
  });
});

describe("roadmapRun", () => {
  beforeEach(async () => {
    await db.insert(roadmaps).values({ notebookId, level: "new", status: "QUEUED" });
  });

  it("marks the run as running while it reports", async () => {
    await roadmapRun(notebookId).report("Reading the sources", 30);

    const row = await readRoadmap();
    expect(row.status).toBe("RUNNING");
    expect(row.statusStage).toBe("Reading the sources");
    expect(row.progress).toBe(30);
  });

  it("records a failure as terminal, with the reason attached", async () => {
    await roadmapRun(notebookId).fail("The model returned nothing.");

    const row = await readRoadmap();
    expect(row.status).toBe("FAILED");
    expect(row.errorMessage).toBe("The model returned nothing.");
  });
});
