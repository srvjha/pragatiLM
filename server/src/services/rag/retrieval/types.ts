import type { Locator } from "@/types/domain";

/** Where a candidate came from, kept so the trace can explain any result. */
export type Channel = "VECTOR" | "FTS" | "SQL";

export type QueryVariant = {
  /** rewrite, stepBack, subQuestion1, hyde, original, or a correction keyword set. */
  label: string;
  text: string;
};

export type Candidate = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  chunkIndex: number;
  text: string;
  locator: Locator;
  /** The raw score from the channel that produced it, for the trace. */
  score: number;
};

export type RankedList = { channel: Channel; variant: string; candidates: Candidate[] };

export type FusedCandidate = Candidate & {
  fusedScore: number;
  /** Every variant and channel pair that surfaced this chunk. */
  matchedBy: string[];
};

/** A computed fact from the SQL route. Not a quotation and never a citation. */
export type FactBlock = {
  kind: "fact";
  question: string;
  statement: string;
  rows: Record<string, unknown>[];
};

export type RetrievalRequest = {
  notebookId: string;
  question: string;
  /** The last few turns, used to resolve a follow up into a standalone question. */
  history?: { role: "user" | "assistant"; content: string }[];
  sourceIds?: string[];
  /**
   * What the person is asking about, by name.
   *
   * Rewriting and grading were both blind to this, and it is what made them
   * useless on the questions people actually ask. "Explain the video" cannot be
   * turned into a searchable query by a model that does not know the video is
   * called "Why HTTP 2 is faster?" — every rewrite could only reshuffle the same
   * contentless words, so the vector search had nothing to match and the answer
   * was a refusal about a video that was indexed and sitting right there.
   *
   * Titles are cheap: a handful of short strings that turn "the video" and "the
   * book" into terms the index actually contains.
   */
  catalogue?: { title: string; type: string }[];
};

export type RoutingDecision = {
  channels: Channel[];
  sourceTypes: string[];
  sourceIds: string[];
  decidedBy: "heuristic" | "model" | "fallback";
  reason: string;
};

export type RetrievalResult = {
  variants: QueryVariant[];
  routing: RoutingDecision;
  lists: RankedList[];
  fused: FusedCandidate[];
  reranked: FusedCandidate[];
  facts: FactBlock[];
  /** True when nothing cleared the relevance floor. */
  empty: boolean;
  timingsMs: Record<string, number>;
};
