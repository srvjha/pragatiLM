"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchSourceContent,
  sourceContentUrl,
} from "@/features/sources/content-api";
import { useSources } from "@/features/sources/hooks";
import { useUiStore } from "@/stores/ui-store";
import { PdfView } from "./pdf-view";
import { TimedView } from "./timed-view";
import { TextView } from "./text-view";
import { WebView } from "./web-view";

/**
 * FR-5.5 to FR-5.9. The panel renders differently per type, and when it was
 * opened from a citation it lands on the cited location and highlights it.
 * Anything that cannot be rendered falls back to a download rather than an
 * error, so a citation always leads somewhere.
 */
export function SourceViewer({ notebookId }: { notebookId: string }) {
  const sourceId = useUiStore((state) => state.viewerSourceId);
  const locator = useUiStore((state) => state.viewerLocator);
  const snippet = useUiStore((state) => state.viewerSnippet);
  const closeViewer = useUiStore((state) => state.closeViewer);

  const { data: sources } = useSources(notebookId);
  const source = sources?.find((row) => row.id === sourceId);

  const { data, isPending, isError } = useQuery({
    queryKey: ["source-content", sourceId],
    queryFn: () => fetchSourceContent(notebookId, sourceId ?? ""),
    enabled: sourceId !== null,
  });

  if (!sourceId) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm">
        Select a citation to inspect a source.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {source?.title ?? "Source"}
        </h2>

        {source?.originalUrl && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Open the original"
            onClick={() =>
              window.open(source.originalUrl ?? "", "_blank", "noopener")
            }
          >
            <ExternalLink className="size-3.5" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Close viewer"
          onClick={closeViewer}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {isPending && (
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {isError && <Fallback notebookId={notebookId} sourceId={sourceId} />}

        {data?.kind === "pdf" && (
          <PdfView
            // Remounts when a different citation is opened, so the viewer
            // starts fresh at the new page instead of syncing state to it.
            key={`${sourceId}:${locator?.kind === "pdf" ? locator.page : 0}:${snippet ?? ""}`}
            notebookId={notebookId}
            sourceId={sourceId}
            locator={locator}
            snippet={snippet}
          />
        )}
        {data?.kind === "timed" && (
          <TimedView
            cues={data.cues}
            videoId={data.videoId}
            locator={locator}
          />
        )}
        {data?.kind === "text" && (
          <TextView text={data.text} locator={locator} />
        )}
        {data?.kind === "web" && <WebView html={data.html} locator={locator} />}
      </div>
    </div>
  );
}

/** FR-5: a source that cannot be rendered still has to lead somewhere. */
function Fallback({
  notebookId,
  sourceId,
}: {
  notebookId: string;
  sourceId: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-muted-foreground text-sm">
        This source cannot be displayed here.
      </p>
      <a
        href={sourceContentUrl(notebookId, sourceId)}
        download
        className="hover:bg-accent inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors"
      >
        <Download className="size-3.5" />
        Download the original
      </a>
    </div>
  );
}
