import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { connection, QUEUE_NAMES } from "@/queues";
import { db } from "@/db/client";
import { roadmaps } from "@/db/schema";
import { generateRoadmap, saveRoadmap } from "@/services/roadmap/roadmap.service";
import { channels, publish } from "@/lib/events";
import { childLogger } from "@/lib/logger";
import type { RoadmapLevel } from "@/db/schema";

const log = childLogger("worker:roadmap");

export type RoadmapJob = { notebookId: string; level: RoadmapLevel; goal?: string };

async function run(job: Job<RoadmapJob>): Promise<void> {
  const { notebookId, level, goal } = job.data;

  await publish(channels.source(notebookId), { type: "roadmap.status", status: "RUNNING" });

  const modules = await generateRoadmap(notebookId, level, goal);
  await saveRoadmap(notebookId, level, goal, modules);

  await publish(channels.source(notebookId), {
    type: "roadmap.status",
    status: "READY",
    moduleCount: modules.length,
  });

  log.info({ notebookId, modules: modules.length }, "roadmap generated");
}

export function createRoadmapWorker(): Worker<RoadmapJob> {
  // Concurrency 1: this reads every timed chunk in a notebook, so running two
  // at once would double the peak memory for no gain.
  const worker = new Worker<RoadmapJob>(QUEUE_NAMES.roadmap, run, { connection, concurrency: 1 });

  worker.on("failed", (job, error) => {
    log.error({ err: error }, "roadmap failed");
    if (!job?.data.notebookId) return;

    void db
      .update(roadmaps)
      .set({ status: "FAILED", errorMessage: error.message })
      .where(eq(roadmaps.notebookId, job.data.notebookId))
      .then(() =>
        publish(channels.source(job.data.notebookId), {
          type: "roadmap.status",
          status: "FAILED",
          error: error.message,
        }),
      );
  });

  return worker;
}
