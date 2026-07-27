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

/**
 * Four dots, in the product's own colours rather than borrowed traffic lights.
 *
 * Amber and emerald came from outside the palette and quietly broke its one
 * rule: colour here is a claim about state, and yellow already means "the
 * product matched something". A source part way through indexing had not
 * matched anything, so it was wearing the highlighter for no reason.
 *
 * With no accent hue left in the palette, the difference has to be shape
 * rather than colour: work in progress is a hollow ring, finished work is a
 * filled dot. Two shades of the same grey would have been the distinction
 * otherwise, which is exactly the sort of thing that reads fine beside its
 * own legend and not at all in a list of twelve sources.
 *
 * Failed keeps the stamp, the one colour that already means refusal
 * throughout. The marker is deliberately not used for ready, tempting as it
 * is: a source that has finished indexing has not matched anything yet, and
 * spending the highlighter on "finished" would weaken it everywhere it means
 * "this is the passage".
 */
export const dotClass: Record<SourceDotState, string> = {
  uploading: "border border-muted-foreground/70 motion-safe:animate-pulse",
  indexing: "border border-foreground/70 motion-safe:animate-pulse",
  ready: "bg-foreground",
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
