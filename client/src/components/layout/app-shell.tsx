"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setRailOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setRailOpen]);

  return (
    <div className="flex h-dvh flex-col">
      <TopBar notebookId={notebookId} />

      <div className="relative flex min-h-0 flex-1">
        {railOpen && (
          <div
            className="fixed inset-0 top-14 z-30 bg-black/40 lg:hidden"
            onClick={() => setRailOpen(false)}
            aria-hidden
          />
        )}

        <aside
          className={cn(
            "bg-background z-40 w-72 shrink-0 border-r",
            "fixed inset-y-0 top-14 left-0 transition-transform lg:static lg:top-0 lg:translate-x-0",
            railOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Notebooks"
        >
          <PanelErrorBoundary label="notebook list">
            <Rail />
          </PanelErrorBoundary>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <NotebookSwitcher notebooks={notebooks ?? []} />
    </div>
  );
}
