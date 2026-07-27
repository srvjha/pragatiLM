import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { roadmaps, sources, chunks } from "@/db/schema";
import { chatModel, hasLlmCredentials } from "@/providers/llm";
import { childLogger } from "@/lib/logger";
import type { RoadmapModule, RoadmapPin, Locator } from "@/types/domain";
import type { RoadmapLevel } from "@/db/schema";

const log = childLogger("roadmap");

/**
 * FR-6. An ordered set of concepts drawn from timed sources, where every module
 * carries at least one pin: a source and a timestamp range where the concept is
 * actually taught.
 *
 * The grounding rule is the point of the feature. A module without a pin is
 * dropped rather than shown, so the roadmap can never list a topic the sources
 * do not cover, which is exactly what a model asked for a curriculum will
 * otherwise produce.
 */
const moduleSchema = z.object({
  concept: z.string().describe("The concept taught, in a few words."),
  rationale: z.string().describe("One short paragraph on why it comes at this point."),
  prerequisites: z.array(z.string()).describe("Concepts from earlier modules this depends on."),
  estimatedMinutes: z.number().int().min(1).max(600),
  skippable: z.boolean().describe("True when a learner at the stated level can skip it."),
  pinChunkIds: z
    .array(z.string())
    .describe("Ids of the supplied passages where this concept is taught. Never invent an id."),
});

const roadmapSchema = z.object({
  modules: z.array(moduleSchema).describe("Modules in the order they should be studied."),
});

const LEVEL_GUIDANCE: Record<RoadmapLevel, string> = {
  new: "The learner is new to this topic. Prefer smaller steps and mark nothing as skippable unless it is genuinely optional.",
  some: "The learner has some background. Group the basics and mark introductory material skippable.",
  experienced:
    "The learner is experienced. Keep the roadmap short, mark foundational material skippable and focus on what is specific to this material.",
};

/**
 * The timed passages a roadmap can be built from.
 *
 * `sourceIds` narrows it to what the person picked. Empty means every timed
 * source, which is what the roadmap always did implicitly: a notebook holding
 * six lectures and one unrelated talk produced a roadmap that tried to order
 * all seven into a single path, and there was no way to say otherwise.
 */
async function timedChunks(notebookId: string, sourceIds: string[] = []) {
  const rows = await db
    .select({
      id: chunks.id,
      sourceId: chunks.sourceId,
      text: chunks.text,
      locator: chunks.locator,
      sourceTitle: sources.title,
    })
    .from(chunks)
    .innerJoin(sources, eq(sources.id, chunks.sourceId))
    .where(
      and(
        eq(chunks.notebookId, notebookId),
        inArray(sources.type, ["YOUTUBE", "VTT"]),
        eq(sources.status, "READY"),
        ...(sourceIds.length > 0 ? [inArray(sources.id, sourceIds)] : []),
      ),
    )
    .orderBy(chunks.chunkIndex);

  return rows.filter((row) => row.locator.kind === "timed");
}

/**
 * Progress is reported as stages rather than as a measured percentage.
 *
 * Generation is one long model call with a gather before it and a verify
 * after, so there is no fraction to measure honestly. Naming the stage at
 * least answers the question someone staring at a spinner actually has, which
 * is whether anything is happening and roughly how much is left.
 */
export type RoadmapProgress = (stage: string, progress: number) => Promise<void>;

export async function canGenerateRoadmap(notebookId: string): Promise<boolean> {
  return (await timedChunks(notebookId)).length > 0;
}

