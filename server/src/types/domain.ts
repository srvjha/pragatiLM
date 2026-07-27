/**
 * The locator is what makes a citation resolvable. It is persisted on the chunk
 * and copied onto the citation, so an old answer still opens at the right place
 * after the source has been re-indexed and its chunk ids have changed.
 */
export type PdfLocator = { kind: "pdf"; page: number };
export type TextLocator = { kind: "text"; startChar: number; endChar: number };
export type TimedLocator = { kind: "timed"; startSec: number; endSec: number };
export type WebLocator = {
  kind: "web";
  headingPath: string[];
  startChar: number;
  endChar: number;
};

export type Locator = PdfLocator | TextLocator | TimedLocator | WebLocator;

/** One caption track a video carries, as YouTube advertises it. */
export type CaptionTrack = { code: string; label: string };

/** Type specific metadata captured at ingestion, shape depends on source type. */
export type SourceMetadata = {
  pageCount?: number;
  durationSec?: number;
  videoId?: string;
  author?: string;
  favicon?: string;
  capturedAt?: string;
  charCount?: number;
  cueCount?: number;
  /**
   * Recorded at ingestion so the viewer can offer a language switch without
   * asking YouTube again on every open. Listing them is one call; fetching a
   * track is a download, so the tracks are stored and the cues are not.
   */
  captionTracks?: CaptionTrack[];
  /** Which of those tracks was chunked and embedded. */
  captionLanguage?: string;
};

export type RoadmapPin = { sourceId: string; startSec: number; endSec: number };

export type RoadmapModule = {
  concept: string;
  rationale: string;
  prerequisites: string[];
  estimatedMinutes: number;
  skippable: boolean;
  pins: RoadmapPin[];
};

export type PodcastTurn = {
  host: "A" | "B";
  text: string;
  sourceIds: string[];
};

/** One retrieval round, recorded for the trace. Diagnostic only. */
export type RetrievalRound = {
  queries: string[];
  perChannelIds: Record<string, string[]>;
  fusedIds: string[];
  rerankedIds: string[];
  grade: number;
  missingAspects: string[];
  keywords: string[];
  timingsMs: Record<string, number>;
};

export type QueryVariants = {
  rewrite?: string;
  stepBack?: string;
  subQuestions?: string[];
  hyde?: string;
};

export type RoutingDecision = {
  channels: ("VECTOR" | "FTS" | "SQL")[];
  sourceTypes: string[];
  sourceIds: string[];
  decidedBy: "heuristic" | "model" | "fallback";
  reason: string;
};
