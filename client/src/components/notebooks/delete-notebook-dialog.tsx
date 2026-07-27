"use client";

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
import type { NotebookListItemDto } from "@/types/api";

type Props = {
  notebook: NotebookListItemDto | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeleteNotebookDialog({
  notebook,
  onOpenChange,
  onConfirm,
}: Props) {
  return (
    <AlertDialog open={notebook !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {/* Notebook names run to 80 characters, and a title that wraps to
              three lines pushes the consequence out of the first glance, which
              on a destructive dialog is the one thing that must not happen. */}
          <AlertDialogTitle className="line-clamp-2 break-words">
            Delete {notebook?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {/* The PRD requires the warning to name what goes with it, because
                this cascade is not recoverable. */}
            This removes its {notebook?.sourceCount ?? 0}{" "}
            {notebook?.sourceCount === 1 ? "source" : "sources"}, every chat and
            citation, and any generated roadmap or audio. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-stamp text-stamp-foreground hover:bg-stamp/90"
          >
            Delete notebook
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
