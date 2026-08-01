import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { connection, QUEUE_NAMES } from "@/queues";
import { db } from "@/db/client";
import { podcasts } from "@/db/schema";
import { buildScript, saveEpisode, synthesiseEpisode } from "@/services/podcast/podcast.service";
import { channels, publish } from "@/lib/events";
import { childLogger } from "@/lib/logger";
import type { PodcastStage } from "@/db/schema";
import type { VoicePair } from "@/providers/tts";

const log = childLogger("worker:podcast");

export type PodcastJob = {
  podcastId: string;
  notebookId: string;
  sourceIds: string[];
  lengthMinutes: number;
  voicePair?: VoicePair;
};

async function run(job: Job<PodcastJob>): Promise<void> {
  const { podcastId, notebookId, sourceIds, lengthMinutes, voicePair } = job.data;

  // FR-7.3: the stage the user sees is the stage the job is actually in, not a
  // timed animation.
  const report = async (stage: string, progress: number) => {
    const column: PodcastStage = stage.startsWith("SYNTHESIZING")
      ? "SYNTHESIZING"
      : stage === "MIXING"
        ? "MIXING"
        : "SCRIPTING";

    await db.update(podcasts).set({ progress, stage: column }).where(eq(podcasts.id, podcastId));

    await publish(channels.source(notebookId), {
      type: "podcast.status",
      podcastId,
      stage,
      progress,
    });
  };

  await report("SCRIPTING", 5);
  const script = await buildScript(notebookId, sourceIds, lengthMinutes);

  await db
    .update(podcasts)
    .set({ title: script.title, script: script.turns, status: "RUNNING" })
    .where(eq(podcasts.id, podcastId));

  const episode = await synthesiseEpisode(script.turns, report, voicePair);
  await saveEpisode(podcastId, episode.bytes, episode.durationSec, episode.turns);

  await publish(channels.source(notebookId), {
    type: "podcast.status",
    podcastId,
    stage: "READY",
    progress: 100,
  });

  log.info(
    { podcastId, turns: script.turns.length, durationSec: episode.durationSec },
    "episode ready",
  );
}

export function createPodcastWorker(): Worker<PodcastJob> {
  const worker = new Worker<PodcastJob>(QUEUE_NAMES.podcast, run, {
    connection,
    concurrency: 1,
    // Synthesising dozens of turns is genuinely long, so the lock has to outlast
    // it or the job would be reclaimed as stalled mid episode.
    lockDuration: 15 * 60 * 1000,
  });

  worker.on("failed", (job, error) => {
    log.error({ err: error }, "podcast failed");
    if (!job?.data.podcastId) return;

    void db
      .update(podcasts)
      .set({ status: "FAILED", errorMessage: error.message })
      .where(eq(podcasts.id, job.data.podcastId))
      .then(() =>
        publish(channels.source(job.data.notebookId), {
          type: "podcast.status",
          podcastId: job.data.podcastId,
          stage: "FAILED",
          error: error.message,
        }),
      );
  });

  return worker;
}
