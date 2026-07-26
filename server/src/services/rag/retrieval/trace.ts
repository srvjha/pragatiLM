import * as repo from "@/db/repositories/retrieval-run.repository";
import { childLogger } from "@/lib/logger";
import type { CorrectiveResult } from "./corrective";
import type { QueryVariants } from "@/types/domain";

const log = childLogger("retrieval:trace");

/**
 * NFR-16. A trace is written for every run, and no user visible behaviour
 * depends on that write succeeding: a failure is logged and swallowed, because
 * losing a diagnostic must never cost an answer.
 */
export async function persistRun(
  notebookId: string,
  question: string,
  result: CorrectiveResult,
): Promise<string | null> {
  try {
    const variants: QueryVariants = {};
    const subQuestions: string[] = [];

    for (const variant of result.best.variants) {
      if (variant.label === "rewrite") variants.rewrite = variant.text;
      else if (variant.label === "stepBack") variants.stepBack = variant.text;
      else if (variant.label === "hyde") variants.hyde = variant.text;
      else if (variant.label.startsWith("subQuestion")) subQuestions.push(variant.text);
    }

    if (subQuestions.length > 0) variants.subQuestions = subQuestions;

    const row = await repo.insertRun({
      notebookId,
      originalQuery: question,
      variants,
      routing: result.best.routing,
      rounds: result.rounds,
      finalChunkIds: result.best.reranked.map((candidate) => candidate.chunkId),
      contextGrade: result.bestGrade.score,
      retryCount: result.retryCount,
      timings: result.best.timingsMs,
    });

    return row?.id ?? null;
  } catch (error) {
    log.warn({ err: error }, "could not persist the retrieval trace");
    return null;
  }
}

export async function recordAnswerGrade(runId: string, score: number): Promise<void> {
  try {
    await repo.setAnswerGrade(runId, score);
  } catch (error) {
    log.warn({ err: error, runId }, "could not record the answer grade");
  }
}
