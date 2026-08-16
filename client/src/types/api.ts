/**
 * Mirrors server/src/types/api.ts. The server is the source of truth: when a
 * shape changes there, it changes here in the same commit. The mirror is not
 * trusted, it is verified, because the API and Playwright suites assert against
 * real responses, so a drift fails the tests rather than surfacing at runtime.
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
  /** Paise. Divide by 100 to show rupees; never hold money as a float. */
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
   * null and not is the difference between "renews on" and "ends on".
   */
  cancelAtPeriodEnd: string | null;
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

/** What each action costs, served so the pricing page cannot drift from the server. */
export type CreditCostsDto = {
  chat: number;
  source: number;
  roadmap: number;
  podcast: number;
};

export type PlanCatalogueDto = {
  plans: PlanDto[];
  creditCosts: CreditCostsDto;
  /** False when no payment keys are configured, so checkout is not offered. */
  billingEnabled: boolean;
};

/**
 * The `details` a 402 or 403 from the credit gate carries, so the upgrade prompt
 * can say something specific rather than "something went wrong".
 */
export type CreditErrorDetails = {
  action: string;
  plan: string;
  balance?: number;
  needed: number;
};

export type SourceType = "PDF" | "TEXT" | "WEB" | "YOUTUBE" | "VTT";

export type SourceStatus =
  | "QUEUED"
  | "UPLOADING"
  | "EXTRACTING"
  | "CHUNKING"
  | "EMBEDDING"
  | "READY"
  | "FAILED";

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

/** The locator is what makes a citation resolvable in the viewer. */
export type Locator =
  | { kind: "pdf"; page: number }
  | { kind: "text"; startChar: number; endChar: number }
  | { kind: "timed"; startSec: number; endSec: number }
  | { kind: "web"; headingPath: string[]; startChar: number; endChar: number };

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
  /** Which sources it was built from. Empty means every timed source. */
  sourceIds: string[];
  status: "QUEUED" | "RUNNING" | "READY" | "FAILED";
  /** What it is doing right now, and roughly how far in. */
  statusStage: string | null;
  progress: number;
  errorMessage: string | null;
  createdAt: string;
};

export type PodcastTurn = {
  host: "A" | "B";
  text: string;
  sourceIds: string[];
  /**
   * Where this turn falls in the finished episode, measured from the segment
   * synthesised for it. Absent on episodes made before the timings were
   * recorded, so the transcript has to cope without them.
   */
  startSec?: number;
  endSec?: number;
};

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
  /**
   * Whether anything is consuming the queues. Separate from the services
   * because it is not an outage: the API is healthy with no worker attached,
   * it simply cannot finish anything it is asked to do.
   */
  worker: { alive: boolean; queues: string[] };
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
