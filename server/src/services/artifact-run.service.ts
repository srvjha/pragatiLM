import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { podcasts, roadmaps } from "@/db/schema";
import type { PodcastStage } from "@/db/schema";

/**
 * How a long running artifact job records where it has got to.
 *
 * Podcasts and roadmaps are generated the same way — enqueue, work for minutes,
 * write the result — and both had grown their own copy of the same two moments:
 * "I have reached this stage" and "I failed". Two copies of a failure path is
 * one copy that can be fixed while the other is forgotten, and the symptom is a
 * row that says RUNNING forever.
 *
 * Sources already have this and keep it: `setSourceStatus` also publishes to
 * Redis, because the source list consumes those frames over SSE. Nothing
 * consumes the artifact frames — `use-source-events.ts` drops every event that
 * is not `source.status`, and both artifact panels poll instead — so the ones
 * these workers were publishing went nowhere and are not reproduced here. A
 * job measured in minutes is served perfectly well by a three second poll. If
 * live artifact progress is ever wanted, this is the one place to add it.
 */
export interface RunRecorder {
  /**
   * Progress within the run. `stage` is free text because that is what the
   * workers naturally produce, including counters like "SYNTHESIZING 3 of 12";
   * each recorder maps it onto whatever its own row records.
   */
  report: (stage: string, progress: number) => Promise<void>;

  /** The run is over and produced nothing. Terminal. */
  fail: (message: string) => Promise<void>;
}

/**
 * The podcast's stage is a typed column rather than free text, so the counter
 * the worker reports has to be narrowed back to the enum. That mapping lived in
 * the worker, one `startsWith` away from the progress bar it feeds.
 */
function podcastStage(stage: string): PodcastStage {
  if (stage.startsWith("SYNTHESIZING")) return "SYNTHESIZING";
  if (stage === "MIXING") return "MIXING";
  return "SCRIPTING";
}

export function podcastRun(podcastId: string): RunRecorder {
  return {
    report: async (stage, progress) => {
      await db
        .update(podcasts)
        .set({ progress, stage: podcastStage(stage) })
        .where(eq(podcasts.id, podcastId));
    },

    fail: async (message) => {
      await db
        .update(podcasts)
        .set({ status: "FAILED", errorMessage: message })
        .where(eq(podcasts.id, podcastId));
    },
  };
}

/**
 * Keyed by notebook rather than by its own id, because a notebook has one
 * roadmap: generating again replaces it rather than adding to a list.
 */
export function roadmapRun(notebookId: string): RunRecorder {
  return {
    report: async (stage, progress) => {
      await db
        .update(roadmaps)
        .set({ status: "RUNNING", statusStage: stage, progress })
        .where(eq(roadmaps.notebookId, notebookId));
    },

    fail: async (message) => {
      await db
        .update(roadmaps)
        .set({ status: "FAILED", errorMessage: message })
        .where(eq(roadmaps.notebookId, notebookId));
    },
  };
}
