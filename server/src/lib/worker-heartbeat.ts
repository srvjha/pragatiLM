import { redis } from "@/lib/clients/redis";
import { childLogger } from "@/lib/logger";

const log = childLogger("worker:heartbeat");

/**
 * Whether anything is consuming the queues.
 *
 * The API and the worker are two processes, and only the worker moves a source
 * past QUEUED. Forgetting to start it is therefore invisible: adding a source
 * succeeds, the row appears, the spinner turns, and it turns forever. There is
 * no error to report because nothing failed — the job is sitting in Redis and
 * no one has come for it. That is the single most confusing state this product
 * can be in, and it looked exactly like a broken extractor.
 *
 * A key with a short TTL answers it. If the worker is alive it keeps rewriting
 * the key; if it dies, crashes or was never started, the key expires and the
 * API can say so instead of leaving a row spinning.
 */
const KEY = "worker:alive";

/** Comfortably longer than the interval, so one slow tick is not a death. */
const TTL_SECONDS = 45;
const INTERVAL_MS = 15_000;

export type WorkerLiveness = { alive: boolean; queues: string[] };

/** Called by the worker process once its workers are registered. */
export function startHeartbeat(queues: string[]): () => void {
  async function beat(): Promise<void> {
    try {
      await redis.set(KEY, JSON.stringify(queues), "EX", TTL_SECONDS);
    } catch (error) {
      // Losing the heartbeat is not worth killing the worker over: it consumes
      // jobs through its own connection and will carry on doing so.
      log.warn({ err: error }, "could not write the worker heartbeat");
    }
  }

  void beat();
  const timer = setInterval(() => void beat(), INTERVAL_MS);

  // Node would otherwise hold the process open on this alone during shutdown.
  timer.unref();

  return () => clearInterval(timer);
}

/** Called by the API. A read failure reports "alive", never a false alarm. */
export async function workerLiveness(): Promise<WorkerLiveness> {
  try {
    const raw = await redis.get(KEY);
    if (!raw) return { alive: false, queues: [] };

    return { alive: true, queues: JSON.parse(raw) as string[] };
  } catch (error) {
    log.warn({ err: error }, "could not read the worker heartbeat");
    // Redis being unreachable is already reported as its own failed probe.
    // Claiming the worker is down as well would be one fault reported twice.
    return { alive: true, queues: [] };
  }
}
