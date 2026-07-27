"use client";

import { useEffect, useState } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { AudioLines, Map, MessageSquare, PanelRight, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ChatPanel } from "@/components/chat/chat-panel";
import { RoadmapPanel } from "@/components/artifacts/roadmap-panel";
import { PodcastPanel } from "@/components/artifacts/podcast-panel";
import { SourceViewer } from "@/components/viewer/source-viewer";
import { SourceList } from "@/components/sources/source-list";
import { PanelErrorBoundary } from "@/components/layout/error-boundary";
import { Button } from "@/components/ui/button";
import { useSources } from "@/features/sources/hooks";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { useMediaQuery } from "@/lib/use-media-query";

type Tab = "chat" | "roadmap" | "podcast";

/**
 * Three columns: notebooks, the conversation, and the material.
 *
 * The right column holds the source list, and becomes the open source when a
 * citation is clicked. One column with one job, rather than the list on the
 * left and the viewer on the right fighting over the same content. It also
 * puts the reading direction to work: the claim is on the left and the
 * evidence it rests on opens to its right.
 *
 * FR-8.1: below 1280px there is not room for three, so the right column
 * becomes an overlay reached from the Sources button.
 */
export function NotebookWorkspace({ notebookId }: { notebookId: string }) {
  const [tab, setTab] = useState<Tab>("chat");
  const setActiveNotebook = useUiStore((state) => state.setActiveNotebook);
  const viewerOpen = useUiStore((state) => state.viewerOpen);
  const setViewerOpen = useUiStore((state) => state.setViewerOpen);
  const viewerSourceId = useUiStore((state) => state.viewerSourceId);
  const closeViewer = useUiStore((state) => state.closeViewer);
  const viewerWide = useUiStore((state) => state.viewerWide);
  const materialRef = usePanelRef();

  const { data: sources } = useSources(notebookId);
  const canSplit = useMediaQuery("(min-width: 1280px)");

  // The URL is the source of truth for which notebook is open; the store mirrors
  // it so the rail and the switcher agree.
  useEffect(() => {
    setActiveNotebook(notebookId);
  }, [notebookId, setActiveNotebook]);

  // Driven from the store rather than from a size prop, because the column is
  // also draggable: re-rendering it at a fixed size would fight whatever width
  // the reader had chosen by hand.
  useEffect(() => {
    materialRef.current?.resize(viewerWide ? "62" : "32");
  }, [viewerWide, materialRef]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeViewer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeViewer]);

  /** The right column: the open source if there is one, otherwise the list. */
  const material = (
    <PanelErrorBoundary label="sources">
      {viewerSourceId ? (
        <SourceViewer notebookId={notebookId} />
      ) : (
        <SourceList notebookId={notebookId} />
      )}
    </PanelErrorBoundary>
  );

  const main = (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
        {(
          [
            { id: "chat", label: "Chat", icon: MessageSquare },
            { id: "roadmap", label: "Roadmap", icon: Map },
            { id: "podcast", label: "Podcast", icon: AudioLines },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTab(option.id)}
            aria-current={tab === option.id ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
              tab === option.id
                ? "bg-accent font-medium"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            <option.icon className="size-3.5" />
            {option.label}
          </button>
        ))}

        {/* Below the split breakpoint the right column is hidden, so it needs a
            way in. The count is here because it is the one thing about the
            sources worth knowing without opening them. */}
        {!canSplit && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => setViewerOpen(true)}
          >
            <PanelRight className="size-3.5" />
            Sources
            {sources && sources.length > 0 && (
              <span className="text-muted-foreground font-mono text-[10px]">
                {sources.length}
              </span>
            )}
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <PanelErrorBoundary label={tab}>
          {tab === "chat" && <ChatPanel notebookId={notebookId} />}
          {tab === "roadmap" && <RoadmapPanel notebookId={notebookId} />}
          {tab === "podcast" && <PodcastPanel notebookId={notebookId} />}
        </PanelErrorBoundary>
      </div>
    </div>
  );

  if (canSplit) {
    return (
      <AppShell notebookId={notebookId}>
        <Group orientation="horizontal" className="h-full">
          {/* Strings are percentages in react-resizable-panels v4; a bare
              number means pixels, which collapses the column to a sliver. */}
          <Panel id="chat" minSize="35">
            {main}
          </Panel>
          {/* Wider than it looks: the visible line stays a hairline while the
              grab area is comfortable, because a one-pixel drag target is a
              feature only a mouse user with a steady hand can reach. */}
          <Separator className="group/handle relative w-1 shrink-0 cursor-col-resize bg-transparent">
            <span
              aria-hidden
              className="bg-border group-hover/handle:bg-primary/60 absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors"
            />
          </Separator>
          <Panel
            id="material"
            panelRef={materialRef}
            defaultSize="32"
            minSize="20"
          >
            {material}
          </Panel>
        </Group>
      </AppShell>
    );
  }

  return (
    <AppShell notebookId={notebookId}>
      <div className="relative h-full">
        {main}

        {viewerOpen && (
          <>
            <div
              className="motion-safe:animate-in motion-safe:fade-in fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
              onClick={closeViewer}
              aria-hidden
            />
            <aside
              aria-label="Sources"
              className="bg-background motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200 fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l shadow-xl"
            >
              <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                <h2 className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.14em] uppercase">
                  Sources
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-7"
                  aria-label="Close sources"
                  onClick={closeViewer}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1">{material}</div>
            </aside>
          </>
        )}
      </div>
    </AppShell>
  );
}
