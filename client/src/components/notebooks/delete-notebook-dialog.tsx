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
          <AlertDialogTitle>Delete {notebook?.name}?</AlertDialogTitle>
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
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Delete notebook
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
