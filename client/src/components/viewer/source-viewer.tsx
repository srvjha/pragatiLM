"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  PanelRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const showSourceList = useUiStore((state) => state.showSourceList);
  const closeViewer = useUiStore((state) => state.closeViewer);
  const viewerWide = useUiStore((state) => state.viewerWide);
  const setViewerWide = useUiStore((state) => state.setViewerWide);

  const { data: sources } = useSources(notebookId);
  const source = sources?.find((row) => row.id === sourceId);

  const { data, isPending, isError } = useQuery({
    queryKey: ["source-content", sourceId],
    queryFn: () => fetchSourceContent(notebookId, sourceId ?? ""),
    enabled: sourceId !== null,
  });

  if (!sourceId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <PanelRight
          className="text-muted-foreground size-6"
          strokeWidth={1.25}
        />
        <p className="text-sm font-medium">Nothing open here yet</p>
        <p className="text-muted-foreground max-w-xs font-serif text-sm leading-relaxed">
          Click a numbered marker in an answer, or a source in the list, and it
          opens in this panel at the exact page, second or paragraph cited.
        </p>
      </div>
    );
  }

  const kindLabel = source ? sourceKindLabel[source.type] : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-2 py-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label="Back to the source list"
                onClick={showSourceList}
              >
                <ChevronLeft className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Back to the source list</TooltipContent>
        </Tooltip>

        <div className="mr-1 min-w-0 flex-1">
          <h2
            className="truncate text-sm font-semibold"
            // The panel is narrow and titles are not, so the full one has to
            // be recoverable without opening the source.
            title={source?.title ?? undefined}
          >
            {source?.title ?? "Source"}
          </h2>
          {kindLabel && (
            <p className="text-muted-foreground font-mono text-[0.6rem] tracking-[0.12em] uppercase">
              {kindLabel}
            </p>
          )}
        </div>

        {/* A video is the one thing here that a third of the screen is not
            enough of. The column can always be dragged, but nobody should have
            to discover that to watch something. */}
        {data?.kind === "timed" && data.videoId && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={
                    viewerWide ? "Narrow this panel" : "Widen this panel"
                  }
                  aria-pressed={viewerWide}
                  onClick={() => setViewerWide(!viewerWide)}
                >
                  {viewerWide ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Maximize2 className="size-3.5" />
                  )}
                </Button>
              }
            />
            <TooltipContent>
              {viewerWide ? "Give the width back to the chat" : "Watch bigger"}
            </TooltipContent>
          </Tooltip>
        )}

        {source?.originalUrl && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Open the original in a new tab"
                  onClick={() =>
                    window.open(source.originalUrl ?? "", "_blank", "noopener")
                  }
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>Open the original in a new tab</TooltipContent>
          </Tooltip>
        )}

        {/* This used to repeat the back arrow, with the same label and the
            same action, so the header offered one destination twice and no
            way to shut the column at all. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Close the source panel"
                onClick={closeViewer}
              >
                <X className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Close the panel</TooltipContent>
        </Tooltip>
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
            notebookId={notebookId}
            sourceId={sourceId}
            cues={data.cues}
            paragraphs={data.paragraphs}
            videoId={data.videoId}
            durationSec={data.durationSec}
            tracks={data.tracks}
            track={data.track}
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

/**
 * What the panel is showing, under the title.
 *
 * A title alone does not say whether clicking a citation will land you on a
 * page, a timestamp or a paragraph, and the viewer behaves differently in each.
 */
const sourceKindLabel: Record<string, string> = {
  PDF: "PDF · cited by page",
  YOUTUBE: "Video · cited by timestamp",
  VTT: "Transcript · cited by timestamp",
  WEB: "Web page · cited by section",
  TEXT: "Text · cited by position",
};

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
