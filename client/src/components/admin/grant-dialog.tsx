"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGrantCredits } from "@/features/admin/hooks";
import type { AdminUserRow } from "@/features/admin/api";

/**
 * Moving credits onto an account, and saying why.
 *
 * The note is required by the server and required here, for the same reason:
 * the grant writes an audit row before it writes the ledger row, and a log line
 * reading "+200 credits" with no reason is a record that somebody did something
 * rather than a record of what happened.
 *
 * The bounds are the server's, restated rather than assumed. A field that let
 * you type a million and then failed would have taught you the limit by
 * refusing you; saying it up front is cheaper.
 *
 * The caller keys this on the account, so opening a second one mounts a fresh
 * form. Resetting the fields in an effect instead would leave the amount typed
 * for one person sitting in the box over somebody else's name for a render,
 * which is exactly the carryover that puts credits on the wrong account.
 */

const LIMIT = 1000;
const NOTE_LIMIT = 200;

export function GrantDialog({
  user,
  onClose,
}: {
  /** The account to move credits for, or null when the dialog is closed. */
  user: AdminUserRow | null;
  onClose: () => void;
}) {
  const [credits, setCredits] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const grant = useGrantCredits();

  if (!user) return null;

  const amount = Number.parseInt(credits, 10);
  const amountError = amountProblem(credits, amount);
  const noteError =
    note.trim().length === 0
      ? "Write a note. It is recorded in the audit log."
      : null;
  const blocked = amountError !== null || noteError !== null;

  function submit() {
    setTouched(true);
    if (blocked || !user) return;

    grant.mutate(
      { userId: user.id, credits: amount, note: note.trim() },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Grant credits</DialogTitle>
          <DialogDescription>
            {user.name || user.email} will see the change in their balance
            immediately. Your email address is written to the audit log beside
            it.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs">
          <p className="font-medium">{user.name || "No name"}</p>
          <p className="text-muted-foreground font-mono">{user.email}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="grant-amount" className="text-sm font-medium">
            Amount
          </label>
          <Input
            autoFocus
            id="grant-amount"
            type="number"
            inputMode="numeric"
            min={-LIMIT}
            max={LIMIT}
            step={1}
            value={credits}
            placeholder="50"
            className="h-9"
            aria-invalid={touched && amountError !== null}
            aria-describedby="grant-amount-help"
            onChange={(event) => setCredits(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          <p id="grant-amount-help" className="text-xs">
            {touched && amountError ? (
              <span className="text-stamp">{amountError}</span>
            ) : (
              <span className="text-muted-foreground">
                Between {-LIMIT} and {LIMIT}. A negative amount takes credits
                back.
              </span>
            )}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="grant-note" className="text-sm font-medium">
            Note
          </label>
          <Textarea
            id="grant-note"
            value={note}
            maxLength={NOTE_LIMIT}
            rows={2}
            placeholder="Refund for the failed podcast run on 11 Sep"
            className="min-h-[3.5rem] text-sm"
            aria-invalid={touched && noteError !== null}
            aria-describedby="grant-note-help"
            onChange={(event) => setNote(event.target.value)}
          />
          <p
            id="grant-note-help"
            className="flex items-baseline justify-between gap-2 text-xs"
          >
            {touched && noteError ? (
              <span className="text-stamp">{noteError}</span>
            ) : (
              <span className="text-muted-foreground">
                Say what this is for. It cannot be edited later.
              </span>
            )}
            <span className="text-muted-foreground tabular shrink-0 font-mono">
              {note.length}/{NOTE_LIMIT}
            </span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={grant.isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={grant.isPending || (touched && blocked)}
          >
            {grant.isPending ? "Applying" : actionLabel(amount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The button says which of the two things it is about to do. "Apply" beside a
 * number field that accepts negatives is the wrong label half the time.
 */
function actionLabel(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "Grant credits";
  return amount > 0
    ? `Grant ${amount} credits`
    : `Take back ${Math.abs(amount)} credits`;
}

function amountProblem(raw: string, amount: number): string | null {
  if (raw.trim().length === 0 || Number.isNaN(amount)) {
    return "Enter a whole number of credits.";
  }
  if (amount === 0) return "Zero is not a grant.";
  if (Math.abs(amount) > LIMIT) {
    return `The most you can move at once is ${LIMIT} credits.`;
  }
  return null;
}
