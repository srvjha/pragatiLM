import { Worker, type Job } from "bullmq";
import pTimeout from "p-timeout";
import { connection, QUEUE_NAMES, type IngestJob } from "@/queues";
import { findSourceById } from "@/db/repositories/source.repository";
import { findNotebookById } from "@/db/repositories/notebook.repository";
import { refundCharge } from "@/services/billing/entitlements.service";
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

    void findSourceById(job.data.sourceId).then(async (source) => {
      if (!source) return;

      // Refunded against the source id rather than the request that created it.
      // One PDF upload can carry ten files and is charged ten credits under a
      // single reference, so refunding by that reference could only ever return
      // one of them — the ledger's unique index would swallow the rest. Keyed on
      // the source, each failure returns its own credit, and the three ingest
      // attempts still refund only once.
      //
      // A reindex is never charged, so there is nothing to give back.
      if (job.name !== "reindex-source") {
        const notebook = await findNotebookById(source.notebookId);
        if (notebook) {
          await refundCharge({ userId: notebook.userId, ref: source.id }, "source");
        }
      }

      await setSourceStatus({
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
