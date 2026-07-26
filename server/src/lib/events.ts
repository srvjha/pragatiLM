import { Redis } from "ioredis";
import { env } from "@/config/env";
import { childLogger } from "@/lib/logger";
import type { SourceStatus } from "@/db/schema";

const log = childLogger("events");

/**
 * Redis pub/sub carries progress from the worker process to whichever API
 * process is holding an SSE connection. The worker never knows whether anyone is
 * listening, and a browser can attach or drop at any point.
 */
export const channels = {
  source: (notebookId: string) => `source:${notebookId}`,
  chat: (messageId: string) => `chat:${messageId}`,
};

export type SourceEvent = {
  type: "source.status";
  sourceId: string;
  notebookId: string;
  status: SourceStatus;
  statusStage: string | null;
  progress: number;
  errorMessage: string | null;
};

// A publishing connection can also issue normal commands; a subscribing one
// cannot, so subscribers get their own.
let publisher: Redis | null = null;

function getPublisher(): Redis {
  publisher ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return publisher;
}

export async function publish(channel: string, payload: unknown): Promise<void> {
  try {
    await getPublisher().publish(channel, JSON.stringify(payload));
  } catch (error) {
    // Progress is a nicety. Losing a frame must never fail the job that was
    // reporting it, and the database row remains the source of truth.
    log.warn({ err: error, channel }, "could not publish event");
  }
}

export function createSubscriber(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export async function closeEvents(): Promise<void> {
  await publisher?.quit();
  publisher = null;
}
