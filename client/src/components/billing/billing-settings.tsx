"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
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
import {
  useBillingState,
  useCancelSubscription,
} from "@/features/billing/hooks";
import { credits, planLimits, rupees } from "@/features/billing/format";

const onDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * What you are on, what you have left, and how to stop paying.
 *
 * The last of those is deliberately not buried. A subscription that is hard to
 * leave is a subscription people are wary of starting, and the cancel path being
 * visible costs nothing when the product is worth keeping.
 */
export function BillingSettings() {
  const { data, isPending } = useBillingState();
  const cancel = useCancelSubscription();
  const [confirming, setConfirming] = useState(false);

  if (isPending || !data) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  const { plan, subscription, balance } = data;
  const paid = plan.pricePaise > 0;
  const ending = subscription?.cancelAtPeriodEnd ?? null;
  const spent = Math.max(0, plan.monthlyCredits - balance);

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-xl border p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">{plan.name}</h2>
          <p className="text-muted-foreground text-sm">
            {paid ? `${rupees(plan.pricePaise)} / month` : "Free"}
          </p>
        </div>

        {subscription?.status === "PAST_DUE" && (
          <p className="text-destructive mt-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {/* Nothing has been taken away, and saying so matters: the fix is a
                card, not a panic about lost documents. */}
            Your last payment did not go through. Your plan keeps working until{" "}
            {onDate(data.periodEnd)}.
          </p>
        )}

        <p className="text-muted-foreground mt-3 text-sm">
          {ending
            ? `Ends on ${onDate(ending)}. You keep everything until then.`
            : paid
              ? `Renews on ${onDate(data.periodEnd)}.`
              : `Your credits reset on ${onDate(data.periodEnd)}.`}
        </p>

        <ul className="text-muted-foreground mt-4 space-y-1 text-sm">
          {planLimits(plan).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border p-6">
        <h2 className="font-medium">This period</h2>
        <p className="mt-1 text-2xl font-medium tabular-nums">
          {credits(balance)}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {spent > 0
            ? `${credits(spent)} used of ${plan.monthlyCredits}. `
            : ""}
          Resets {onDate(data.periodEnd)}.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={paid ? "outline" : "default"}
          render={<Link href="/pricing" />}
        >
          {paid ? "Change plan" : "See plans"}
        </Button>

        {paid && !ending && (
          <Button
            variant="ghost"
            onClick={() => setConfirming(true)}
            disabled={cancel.isPending}
          >
            Cancel plan
          </Button>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop renewing {plan.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You keep {plan.name} and everything in your notebooks until{" "}
              {onDate(data.periodEnd)}. Nothing is deleted, and you can start
              again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                cancel.mutate();
              }}
            >
              Stop renewing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
