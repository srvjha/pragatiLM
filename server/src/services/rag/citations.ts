import type { FactBlock, FusedCandidate } from "@/services/rag/retrieval";
import type { Locator } from "@/types/domain";

/**
 * FR-4.4. A model can cite a block that was never supplied, either by
 * miscounting or by inventing one. Those markers are stripped rather than shown,
 * because a citation that resolves to nothing is worse than no citation: it
 * looks like evidence.
 */
export type ResolvedCitation = {
  markerIndex: number;
  sourceId: string;
  chunkId: string;
  sourceTitle: string;
  sourceType: string;
  snippet: string;
  locator: Locator;
  score: number;
};

const MARKER = /\[(\d+)\]/g;
const SNIPPET_LENGTH = 320;

export type MarkerResolution = {
  /** The answer with unresolvable markers removed and the rest renumbered. */
  content: string;
  citations: ResolvedCitation[];
  strippedCount: number;
};

/**
 * Markers are renumbered to the order they appear in the answer, so the chips
 * beneath it read 1, 2, 3 rather than exposing the retrieval order. A block
 * cited twice keeps one number.
 */
export function resolveMarkers(
  content: string,
  candidates: FusedCandidate[],
  facts: FactBlock[] = [],
): MarkerResolution {
  const supplied = candidates.length + facts.length;
  const assigned = new Map<number, number>();
  const citations: ResolvedCitation[] = [];
  let stripped = 0;

  const rewritten = content.replace(MARKER, (_match, digits: string) => {
    const block = Number(digits);

    if (!Number.isInteger(block) || block < 1 || block > supplied) {
      stripped += 1;
      return "";
    }

    const existing = assigned.get(block);
    if (existing !== undefined) return `[${existing}]`;

    const candidate = candidates[block - 1];

    // A computed fact is not a quotation, so it carries no chunk to open in the
    // viewer and produces no citation chip.
    if (!candidate) {
      stripped += 1;
      return "";
    }

    const markerIndex = citations.length + 1;
    assigned.set(block, markerIndex);

    citations.push({
      markerIndex,
      sourceId: candidate.sourceId,
      chunkId: candidate.chunkId,
      sourceTitle: candidate.sourceTitle,
      sourceType: candidate.sourceType,
      snippet: candidate.text.slice(0, SNIPPET_LENGTH),
      // Copied, not looked up later: this is what lets an old answer still
      // resolve after the source has been re-indexed (FR-5.10).
      locator: candidate.locator,
      score: candidate.score,
    });

    return `[${markerIndex}]`;
  });

  return {
    // Stripping a marker can leave a double space or a space before a full stop.
    content: rewritten.replace(/ {2,}/g, " ").replace(/ ([.,;:])/g, "$1"),
    citations,
    strippedCount: stripped,
  };
}

/**
 * The post generation check from the PRD: an answer with no citations, drawn
 * from a non empty retrieval set, is flagged rather than silently trusted.
 */
export function looksUngrounded(citations: ResolvedCitation[], retrievedCount: number): boolean {
  return citations.length === 0 && retrievedCount > 0;
}
