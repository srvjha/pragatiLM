import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { connection, QUEUE_NAMES } from "@/queues";
import { db } from "@/db/client";
import { podcasts } from "@/db/schema";
import { buildScript, saveEpisode, synthesiseEpisode } from "@/services/podcast/podcast.service";
import { podcastRun } from "@/services/artifact-run.service";
import { channels, publish } from "@/lib/events";
import { childLogger } from "@/lib/logger";
import type { VoicePair } from "@/providers/tts";
import type { PodcastLanguage } from "@/types/domain";

const log = childLogger("worker:podcast");

export type PodcastJob = {
  podcastId: string;
  notebookId: string;
  sourceIds: string[];
  lengthMinutes: number;
  voicePair?: VoicePair;
  language?: PodcastLanguage;
};

async function run(job: Job<PodcastJob>): Promise<void> {
  const { podcastId, notebookId, sourceIds, lengthMinutes, voicePair, language } = job.data;

  // FR-7.3: the stage the user sees is the stage the job is actually in, not a
  // timed animation.
  const run = podcastRun(podcastId);

  await run.report("SCRIPTING", 5);
  const script = await buildScript(notebookId, sourceIds, lengthMinutes, language);

  await db
    .update(podcasts)
    .set({ title: script.title, script: script.turns, status: "RUNNING" })
    .where(eq(podcasts.id, podcastId));

  const episode = await synthesiseEpisode(script.turns, run.report, voicePair, language);
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

    void podcastRun(job.data.podcastId).fail(error.message);
  });

  return worker;
}
