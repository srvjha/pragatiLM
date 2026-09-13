import { Worker, type Job } from "bullmq";
import { connection, QUEUE_NAMES, type PurgeJob } from "@/queues";
import {
  deleteByNotebook,
  deleteBySource,
  listIndexedSourceIds,
} from "@/vector/chunk.vector-repository";
import { listAllSourceIds } from "@/db/repositories/source.repository";
import { childLogger } from "@/lib/logger";
import { db } from "@/db/client";
import { requestMetrics } from "@/db/schema";
import { env } from "@/config/env";
import { lt, sql } from "drizzle-orm";

const log = childLogger("worker:cleanup");

/**
 * The row and its bytes cascade inside the delete request. Qdrant sits outside
 * that transaction, which is exactly why removing its points is a retried job:
 * an orphaned vector is invisible to the user but would still surface in an
 * answer, so it must eventually go.
 */
async function runPurge(job: Job<PurgeJob>): Promise<void> {
  const { sourceId, notebookId } = job.data;

  if (sourceId) {
    await deleteBySource(sourceId);
    log.info({ sourceId }, "vectors deleted");
    return;
  }

  if (notebookId) {
    await deleteByNotebook(notebookId);
    log.info({ notebookId }, "notebook vectors deleted");
  }
}

/**
 * The safety net for a purge that never ran: a worker that was down when the
 * delete happened, or a job that exhausted its retries. Any source id holding
 * points that no longer exists in Postgres is removed.
 */
export async function reconcileOrphans(): Promise<number> {
  const [indexed, known] = await Promise.all([listIndexedSourceIds(), listAllSourceIds()]);

  let removed = 0;
  for (const sourceId of indexed) {
    if (known.has(sourceId)) continue;
    await deleteBySource(sourceId);
    removed += 1;
  }

  if (removed > 0) log.warn({ removed }, "removed orphaned vectors");
  return removed;
}

/**
 * Trims raw request metrics past their retention window.
 *
 * One row per request is cheap at this traffic and expensive forever. Kept as
 * raw rows rather than pre-aggregated buckets because percentiles over raw data
 * are honest and aggregation throws away exactly the outliers worth looking at,
 * so the cost of that choice is paid here instead.
 *
 * Only request_metrics is trimmed. llm_usage is cost history and admin_audit is
 * a record of who did what: both are small, both get more valuable with age,
 * and deleting either to save a few megabytes would be a bad trade.
 */
export async function trimRequestMetrics(): Promise<number> {
  const cutoff = sql`now() - ${`${env.ADMIN_METRICS_RETENTION_DAYS} days`}::interval`;
  const deleted = await db
    .delete(requestMetrics)
    .where(lt(requestMetrics.createdAt, cutoff))
    .returning({ id: requestMetrics.id });

  if (deleted.length > 0) {
    log.info(
      { removed: deleted.length, days: env.ADMIN_METRICS_RETENTION_DAYS },
      "trimmed request metrics",
    );
  }
  return deleted.length;
}

export function createCleanupWorker(): Worker<PurgeJob> {
  const worker = new Worker<PurgeJob>(QUEUE_NAMES.cleanup, runPurge, {
    connection,
    concurrency: 2,
    lockDuration: 15_000,
    stalledInterval: 5_000,
  });

  worker.on("failed", (job, error) =>
    log.error({ jobId: job?.id, err: error }, "purge failed, will retry"),
  );

  return worker;
}
