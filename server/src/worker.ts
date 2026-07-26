import type { Worker } from "bullmq";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { closeDb } from "@/db/client";
import { closeRedis } from "@/lib/clients/redis";
import { closeEvents } from "@/lib/events";
import { closeChatStream } from "@/lib/chat-stream";
import { closeQueues, QUEUE_NAMES } from "@/queues";
import { ensureCollection } from "@/vector/qdrant.repository";
import { createIngestWorker } from "@/workers/ingest.worker";
import { createCleanupWorker } from "@/workers/cleanup.worker";
import { createChatWorker } from "@/workers/chat.worker";
import { createRoadmapWorker } from "@/workers/roadmap.worker";
import { createPodcastWorker } from "@/workers/podcast.worker";

const log = logger.child({ process: "worker" });

await ensureCollection().catch((error: unknown) => {
  log.error({ err: error }, "could not bootstrap the qdrant collection");
  process.exit(1);
});

/**
 * WORKER_QUEUES decides what this process consumes. Locally one process serves
 * everything; in deploy, chat runs on its own so an answer never waits behind a
 * ten minute PDF.
 */
const factories: Partial<Record<string, () => Worker>> = {
  [QUEUE_NAMES.chat]: createChatWorker,
  [QUEUE_NAMES.ingest]: createIngestWorker,
  [QUEUE_NAMES.cleanup]: createCleanupWorker,
  [QUEUE_NAMES.roadmap]: createRoadmapWorker,
  [QUEUE_NAMES.podcast]: createPodcastWorker,
};

const workers: Worker[] = [];

for (const name of env.WORKER_QUEUES) {
  const factory = factories[name];

  if (!factory) {
    log.debug({ queue: name }, "no worker registered for this queue yet");
    continue;
  }

  workers.push(factory());
  log.info({ queue: name }, "worker registered");
}

log.info({ queues: env.WORKER_QUEUES, active: workers.length }, "worker started");

let shuttingDown = false;

/**
 * NFR-12. worker.close() stops taking new jobs and waits for the ones in flight,
 * so a deploy does not strand a source mid indexing. Anything still running when
 * the grace period expires is left for the stalled check to requeue.
 */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  log.info({ signal }, "worker draining, waiting for in flight jobs");

  const forceExit = setTimeout(() => {
    log.error("forced exit, jobs still running will be requeued as stalled");
    process.exit(1);
  }, 30_000);
  forceExit.unref();

  await Promise.allSettled(workers.map((worker) => worker.close()));
  await Promise.allSettled([
    closeQueues(),
    closeEvents(),
    closeChatStream(),
    closeDb(),
    closeRedis(),
  ]);

  clearTimeout(forceExit);
  log.info("worker stopped cleanly");
  process.exit(0);
}

process.on("SIGTERM", (signal) => void shutdown(signal));
process.on("SIGINT", (signal) => void shutdown(signal));
