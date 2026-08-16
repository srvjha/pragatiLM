import { env } from "@/config/env";
import { chatModel, hasLlmCredentials } from "@/providers/llm";
import {
  retrieveWithCorrection,
  persistRun,
  recordAnswerGrade,
  gradeAnswer,
} from "@/services/rag/retrieval";
import {
  buildContextBlocks,
  buildUserPrompt,
  NO_GROUNDED_ANSWER,
  SYSTEM_PROMPT,
} from "@/services/rag/prompts/answer";
import { looksUngrounded, resolveMarkers, type ResolvedCitation } from "@/services/rag/citations";
import { completeMessage, recentTurns } from "@/db/repositories/chat.repository";
import { listSources } from "@/db/repositories/source.repository";
import { refundCharge } from "@/services/billing/entitlements.service";
import { emit, isStopRequested, clearStop } from "@/lib/chat-stream";
import { childLogger } from "@/lib/logger";
import type { CreditCharge } from "@/billing/costs";

const log = childLogger("chat:answer");

export type AnswerJob = {
  messageId: string;
  chatId: string;
  notebookId: string;
  content: string;
  sourceIds?: string[];
  credit?: CreditCharge;
};

/**
 * The whole query path, running in a worker. Every phase publishes a frame, so
 * the browser sees translation, routing, grading and any correction round as it
 * happens rather than watching one long spinner.
 */
export async function answerQuestion(job: AnswerJob): Promise<void> {
  const { messageId, chatId, notebookId, content } = job;

  await clearStop(messageId);

  const sources = await listSources(notebookId);
  const ready = sources.filter((source) => source.status === "READY");
  const selected = job.sourceIds ?? ready.filter((source) => source.selected).map((s) => s.id);

  await emit(messageId, { event: "retrieval_start", data: { sourceCount: selected.length } });

  if (ready.length === 0) {
    // Nothing was searched and no model was called, so there is nothing to have
    // paid for. Distinct from the refusal further down, which happens *after* a
    // real search and is a legitimate answer worth its credit.
    await refundCharge(job.credit, "chat");
    await finish(job, NO_GROUNDED_ANSWER, "complete", [], null);
    return;
  }

  const history = await recentTurns(chatId);

  const selectedSet = new Set(selected);

  const retrieval = await retrieveWithCorrection(
    {
      notebookId,
      question: content,
      history,
      sourceIds: selected,
      catalogue: ready
        .filter((source) => selectedSet.has(source.id))
        .map((source) => ({ title: source.title, type: source.type })),
    },
    {
      onGraded: (round, grade) =>
        emit(messageId, { event: "grading", data: { round, score: grade.score } }),
      // FR-3.33: a correction round reads as progress, not as a stall.
      onCorrecting: (round, grade) =>
        emit(messageId, {
          event: "correction",
          data: {
            round,
            score: grade.score,
            keywords: grade.keywords,
            missingAspects: grade.missingAspects,
          },
        }),
    },
  );

  const variants: Record<string, string> = {};
  for (const variant of retrieval.best.variants) {
    if (variant.label === "original") continue;
    variants[variant.label] = variant.text;
  }

  if (Object.keys(variants).length > 0) {
    await emit(messageId, { event: "query_translated", data: variants });
  }

  await emit(messageId, {
    event: "routing",
    data: { channels: retrieval.best.routing.channels, reason: retrieval.best.routing.reason },
  });

  const runId = await persistRun(notebookId, content, retrieval);

  // FR-4.8 and FR-3.31: nothing is generated from a set already judged
  // insufficient, and an empty retrieval never reaches the model at all.
  if (retrieval.best.empty || retrieval.belowFloor) {
    await finish(job, NO_GROUNDED_ANSWER, "complete", [], runId);
    return;
  }

  const candidates = retrieval.best.reranked;
  const facts = retrieval.best.facts;
  const { text: context, blockCount } = buildContextBlocks(candidates, facts);

  await emit(messageId, {
    event: "retrieval_done",
    data: {
      messageId,
      blocks: candidates.map((candidate, index) => ({
        index: index + 1,
        sourceTitle: candidate.sourceTitle,
      })),
    },
  });

  if (!hasLlmCredentials()) {
    // Our misconfiguration, not their usage.
    await refundCharge(job.credit, "chat");
    await finish(
      job,
      "No chat model is configured, so I cannot answer. Add OPENAI_API_KEY to server/.env.",
      "error",
      [],
      runId,
    );
    return;
  }

  let answer = "";
  let stopped = false;

  try {
    // Low temperature: the task is to report what the blocks say, not to write
    // interestingly.
    const model = chatModel("chat", 0.1);
    const stream = await model.stream([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(content, context) },
    ]);

    for await (const chunk of stream) {
      const text = typeof chunk.content === "string" ? chunk.content : "";
      if (text.length === 0) continue;

      answer += text;
      await emit(messageId, { event: "token", data: { text } });

      if (await isStopRequested(messageId)) {
        stopped = true;
        break;
      }
    }
  } catch (error) {
    log.error({ err: error, messageId }, "generation failed");
    await emit(messageId, {
      event: "error",
      data: { code: "GENERATION_FAILED", message: "The answer could not be generated." },
    });

    // Refunded here rather than only in the worker's `failed` handler, because
    // this path does not throw: it reports the error to the browser and returns
    // normally, so BullMQ considers the job a success and never fires that
    // handler. This is the most common way an answer fails, so refunding only
    // there would have refunded almost nothing.
    await refundCharge(job.credit, "chat");
    await finish(job, answer, "error", [], runId);
    return;
  }

  const resolved = resolveMarkers(answer, candidates, facts);

  // A chunk carries its source's title from the moment it was indexed, so a
  // source renamed since — by its extractor or by the person — would be cited
  // under a name the rail no longer shows. The row is the authority on what a
  // source is called; the payload is only a cache of it.
  const names = new Map(sources.map((source) => [source.id, source.title]));
  const citations = resolved.citations.map((citation) => ({
    ...citation,
    sourceTitle: names.get(citation.sourceId) ?? citation.sourceTitle,
  }));

  if (resolved.strippedCount > 0) {
    log.info(
      { messageId, stripped: resolved.strippedCount, blockCount },
      "removed markers pointing at blocks that were not supplied",
    );
  }

  await emit(messageId, { event: "citations", data: citations });
  await finish(job, resolved.content, stopped ? "stopped" : "complete", citations, runId);

  // FR-3.32. After the stream, so it costs the reader nothing.
  if (runId && env.CRAG_ENABLED) {
    void gradeAnswer(content, resolved.content, candidates).then(async (grade) => {
      if (!grade) return;
      await recordAnswerGrade(runId, grade.score);
      await emit(messageId, {
        event: "answer_grade",
        data: {
          score: grade.score,
          grounded: grade.grounded && !looksUngrounded(resolved.citations, candidates.length),
        },
      });
    });
  }
}

async function finish(
  job: AnswerJob,
  content: string,
  status: "complete" | "stopped" | "error",
  citations: ResolvedCitation[],
  runId: string | null,
): Promise<void> {
  await completeMessage({
    messageId: job.messageId,
    content,
    status,
    retrievalRunId: runId,
    citations,
  });

  await emit(job.messageId, {
    event: "done",
    data: { messageId: job.messageId, retrievalRunId: runId },
  });

  await clearStop(job.messageId);
}
