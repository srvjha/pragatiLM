"use client";

import { useState } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddSourceDialog } from "./add-source-dialog";
import { SourceRow } from "./source-row";
import {
  useDeleteSource,
  useReindexSource,
  useRenameSource,
  useSources,
  useToggleSourceSelected,
} from "@/features/sources/hooks";
import { useSourceEvents } from "@/features/sources/use-source-events";
import { useUiStore } from "@/stores/ui-store";
import type { SourceDto } from "@/types/api";

export function SourceList({ notebookId }: { notebookId: string }) {
  const { data: sources, isPending, isError, refetch } = useSources(notebookId);
  const setViewerSource = useUiStore((state) => state.setViewerSource);

  // FR-2.9: the live path. Rows move without a refetch or a page reload.
  useSourceEvents(notebookId);

  const toggle = useToggleSourceSelected(notebookId);
  const rename = useRenameSource(notebookId);
  const reindex = useReindexSource(notebookId);
  const remove = useDeleteSource(notebookId);

  const [pendingDelete, setPendingDelete] = useState<SourceDto | null>(null);

  const total = sources?.length ?? 0;
  const selectedCount = (sources ?? []).filter((row) => row.selected).length;
  const allSelected = total > 0 && selectedCount === total;

  /**
   * One mutation per row rather than a bulk endpoint, because the server has
   * no such route and inventing one for a control this small is not worth a
   * migration. Rows already reconcile individually over the event stream.
   */
  function setAllSelected(selected: boolean) {
    for (const source of sources ?? []) {
      if (source.selected !== selected) {
        toggle.mutate({ sourceId: source.id, selected });
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
          Sources
        </h3>

        {total > 0 && (
          <span className="text-muted-foreground font-mono text-[0.65rem] tabular-nums">
            {selectedCount}/{total}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* A checkbox gates whether a source is searched at all, so a
              notebook with twenty of them needed twenty clicks to narrow to
              one, and twenty more to put them back. */}
          {total > 1 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground h-7 px-2 text-[0.7rem]"
                    onClick={() => setAllSelected(!allSelected)}
                  >
                    {allSelected ? "None" : "All"}
                  </Button>
                }
              />
              <TooltipContent>
                {allSelected
                  ? "Stop searching every source"
                  : "Search every source"}
              </TooltipContent>
            </Tooltip>
          )}

          <AddSourceDialog
            notebookId={notebookId}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Add a source"
              >
                <Plus className="size-4" />
              </Button>
            }
          />
        </div>
      </div>

      {/* Silence here would be the notebook quietly refusing every question
          for a reason nobody could see. */}
      {total > 0 && selectedCount === 0 && (
        <p className="border-b px-3 py-2 font-serif text-xs leading-relaxed text-muted-foreground">
          No source is selected, so there is nothing to answer from. Tick at
          least one.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {isPending && (
          <ul className="space-y-1 px-2" aria-hidden>
            {[0, 1, 2].map((row) => (
              <li key={row} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="size-2 rounded-full" />
              </li>
            ))}
          </ul>
        )}

        {isError && (
          <div className="px-4 py-6 text-center">
            <AlertCircle className="text-muted-foreground mx-auto size-5" />
            <p className="text-muted-foreground mt-2 text-sm">
              Could not load your sources.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </div>
        )}

        {sources && sources.length === 0 && (
          <div className="px-4 py-6">
            <p className="text-sm font-medium">Add your first source</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Answers come only from what is here. Supported: PDF, YouTube, web
              pages, plain text, and VTT or SRT transcripts.
            </p>
            <AddSourceDialog
              notebookId={notebookId}
              trigger={
                <Button size="sm" className="mt-3">
                  <Plus className="size-4" />
                  Add source
                </Button>
              }
            />
          </div>
        )}

        {sources && sources.length > 0 && (
          <ul className="space-y-0.5 px-2">
            {sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                onToggle={(selected) =>
                  toggle.mutate({ sourceId: source.id, selected })
                }
                onRename={(title) =>
                  rename.mutate({ sourceId: source.id, title })
                }
                onReindex={() => reindex.mutate(source.id)}
                onDelete={() => setPendingDelete(source)}
                onOpen={() => setViewerSource(source.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes its indexed content, so future answers will not use
              it. Answers you have already received keep their citations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
              className="bg-stamp text-stamp-foreground hover:bg-stamp/90"
            >
              Remove source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
