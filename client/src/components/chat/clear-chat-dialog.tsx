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

/**
 * Confirmation before clearing a transcript.
 *
 * It names the number of messages going, because "clear chat" reads as tidying
 * up until it turns out to have thrown away an hour of questions. Sources are
 * named too, since they are the expensive thing and they are explicitly not
 * touched.
 */
export function ClearChatDialog({
  open,
  messageCount,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  messageCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear this chat?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes {messageCount}{" "}
            {messageCount === 1 ? "message" : "messages"} and their citations.
            Your sources stay exactly as they are, and you can carry on asking
            straight away. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-stamp text-stamp-foreground hover:bg-stamp/90"
          >
            Clear chat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
