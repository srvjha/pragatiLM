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
  status: "QUEUED" | "RUNNING" | "READY" | "FAILED";
  errorMessage: string | null;
  createdAt: string;
};

export type PodcastTurn = {
  host: "A" | "B";
  text: string;
  sourceIds: string[];
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
};
