import { CohereRerank } from "@langchain/cohere";
import { env } from "@/config/env";
import { childLogger } from "@/lib/logger";
import type { FusedCandidate } from "./types";

const log = childLogger("retrieval:rerank");

/**
 * FR-3.25. Reranking runs against the user's original question, never a
 * translated variant: the variants exist to widen recall, and judging relevance
 * against a machine's rephrasing would compound whatever it got wrong.
 */
export async function rerank(
  question: string,
  candidates: FusedCandidate[],
  topN: number,
): Promise<FusedCandidate[]> {
  if (candidates.length <= 1) return candidates.slice(0, topN);

  if (!env.RERANK_ENABLED || !env.COHERE_API_KEY) return mmr(candidates, topN);

  try {
    const reranker = new CohereRerank({
      apiKey: env.COHERE_API_KEY,
      model: "rerank-v3.5",
      topN,
    });

    const ranked = await reranker.rerank(
      candidates.map((candidate) => ({ pageContent: candidate.text, metadata: {} })),
      question,
      { topN },
    );

    return ranked
      .map((result) => {
        const candidate = candidates[result.index];
        return candidate ? { ...candidate, score: result.relevanceScore } : null;
      })
      .filter((candidate): candidate is FusedCandidate => candidate !== null);
  } catch (error) {
    log.warn({ err: error }, "rerank failed, falling back to MMR");
    return mmr(candidates, topN);
  }
}

/**
 * The fallback when no Cohere key is configured. Maximal marginal relevance
 * trades a little relevance for diversity, which matters here because the
 * variants deliberately search several ways and the top of the fused list can
 * otherwise be several near copies of the same passage.
 *
 * Similarity is lexical rather than vector based: re-embedding every candidate
 * to reorder eight of them would cost more than the reordering is worth.
 */
export function mmr(candidates: FusedCandidate[], topN: number, lambda = 0.7): FusedCandidate[] {
  const selected: FusedCandidate[] = [];
  const remaining = [...candidates];
  const best = candidates[0]?.fusedScore ?? 1;

  while (selected.length < topN && remaining.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;

    remaining.forEach((candidate, index) => {
      const relevance = candidate.fusedScore / best;
      const redundancy = selected.reduce(
        (worst, chosen) => Math.max(worst, jaccard(candidate.text, chosen.text)),
        0,
      );
      const value = lambda * relevance - (1 - lambda) * redundancy;

      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    });

    const [chosen] = remaining.splice(bestIndex, 1);
    if (chosen) selected.push(chosen);
  }

  return selected;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );
}

function jaccard(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;

  return shared / (left.size + right.size - shared);
}
