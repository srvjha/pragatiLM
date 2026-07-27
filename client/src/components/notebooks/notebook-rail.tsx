"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotebookRow } from "./notebook-row";
import { CreateNotebookDialog } from "./create-notebook-dialog";
import { DeleteNotebookDialog } from "./delete-notebook-dialog";
import {
  useCreateNotebook,
  useDeleteNotebook,
  useNotebooks,
  useRenameNotebook,
} from "@/features/notebooks/hooks";
import { useUiStore } from "@/stores/ui-store";
import type { NotebookListItemDto } from "@/types/api";

export function NotebookRail() {
  const { data: notebooks, isPending, isError, refetch } = useNotebooks();
  const { activeNotebookId, setActiveNotebook } = useUiStore();
  const router = useRouter();

  const create = useCreateNotebook();
  const rename = useRenameNotebook();
  const remove = useDeleteNotebook();

  const [pendingDelete, setPendingDelete] =
    useState<NotebookListItemDto | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold">Notebooks</h2>

        <div className="flex items-center gap-1.5">
          {/* The count is a locator, not a heading, so it is mono and sits with
              the control rather than with the title. */}
          {notebooks && notebooks.length > 0 && (
            <span className="text-muted-foreground font-mono text-[0.7rem] tabular-nums">
              {notebooks.length}
            </span>
          )}
          <CreateNotebookDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New notebook"
                title="New notebook"
              >
                <Plus className="size-4" />
              </Button>
            }
            onCreate={(name) => create.mutate(name)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {isPending && (
          // FR-8.2: the skeleton occupies the same height as a real row, down to
          // the two text lines and the gap between them, so the list does not
          // jump when data arrives.
          <ul className="space-y-0.5 px-2" aria-busy="true" aria-hidden>
            {[0, 1, 2, 3].map((row) => (
              <li key={row} className="flex flex-col gap-0.5 px-2 py-2">
                <span className="flex h-5 items-center">
                  <Skeleton className="h-3.5 w-32" />
                </span>
                <span className="flex h-4 items-center">
                  <Skeleton className="h-2.5 w-20" />
                </span>
              </li>
            ))}
          </ul>
        )}

        {isError && (
          <div className="px-4 py-6 text-center">
            <AlertCircle className="text-stamp mx-auto size-5" />
            <p className="text-muted-foreground mt-2 text-sm">
              Could not load your notebooks.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {notebooks && notebooks.length === 0 && (
          <p className="text-muted-foreground px-4 py-6 font-serif text-sm leading-relaxed">
            No notebooks yet. Each one holds its own sources, and answers only
            from them.
          </p>
        )}

        {notebooks && notebooks.length > 0 && (
          <ul className="space-y-0.5 px-2" aria-label="Your notebooks">
            {notebooks.map((notebook) => (
              <NotebookRow
                key={notebook.id}
                notebook={notebook}
                active={notebook.id === activeNotebookId}
                onSelect={() => router.push(`/app/${notebook.id}`)}
                onRename={(name) => rename.mutate({ id: notebook.id, name })}
                onDelete={() => setPendingDelete(notebook)}
              />
            ))}
          </ul>
        )}
      </div>

      <DeleteNotebookDialog
        notebook={pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.id === activeNotebookId) setActiveNotebook(null);
          remove.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
