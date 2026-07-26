import * as repo from "@/db/repositories/source.repository";
import { channels, publish, type SourceEvent } from "@/lib/events";
import type { SourceStatus } from "@/db/schema";

/**
 * The single place a source's status changes. Postgres is written first and is
 * authoritative; the published event is a notification that something changed,
 * so a dropped frame costs a UI update rather than correctness.
 */
export async function setSourceStatus(input: {
  sourceId: string;
  notebookId: string;
  status: SourceStatus;
  statusStage?: string | null;
  progress?: number;
  errorMessage?: string | null;
  indexedAt?: Date | null;
}): Promise<void> {
  const statusStage = input.statusStage ?? null;
  const progress = input.progress ?? 0;
  const errorMessage = input.errorMessage ?? null;

  await repo.setStatus(input.sourceId, input.status, {
    statusStage,
    progress,
    errorMessage,
    ...(input.indexedAt !== undefined ? { indexedAt: input.indexedAt } : {}),
  });

  const event: SourceEvent = {
    type: "source.status",
    sourceId: input.sourceId,
    notebookId: input.notebookId,
    status: input.status,
    statusStage,
    progress,
    errorMessage,
  };

  await publish(channels.source(input.notebookId), event);
}

/** The four dots the UI shows, collapsed from the seven lifecycle statuses. */
export function dotStateFor(status: SourceStatus): "uploading" | "indexing" | "ready" | "failed" {
  switch (status) {
    case "QUEUED":
    case "UPLOADING":
      return "uploading";
    case "EXTRACTING":
    case "CHUNKING":
    case "EMBEDDING":
      return "indexing";
    case "READY":
      return "ready";
    case "FAILED":
      return "failed";
  }
}
