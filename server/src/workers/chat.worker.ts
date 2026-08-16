import { Worker, type Job } from "bullmq";
import pTimeout from "p-timeout";
import { connection, QUEUE_NAMES } from "@/queues";
import { env } from "@/config/env";
import { answerQuestion, type AnswerJob } from "@/services/chat/answer.service";
import { completeMessage } from "@/db/repositories/chat.repository";
import { refundCharge } from "@/services/billing/entitlements.service";
import { emit } from "@/lib/chat-stream";
import { childLogger } from "@/lib/logger";

const log = childLogger("worker:chat");

const JOB_TIMEOUT_MS = 60_000;

export function createChatWorker(): Worker<AnswerJob> {
  const worker = new Worker<AnswerJob>(
    QUEUE_NAMES.chat,
    (job: Job<AnswerJob>) =>
      pTimeout(answerQuestion(job.data), {
        milliseconds: JOB_TIMEOUT_MS,
        message: "The answer took too long and was stopped.",
      }),
    { connection, concurrency: env.CHAT_QUEUE_CONCURRENCY, lockDuration: 90_000 },
  );

  worker.on("failed", (job, error) => {
    log.error({ jobId: job?.id, err: error }, "answer failed");
    if (!job?.data.messageId) return;

    // Reached only when the job actually threw — a timeout, or a crash outside
    // the service's own error handling. The service refunds the failures it
    // catches itself; both call sites are idempotent on the same ref, so an
    // overlap costs nothing.
    void refundCharge(job.data.credit, "chat");

    // attempts is 1, so a failure is terminal. The browser has to be told, and
    // whatever was streamed has to be persisted rather than left half written.
    void emit(job.data.messageId, {
      event: "error",
      data: { code: "ANSWER_FAILED", message: error.message },
    }).then(() =>
      completeMessage({
        messageId: job.data.messageId,
        content: "",
        status: "error",
        citations: [],
      }),
    );
  });

  return worker;
}