export async function generateRoadmap(
  notebookId: string,
  level: RoadmapLevel,
  goal: string | undefined,
  sourceIds: string[] = [],
  onProgress: RoadmapProgress = () => Promise.resolve(),
): Promise<RoadmapModule[]> {
  await onProgress("Gathering the passages", 10);
  const rows = await timedChunks(notebookId, sourceIds);

  if (rows.length === 0) {
    throw new Error("Add a video or transcript source before generating a roadmap.");
  }

  if (!hasLlmCredentials()) {
    throw new Error("OPENAI_API_KEY is not set, so a roadmap cannot be generated.");
  }

  // Passages are labelled with their own chunk id, which is how a pin becomes
  // verifiable: the model can only cite an id it was shown.
  const passages = rows
    .map((row) => `id=${row.id} source="${row.sourceTitle}" ${describe(row.locator)}\n${row.text}`)
    .join("\n\n");

  const model = chatModel("chat", 0.2).withStructuredOutput(roadmapSchema, { name: "roadmap" });

  // The long one. Everything either side of it is quick, so the bar sits here
  // for most of the wait and the stage says why.
  await onProgress(`Ordering the concepts in ${rows.length} passages`, 35);

  const result = await model.invoke([
    {
      role: "system",
      content: [
        "You build a study roadmap from passages of recorded material.",
        "Order concepts so each one builds on the ones before it.",
        "Every module must cite the ids of the passages where that concept is actually taught.",
        "Only use ids that appear in the passages. A concept with no supporting passage must be left out entirely.",
        LEVEL_GUIDANCE[level],
      ].join(" "),
    },
    {
      role: "user",
      content: goal ? `Goal: ${goal}\n\nPassages:\n${passages}` : `Passages:\n${passages}`,
    },
  ]);

  await onProgress("Checking every step is pinned to a timestamp", 85);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const modules: RoadmapModule[] = [];

  for (const module of result.modules) {
    const pins: RoadmapPin[] = [];

    for (const chunkId of module.pinChunkIds) {
      const row = byId.get(chunkId);
      const locator = row?.locator;
      if (!row || locator?.kind !== "timed") continue;

      pins.push({ sourceId: row.sourceId, startSec: locator.startSec, endSec: locator.endSec });
    }

    // FR-6.4. A module with no verifiable pin is dropped, which is what stops
    // the roadmap describing material the notebook does not contain.
    if (pins.length === 0) {
      log.info({ concept: module.concept }, "module dropped, no supporting pin");
      continue;
    }

    modules.push({
      concept: module.concept,
      rationale: module.rationale,
      prerequisites: module.prerequisites,
      estimatedMinutes: module.estimatedMinutes,
      skippable: module.skippable,
      pins,
    });
  }

  if (modules.length === 0) {
    throw new Error("No concept in these sources could be pinned to a timestamp.");
  }

  return modules;
}

/**
 * Records that a roadmap is being built, before the job is queued.
 *
 * Nothing wrote a row until generation had finished, so for the entire minute
 * it takes there was no roadmap to find: the panel asked, got nothing back and
 * showed its "no roadmap yet" empty state, which is indistinguishable from
 * never having pressed the button. The progress the worker reports had nowhere
 * to go either, since an update matches no rows when there is no row.
 *
 * The old one goes here rather than at the end. Replacing it only on success
 * would leave the previous roadmap on screen while a new one is being built,
 * which reads as the button having done nothing at all.
 */
export async function startRoadmap(
  notebookId: string,
  level: RoadmapLevel,
  goal: string | undefined,
  sourceIds: string[] = [],
): Promise<void> {
  await db.delete(roadmaps).where(eq(roadmaps.notebookId, notebookId));
  await db.insert(roadmaps).values({
    notebookId,
    level,
    ...(goal ? { goal } : {}),
    sourceIds,
    modules: [],
    status: "QUEUED",
    statusStage: "Queued",
    progress: 0,
  });
}

export async function saveRoadmap(
  notebookId: string,
  level: RoadmapLevel,
  goal: string | undefined,
  modules: RoadmapModule[],
  sourceIds: string[] = [],
): Promise<void> {
  // The row already exists, written by startRoadmap so the panel had something
  // to show while this ran. Replacing it keeps one roadmap per notebook.
  await db.delete(roadmaps).where(eq(roadmaps.notebookId, notebookId));
  await db.insert(roadmaps).values({
    notebookId,
    level,
    ...(goal ? { goal } : {}),
    modules,
    sourceIds,
    status: "READY",
    statusStage: null,
    progress: 100,
  });
}

export async function findRoadmap(notebookId: string) {
  const [row] = await db
    .select()
    .from(roadmaps)
    .where(eq(roadmaps.notebookId, notebookId))
    .limit(1);
  return row;
}

function describe(locator: Locator): string {
  if (locator.kind !== "timed") return "";
  return `${format(locator.startSec)}-${format(locator.endSec)}`;
}

function format(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
