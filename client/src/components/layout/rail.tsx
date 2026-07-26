"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { NotebookRail } from "@/components/notebooks/notebook-rail";
import { SourceList } from "@/components/sources/source-list";
import { useNotebooks } from "@/features/notebooks/hooks";
import { useUiStore } from "@/stores/ui-store";

/**
 * The rail shows notebooks until one is open, then it shows that notebook's
 * sources, which is the arrangement in the mockups. Cmd+K switches notebooks
 * without coming back here.
 */
export function Rail() {
  const { data: notebooks } = useNotebooks();
  const { activeNotebookId, setActiveNotebook } = useUiStore();
  const router = useRouter();

  const active = notebooks?.find(
    (notebook) => notebook.id === activeNotebookId,
  );

  if (!activeNotebookId || !active) {
    return <NotebookRail />;
  }

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => {
          setActiveNotebook(null);
          router.push("/app");
        }}
        className="hover:bg-accent/60 flex items-center gap-1.5 border-b px-3 py-3 text-left"
      >
        <ChevronLeft className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {active.name}
        </span>
      </button>

      <SourceList notebookId={activeNotebookId} />
    </div>
  );
}
