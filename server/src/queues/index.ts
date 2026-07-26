import { Queue, type JobsOptions } from "bullmq";
import { env } from "@/config/env";

/**
 * Queue definitions and the enqueue helpers. Workers live in src/workers and are
 * registered by src/worker.ts according to WORKER_QUEUES, so which process
 * consumes what is a deployment decision rather than a code change.
 */
export const connection = {
  url: env.REDIS_URL,
  // Required by BullMQ on any connection it owns.
  maxRetriesPerRequest: null,
};

export const QUEUE_NAMES = {
  chat: "chat",
  ingest: "ingest",
  cleanup: "cleanup",
  roadmap: "roadmap",
  podcast: "podcast",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Ingestion is slow and retryable: a transient extractor or embedding failure deserves another go. */
const INGEST_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

/**
 * Answering is not retryable. A second attempt would replay tokens the browser
 * has already rendered, so a failure is surfaced and the user decides.
 */
const CHAT_OPTIONS: JobsOptions = {
  attempts: 1,
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
};

export const chatQueue = new Queue(QUEUE_NAMES.chat, { connection });
export const ingestQueue = new Queue(QUEUE_NAMES.ingest, { connection });
export const cleanupQueue = new Queue(QUEUE_NAMES.cleanup, { connection });
export const roadmapQueue = new Queue(QUEUE_NAMES.roadmap, { connection });
export const podcastQueue = new Queue(QUEUE_NAMES.podcast, { connection });

export const allQueues = {
  [QUEUE_NAMES.chat]: chatQueue,
  [QUEUE_NAMES.ingest]: ingestQueue,
  [QUEUE_NAMES.cleanup]: cleanupQueue,
  [QUEUE_NAMES.roadmap]: roadmapQueue,
  [QUEUE_NAMES.podcast]: podcastQueue,
} as const;

export type ChatJob = {
  messageId: string;
  chatId: string;
  notebookId: string;
  content: string;
  sourceIds?: string[];
};

export type IngestJob = { sourceId: string; requestId?: string };
export type PurgeJob = { sourceId: string; notebookId: string; vectorIds: string[] };

export function enqueueAnswer(data: ChatJob) {
  return chatQueue.add("answer-question", data, CHAT_OPTIONS);
}

export function enqueueIngest(data: IngestJob) {
  return ingestQueue.add("ingest-source", data, INGEST_OPTIONS);
}

export function enqueueReindex(data: IngestJob) {
  return ingestQueue.add("reindex-source", data, INGEST_OPTIONS);
}

export function enqueuePurge(data: PurgeJob) {
  return cleanupQueue.add("purge-source", data, {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 100 },
  });
}

export { CHAT_OPTIONS, INGEST_OPTIONS };

export async function closeQueues(): Promise<void> {
  await Promise.allSettled(Object.values(allQueues).map((queue) => queue.close()));
}
