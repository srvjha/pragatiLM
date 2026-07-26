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
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">Notebooks</h2>
        <CreateNotebookDialog
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="New notebook"
            >
              <Plus className="size-4" />
            </Button>
          }
          onCreate={(name) => create.mutate(name)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {isPending && (
          // FR-8.2: the skeleton occupies the same height as a real row, so the
          // list does not jump when data arrives.
          <ul className="space-y-1 px-2" aria-hidden>
            {[0, 1, 2].map((row) => (
              <li key={row} className="space-y-1.5 px-2 py-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </li>
            ))}
          </ul>
        )}

        {isError && (
          <div className="px-4 py-6 text-center">
            <AlertCircle className="text-muted-foreground mx-auto size-5" />
            <p className="text-muted-foreground mt-2 text-sm">
              Could not load your notebooks.
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

        {notebooks && notebooks.length === 0 && (
          <p className="text-muted-foreground px-4 py-6 text-sm">
            No notebooks yet. Create one to get started.
          </p>
        )}

        {notebooks && notebooks.length > 0 && (
          <ul className="space-y-0.5 px-2">
            {notebooks.map((notebook) => (
              <NotebookRow
                key={notebook.id}
                notebook={notebook}
                active={notebook.id === activeNotebookId}
                onSelect={() => router.push(`/notebook/${notebook.id}`)}
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
