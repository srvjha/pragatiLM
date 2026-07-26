import { Worker, type Job } from "bullmq";
import pTimeout from "p-timeout";
import { connection, QUEUE_NAMES, type IngestJob } from "@/queues";
import { findSourceById } from "@/db/repositories/source.repository";
import { setSourceStatus } from "@/services/status.service";
import { runIngestion } from "@/ingestion/pipeline";
import { childLogger } from "@/lib/logger";

const log = childLogger("worker:ingest");

/**
 * BullMQ removed per job timeouts, so the ceiling is enforced around the
 * processor. FR-2.16: ten minutes, after which the source is marked FAILED with
 * a timeout reason rather than spinning forever.
 */
const JOB_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * The job body. Everything real lives in the pipeline; this only decides whether
 * the job is a first index or a re-index, which differ solely in whether the
 * previous chunks and vectors are torn down first.
 */
async function runIngest(job: Job<IngestJob>): Promise<{ sourceId: string; chunkCount: number }> {
  const reindex = job.name === "reindex-source";
  const result = await runIngestion(job.data.sourceId, reindex);
  return { sourceId: result.sourceId, chunkCount: result.chunkCount };
}

export function createIngestWorker(): Worker<IngestJob> {
  const worker = new Worker<IngestJob>(
    QUEUE_NAMES.ingest,
    (job) =>
      pTimeout(runIngest(job), {
        milliseconds: JOB_TIMEOUT_MS,
        message: `Indexing took longer than ${JOB_TIMEOUT_MS / 60000} minutes and was stopped.`,
      }),
    {
      connection,
      concurrency: 4,
      // Shorter than the default so a killed worker's job is reclaimed in
      // seconds rather than half a minute.
      lockDuration: 15_000,
      stalledInterval: 5_000,
    },
  );

  worker.on("completed", (job) => log.info({ jobId: job.id }, "ingest complete"));

  worker.on("failed", (job, error) => {
    log.error({ jobId: job?.id, err: error }, "ingest failed");

    // Only the final attempt is terminal; earlier failures are about to be
    // retried and must not show the user a red dot.
    const exhausted = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!exhausted || !job?.data.sourceId) return;

    void findSourceById(job.data.sourceId).then((source) => {
      if (!source) return;
      return setSourceStatus({
        sourceId: source.id,
        notebookId: source.notebookId,
        status: "FAILED",
        errorMessage: error.message,
        progress: 0,
      });
    });
  });

  return worker;
}
