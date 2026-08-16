/**
 * The wire contract. This file is the source of truth; client/src/types/api.ts
 * mirrors it, and the API tests assert real response shapes so a drift between
 * the two fails the suite rather than surfacing as a runtime bug.
 */

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiSuccess<T> = { data: T };
export type ApiFailure = { error: ApiErrorBody };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type NotebookDto = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type NotebookListItemDto = NotebookDto & {
  sourceCount: number;
  lastActivityAt: string;
};

export type CreateNotebookBody = { name?: string };
export type UpdateNotebookBody = { name: string };

export type PlanDto = {
  code: string;
  name: string;
  blurb: string;
  /** Paise, not rupees. Money is an integer here for the same reason it is in the database. */
  pricePaise: number;
  monthlyCredits: number;
  notebooks: number;
  sourcesPerNotebook: number;
  storageBytes: number;
  podcasts: boolean;
};

export type SubscriptionDto = {
  status: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  /**
   * Set once cancellation has been asked for. The difference between this being
   * null and not is the difference between "renews on" and "ends on", which is
   * the same date meaning opposite things.
   */
  cancelAtPeriodEnd: string | null;
};

export type PaymentDto = {
  id: string;
  /** Paise, as the provider reported it — not recomputed from today's price. */
  amountPaise: number;
  currency: string;
  planCode: string;
  paidAt: string;
};

export type BillingStateDto = {
  plan: PlanDto;
  /** Credits left in the current period. */
  balance: number;
  periodStart: string;
  periodEnd: string;
  /** Null on the free tier, which is what having no subscription means. */
  subscription: SubscriptionDto | null;
};

export type SourceType = "PDF" | "TEXT" | "WEB" | "YOUTUBE" | "VTT";

export type SourceStatus =
  "QUEUED" | "UPLOADING" | "EXTRACTING" | "CHUNKING" | "EMBEDDING" | "READY" | "FAILED";

/** The four dots the UI shows, collapsed from the seven lifecycle statuses. */
export type SourceDotState = "uploading" | "indexing" | "ready" | "failed";

export type SourceMetadata = {
  pageCount?: number;
  durationSec?: number;
  videoId?: string;
  author?: string;
  favicon?: string;
  capturedAt?: string;
  charCount?: number;
  cueCount?: number;
};

export type SourceDto = {
  id: string;
  notebookId: string;
  type: SourceType;
  title: string;
  status: SourceStatus;
  statusStage: string | null;
  progress: number;
  errorMessage: string | null;
  selected: boolean;
  originalUrl: string | null;
  metadata: SourceMetadata;
  createdAt: string;
  indexedAt: string | null;
};

export type CreateTextSourceBody = { title?: string; content: string };
export type CreateUrlSourceBody = { url: string };
export type UpdateSourceBody = { title?: string; selected?: boolean };

/** The locator is what makes a citation resolvable in the viewer. */
export type Locator =
  | { kind: "pdf"; page: number }
  | { kind: "text"; startChar: number; endChar: number }
  | { kind: "timed"; startSec: number; endSec: number }
  | { kind: "web"; headingPath: string[]; startChar: number; endChar: number };

export type MessageRole = "user" | "assistant";
export type MessageStatus = "streaming" | "complete" | "stopped" | "error";

export type CitationDto = {
  id: string;
  messageId: string;
  sourceId: string | null;
  chunkId: string | null;
  /** The source's name and kind when the answer was written, copied so a
      citation still describes itself after the source is deleted. */
  sourceTitle: string;
  sourceType: string;
  snippet: string;
  locator: Locator;
  score: number | null;
  markerIndex: number;
};

export type MessageDto = {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  retrievalRunId: string | null;
  createdAt: string;
  citations: CitationDto[];
};

export type ChatDto = {
  id: string;
  notebookId: string;
  title: string;
  createdAt: string;
};

export type SendMessageBody = { content: string; sourceIds?: string[] };

export type RoadmapLevel = "new" | "some" | "experienced";
export type RoadmapPin = { sourceId: string; startSec: number; endSec: number };

export type RoadmapModule = {
  concept: string;
  rationale: string;
  prerequisites: string[];
  estimatedMinutes: number;
  skippable: boolean;
  pins: RoadmapPin[];
};

export type RoadmapDto = {
  id: string;
  notebookId: string;
  level: RoadmapLevel;
  goal: string | null;
  modules: RoadmapModule[];
  status: "QUEUED" | "RUNNING" | "READY" | "FAILED";
  errorMessage: string | null;
  createdAt: string;
};

export type PodcastTurn = { host: "A" | "B"; text: string; sourceIds: string[] };

export type PodcastDto = {
  id: string;
  title: string;
  script?: PodcastTurn[];
  status: "QUEUED" | "RUNNING" | "READY" | "FAILED";
  stage: "SCRIPTING" | "SYNTHESIZING" | "MIXING" | "READY" | null;
  progress: number;
  durationSec: number | null;
  errorMessage: string | null;
  createdAt: string;
};

export type ServiceHealth = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type HealthReport = {
  status: "ok" | "degraded";
  uptimeSec: number;
  services: Record<"postgres" | "redis" | "qdrant", ServiceHealth>;
};

/** Everything the analytics dashboard renders, scoped to one user. */
export type AnalyticsDto = {
  notebooks: number;
  sources: {
    total: number;
    ready: number;
    failed: number;
    byType: { type: string; count: number; ready: number }[];
  };
  index: { chunks: number; tokens: number; storedBytes: number };
  answers: {
    questions: number;
    answered: number;
    refused: number;
    withCitations: number;
    /** Null until at least one answer exists, so 0/0 is not shown as a score. */
    citationCoverage: number | null;
    refusalRate: number | null;
  };
  retrieval: {
    runs: number;
    medianCorrectionRounds: number;
    averageContextGrade: number;
    medianLatencyMs: number;
  };
  artifacts: { roadmaps: number; podcasts: number };
  activity: { day: string; sources: number; questions: number }[];
};
