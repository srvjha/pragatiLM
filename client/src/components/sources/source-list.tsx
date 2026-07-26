"use client";

import { useState } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-2">
        <h3 className="text-sm font-semibold">Sources</h3>
        <AddSourceDialog
          notebookId={notebookId}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Add source"
            >
              <Plus className="size-4" />
            </Button>
          }
        />
      </div>

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
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Remove source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
