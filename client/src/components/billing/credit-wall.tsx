"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { credits, resetsIn } from "@/features/billing/format";
import { useBillingState } from "@/features/billing/hooks";
import { useUiStore } from "@/stores/ui-store";

/**
 * What a refusal looks like when it is about money rather than about the answer.
 *
 * The distinction the two cases make is the whole point. Running out of credits
 * is temporary and has two remedies — wait, or upgrade. An action that is not on
 * the plan at all has one, and telling somebody to "wait for the reset" when no
 * reset will ever unlock it would be a lie the interface tells cheerfully.
 *
 * The refusal arrives from the server carrying the numbers, so this never
 * recomputes a balance or a price and cannot contradict what was actually
 * charged.
 */
export function CreditWall() {
  const { data: state } = useBillingState();
  const refusal = useUiStore((store) => store.refusal);
  const setRefusal = useUiStore((store) => store.setRefusal);

  if (!refusal) return null;

  const planBound = refusal.kind === "not-on-plan";
  const onClose = () => setRefusal(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>
          {planBound ? "Not on your plan" : "Out of credits"}
        </DialogTitle>

        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {refusal.message}
        </p>

        {!planBound && state && (
          <p className="text-muted-foreground mt-3 text-sm">
            You have {credits(state.balance)} left on {state.plan.name}, and it{" "}
            {resetsIn(state.periodEnd)}.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button render={<Link href="/pricing" />}>See plans</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
