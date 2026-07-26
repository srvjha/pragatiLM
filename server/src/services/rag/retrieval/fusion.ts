import type { FusedCandidate, RankedList } from "./types";

/**
 * Reciprocal rank fusion.
 *
 * LangChain v1 removed EnsembleRetriever, which is what the requirements
 * originally called for, so this is written here rather than imported. It is a
 * small, well specified formula and the alternative was pinning the whole
 * retrieval stack to a superseded major version to avoid fifteen lines.
 *
 * A chunk's fused score is the sum, over every list it appears in, of
 * 1 / (k + rank) with rank counted from 1. The constant damps the difference
 * between the top few positions, so agreement across lists matters more than a
 * single first place. That agreement is the entire reason for generating query
 * variants: a chunk found by the rewrite, the step back question and the HyDE
 * passage is far more likely to be the right one than a chunk found once.
 */
export function reciprocalRankFusion(lists: RankedList[], k: number): FusedCandidate[] {
  const fused = new Map<string, FusedCandidate>();

  for (const list of lists) {
    list.candidates.forEach((candidate, index) => {
      const rank = index + 1;
      const contribution = 1 / (k + rank);
      const label = `${list.variant}:${list.channel}`;
      const existing = fused.get(candidate.chunkId);

      if (existing) {
        existing.fusedScore += contribution;
        existing.matchedBy.push(label);
        // Keep the best raw score seen, so the trace can show how strongly any
        // single channel rated it.
        existing.score = Math.max(existing.score, candidate.score);
        return;
      }

      fused.set(candidate.chunkId, { ...candidate, fusedScore: contribution, matchedBy: [label] });
    });
  }

  return [...fused.values()].sort((a, b) => b.fusedScore - a.fusedScore);
}

/**
 * FR-3.26. The floor is applied to the fused score, normalised against the best
 * result in this run, because an absolute RRF score means nothing on its own:
 * its scale depends on how many lists were fused.
 *
 * A single candidate always passes. Nothing to compare it against does not make
 * it irrelevant, and the grader is the honest judge of sufficiency.
 */
export function applyRelevanceFloor(candidates: FusedCandidate[], floor: number): FusedCandidate[] {
  if (candidates.length <= 1) return candidates;

  const best = candidates[0]?.fusedScore ?? 0;
  if (best <= 0) return [];

  return candidates.filter((candidate) => candidate.fusedScore / best >= floor);
}
