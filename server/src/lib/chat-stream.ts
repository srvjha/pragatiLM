import { Redis } from "ioredis";
import { env } from "@/config/env";
import { channels, publish } from "@/lib/events";
import { childLogger } from "@/lib/logger";

const log = childLogger("chat-stream");

/**
 * Answering happens in a worker, so its frames reach the browser through Redis.
 * Every frame is also appended to a bounded list, which is what makes reconnect
 * possible: a client that drops mid answer replays what it missed and continues
 * live, rather than losing the answer to a flaky connection.
 */
export type ChatEvent =
  | { event: "retrieval_start"; data: { sourceCount: number } }
  | {
      event: "query_translated";
      data: { rewrite?: string; stepBack?: string; subQuestions?: string[]; hyde?: string };
    }
  | { event: "routing"; data: { channels: string[]; reason: string } }
  | { event: "grading"; data: { round: number; score: number } }
  | {
      event: "correction";
      data: { round: number; score: number; keywords: string[]; missingAspects: string[] };
    }
  | {
      event: "retrieval_done";
      data: { messageId: string; blocks: { index: number; sourceTitle: string }[] };
    }
  | { event: "token"; data: { text: string } }
  | { event: "citations"; data: unknown }
  | { event: "answer_grade"; data: { score: number; grounded: boolean } }
  | { event: "done"; data: { messageId: string; retrievalRunId: string | null } }
  | { event: "error"; data: { code: string; message: string } };

const BUFFER_LIMIT = 4000;
const BUFFER_TTL_SECONDS = 900;
const CANCEL_TTL_SECONDS = 300;

let redis: Redis | null = null;

function client(): Redis {
  redis ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return redis;
}

const bufferKey = (messageId: string) => `chat:buffer:${messageId}`;
const cancelKey = (messageId: string) => `chat:cancel:${messageId}`;

export async function emit(messageId: string, frame: ChatEvent): Promise<void> {
  const payload = JSON.stringify(frame);

  try {
    // Buffer first, then publish. A client that reconnects between the two sees
    // the frame in the replay rather than missing it entirely.
    await client()
      .multi()
      .rpush(bufferKey(messageId), payload)
      .ltrim(bufferKey(messageId), -BUFFER_LIMIT, -1)
      .expire(bufferKey(messageId), BUFFER_TTL_SECONDS)
      .exec();
  } catch (error) {
    log.warn({ err: error, messageId }, "could not buffer a frame");
  }

  await publish(channels.chat(messageId), frame);
}

export async function replay(messageId: string): Promise<ChatEvent[]> {
  try {
    const frames = await client().lrange(bufferKey(messageId), 0, -1);
    return frames.map((frame) => JSON.parse(frame) as ChatEvent);
  } catch (error) {
    log.warn({ err: error, messageId }, "could not replay the buffer");
    return [];
  }
}

/**
 * FR-4.6. Stopping is a published intent rather than a dropped connection: the
 * worker checks it between tokens, so the partial answer is persisted properly
 * instead of being abandoned mid write.
 */
export async function requestStop(messageId: string): Promise<void> {
  await client().set(cancelKey(messageId), "1", "EX", CANCEL_TTL_SECONDS);
}

export async function isStopRequested(messageId: string): Promise<boolean> {
  try {
    return (await client().exists(cancelKey(messageId))) === 1;
  } catch {
    return false;
  }
}

export async function clearStop(messageId: string): Promise<void> {
  try {
    await client().del(cancelKey(messageId));
  } catch {
    // A stale cancel key expires on its own.
  }
}

export async function closeChatStream(): Promise<void> {
  await redis?.quit();
  redis = null;
}
