"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { TopBar } from "./top-bar";
import { Rail } from "./rail";
import { PanelErrorBoundary } from "./error-boundary";
import { NotebookSwitcher } from "@/components/notebooks/notebook-switcher";
import { useNotebooks } from "@/features/notebooks/hooks";
import { useUiStore } from "@/stores/ui-store";

/**
 * The persistent frame: top bar, left rail, main pane. Every later surface, the
 * source list, the chat transcript, the viewer, mounts inside the main pane
 * rather than defining its own layout.
 *
 * FR-8.1: at 1024px and up the rail is a static column. Below that it becomes an
 * overlay drawer, so the main pane keeps the full width on a phone.
 */
export function AppShell({
  children,
  notebookId,
}: {
  children: React.ReactNode;
  /** Shown in the header, so the current notebook is named even when the rail
      is collapsed into a drawer. */
  notebookId?: string;
}) {
  const { data: notebooks } = useNotebooks();
  const { railOpen, setRailOpen } = useUiStore();
  const railIsStatic = useMediaQuery("(min-width: 1024px)");

  // Only claim Escape while the drawer is actually open. The workspace binds the
  // same key to close the source viewer, and an unconditional handler here meant
  // one press quietly did two things.
  useEffect(() => {
    if (!railOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setRailOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [railOpen, setRailOpen]);

  return (
    <div className="flex h-dvh flex-col">
      {/* The first stop for a keyboard user, who otherwise tabs through the
          header and the entire notebook list before reaching the answer they
          came for. Off screen until focused, then a real, visible control. */}
      <a
        href="#workspace"
        className="bg-primary text-primary-foreground sr-only rounded-lg px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      <TopBar notebookId={notebookId} />

      <div className="relative flex min-h-0 flex-1">
        {railOpen && (
          <div
            className="motion-safe:animate-in motion-safe:fade-in-0 bg-foreground/40 fixed inset-0 top-14 z-30 lg:hidden"
            onClick={() => setRailOpen(false)}
            aria-hidden
          />
        )}

        {/*
          A closed drawer is still in the document, so without `inert` the tab
          order ran straight through a rail sitting off the left edge of the
          screen: focus vanished and the page appeared to stop responding to the
          keyboard. Only transform moves, so the slide is composited.
        */}
        <aside
          inert={!railIsStatic && !railOpen}
          className={cn(
            "bg-sidebar border-sidebar-border z-40 w-72 shrink-0 border-r",
            "fixed inset-y-0 top-14 left-0 transition-transform duration-200 ease-out motion-reduce:transition-none lg:static lg:top-0 lg:translate-x-0",
            railOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Notebooks"
        >
          <PanelErrorBoundary label="notebook list">
            <Rail />
          </PanelErrorBoundary>
        </aside>

        <main id="workspace" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      <NotebookSwitcher notebooks={notebooks ?? []} />
    </div>
  );
}
