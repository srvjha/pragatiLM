import { env } from "@/config/env";
import { retrieveOnce } from "./pipeline";
import { gradeContext, type ContextGrade } from "./grade";
import { childLogger } from "@/lib/logger";
import type { QueryVariant, RetrievalRequest, RetrievalResult } from "./types";

const log = childLogger("retrieval:corrective");

export type CorrectionRound = {
  round: number;
  queries: string[];
  perChannelIds: Record<string, string[]>;
  fusedIds: string[];
  rerankedIds: string[];
  grade: number;
  missingAspects: string[];
  keywords: string[];
  timingsMs: Record<string, number>;
};

export type CorrectiveResult = {
  /** The best scoring round, which is not necessarily the last one. */
  best: RetrievalResult;
  bestGrade: ContextGrade;
  rounds: CorrectionRound[];
  retryCount: number;
  /** True when no round cleared the floor, so nothing should be generated from. */
  belowFloor: boolean;
};

export type CorrectionEvents = {
  onGraded?: (round: number, grade: ContextGrade) => void | Promise<void>;
  onCorrecting?: (round: number, grade: ContextGrade) => void | Promise<void>;
};

function summarise(result: RetrievalResult, grade: ContextGrade, round: number): CorrectionRound {
  const perChannelIds: Record<string, string[]> = {};

  for (const list of result.lists) {
    perChannelIds[`${list.variant}:${list.channel}`] = list.candidates.map(
      (candidate) => candidate.chunkId,
    );
  }

  return {
    round,
    queries: result.variants.map((variant) => variant.text),
    perChannelIds,
    fusedIds: result.fused.slice(0, 30).map((candidate) => candidate.chunkId),
    rerankedIds: result.reranked.map((candidate) => candidate.chunkId),
    grade: grade.score,
    missingAspects: grade.missingAspects,
    keywords: grade.keywords,
    timingsMs: result.timingsMs,
  };
}

/**
 * The corrective loop, written as an explicit state machine rather than a
 * LangGraph StateGraph.
 *
 * The graph API is built for streaming multi actor agents and its value is the
 * scheduling it does between independent nodes. This loop has one node and one
 * conditional edge: retrieve, grade, then either generate or correct. Expressing
 * that as a graph would add a dependency and an indirection without making the
 * retry policy any easier to read, and the bound is the thing that has to be
 * obvious.
 *
 * FR-3.29 to FR-3.31.
 */
export async function retrieveWithCorrection(
  request: RetrievalRequest,
  events: CorrectionEvents = {},
): Promise<CorrectiveResult> {
  const startedAt = performance.now();
  const rounds: CorrectionRound[] = [];

  let extraVariants: QueryVariant[] = [];
  let best: RetrievalResult | null = null;
  let bestGrade: ContextGrade | null = null;

  const maxRounds = env.CRAG_ENABLED ? env.CRAG_MAX_RETRIES + 1 : 1;

  for (let round = 0; round < maxRounds; round += 1) {
    const result = await retrieveOnce(request, extraVariants);
    const grade = await gradeContext(
      request.question,
      result.reranked,
      result.facts,
      request.catalogue ?? [],
    );

    rounds.push(summarise(result, grade, round));
    await events.onGraded?.(round, grade);

    // FR-3.30: the best round wins, never simply the last. A correction can make
    // things worse, and keeping the worse set because it came second would be
    // absurd.
    if (!bestGrade || grade.score > bestGrade.score) {
      best = result;
      bestGrade = grade;
    }

    if (grade.score >= env.CRAG_MIN_SCORE) break;
    if (round === maxRounds - 1) break;

    const elapsed = performance.now() - startedAt;
    if (elapsed > env.CRAG_WALL_CLOCK_MS) {
      log.info({ elapsed: Math.round(elapsed) }, "correction stopped on the wall clock");
      break;
    }

    const nextVariants = correctionVariants(grade, round);
    if (nextVariants.length === 0) {
      // The grader scored low but suggested nothing to search for, so another
      // identical round would only cost time.
      log.debug({ round }, "no correction terms offered, stopping");
      break;
    }

    await events.onCorrecting?.(round, grade);
    extraVariants = nextVariants;

    log.info(
      { round, score: grade.score, keywords: grade.keywords },
      "context insufficient, widening the search",
    );
  }

  if (!best || !bestGrade) {
    throw new Error("The correction loop produced no result");
  }

  return {
    best,
    bestGrade,
    rounds,
    retryCount: Math.max(0, rounds.length - 1),
    // FR-3.31: nothing is generated from a set already judged insufficient.
    //
    // "Insufficient" is not the same as "could be better". This used to reuse
    // CRAG_MIN_SCORE, the threshold that decides whether to search again, so
    // any question the grader scored 5 was refused outright even when the
    // retrieved passages plainly contained the answer. Refusing is the
    // strongest thing this system does and it now takes a much lower score, or
    // an empty set, to trigger it.
    belowFloor: best.reranked.length === 0 || bestGrade.score < env.CRAG_REFUSE_BELOW,
  };
}

/** The grader's own words become the next round's queries. */
function correctionVariants(grade: ContextGrade, round: number): QueryVariant[] {
  const variants: QueryVariant[] = [];

  if (grade.keywords.length > 0) {
    variants.push({ label: `correction${round + 1}:keywords`, text: grade.keywords.join(" ") });
  }

  for (const [index, aspect] of grade.missingAspects.entries()) {
    if (!aspect.trim()) continue;
    variants.push({ label: `correction${round + 1}:missing${index + 1}`, text: aspect });
  }

  return variants;
}
