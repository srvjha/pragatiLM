import type { SourceDotState, SourceDto, SourceStatus } from "@/types/api";

/**
 * FR-2.9. The seven lifecycle statuses collapse into four dots. The detailed
 * stage stays available for the tooltip, so the pipeline is legible without
 * cluttering the list.
 */
export function dotStateFor(status: SourceStatus): SourceDotState {
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

export const dotLabel: Record<SourceDotState, string> = {
  uploading: "Uploading",
  indexing: "Indexing",
  ready: "Ready to query",
  failed: "Failed",
};

export const dotClass: Record<SourceDotState, string> = {
  uploading: "bg-muted-foreground animate-pulse",
  indexing: "bg-amber-500 animate-pulse",
  ready: "bg-emerald-500",
  failed: "bg-destructive",
};

export function statusTooltip(source: SourceDto): string {
  if (source.status === "FAILED") {
    return source.errorMessage ?? "Indexing failed";
  }

  const state = dotStateFor(source.status);
  if (state === "ready") {
    return "Ready to query";
  }

  const stage = source.statusStage ?? source.status.toLowerCase();
  return source.progress > 0 ? `${stage} (${source.progress}%)` : stage;
}

export const isQueryable = (source: SourceDto): boolean =>
  source.status === "READY";
