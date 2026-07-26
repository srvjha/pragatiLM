"use client";

import { useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { AppShell } from "@/components/layout/app-shell";
import { useState } from "react";
import { AudioLines, Map, MessageSquare } from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { RoadmapPanel } from "@/components/artifacts/roadmap-panel";
import { PodcastPanel } from "@/components/artifacts/podcast-panel";
import { cn } from "@/lib/utils";
import { SourceViewer } from "@/components/viewer/source-viewer";
import { PanelErrorBoundary } from "@/components/layout/error-boundary";
import { useUiStore } from "@/stores/ui-store";
import { useMediaQuery } from "@/lib/use-media-query";

type Tab = "chat" | "roadmap" | "podcast";

export function NotebookWorkspace({ notebookId }: { notebookId: string }) {
  const [tab, setTab] = useState<Tab>("chat");
  const setActiveNotebook = useUiStore((state) => state.setActiveNotebook);
  const viewerOpen = useUiStore((state) => state.viewerOpen);
  const closeViewer = useUiStore((state) => state.closeViewer);

  // FR-8.1: a split pane has room at 1280px and up; below that the viewer
  // becomes an overlay so the chat keeps the full width.
  const canSplit = useMediaQuery("(min-width: 1280px)");

  // The URL is the source of truth for which notebook is open; the store mirrors
  // it so the rail and the switcher agree.
  useEffect(() => {
    setActiveNotebook(notebookId);
  }, [notebookId, setActiveNotebook]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeViewer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeViewer]);

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

  return (
    <AppShell>
      {viewerOpen && canSplit ? (
        <Group orientation="horizontal" className="h-full">
          <Panel id="chat" minSize={30}>
            {main}
          </Panel>
          <Separator className="bg-border hover:bg-foreground/20 w-1 transition-colors" />
          <Panel id="viewer" minSize={25}>
            <PanelErrorBoundary label="source viewer">
              <SourceViewer notebookId={notebookId} />
            </PanelErrorBoundary>
          </Panel>
        </Group>
      ) : (
        <div className="relative h-full">
          {main}

          {viewerOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/40"
                onClick={closeViewer}
                aria-hidden
              />
              <aside className="bg-background fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l shadow-xl">
                <PanelErrorBoundary label="source viewer">
                  <SourceViewer notebookId={notebookId} />
                </PanelErrorBoundary>
              </aside>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
