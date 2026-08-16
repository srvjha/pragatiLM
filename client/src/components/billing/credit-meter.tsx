"use client";

import Link from "next/link";
import { useBillingState } from "@/features/billing/hooks";
import { credits, resetsIn } from "@/features/billing/format";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * What is left this period, in the header.
 *
 * Shown before it runs out rather than only when it does. The failure this
 * prevents is not a technical one: it is uploading a document, asking the
 * question you came to ask, and being refused with no warning that a limit was
 * approaching.
 *
 * Deliberately not a progress bar. A bar invites reading the *proportion* spent,
 * and the number that decides whether you can ask another question is the count
 * remaining — a bar at 20% means nothing without knowing what it started at.
 */
export function CreditMeter() {
  const { data, isPending } = useBillingState();

  // Silent while loading and silent on failure. This is ambient information, and
  // an error toast about a balance would interrupt work it does not block.
  if (isPending || !data) return null;

  const { balance, plan } = data;
  const low = balance <= Math.max(3, Math.round(plan.monthlyCredits * 0.1));
  const empty = balance <= 0;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href="/pricing"
            className={[
              "focus-visible:ring-ring/50 hover:bg-muted hidden h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium tabular-nums transition-colors focus-visible:ring-3 focus-visible:outline-none sm:flex",
              // The palette has no accent hue and reserves the marker for spans
              // the product actually matched, so a warning here is weight rather
              // than colour. Empty is the exception: the stamp means the product
              // is about to decline, which is exactly what an empty balance does.
              empty
                ? "border-destructive/40 text-destructive"
                : low
                  ? "text-foreground border-border"
                  : "text-muted-foreground border-transparent",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "size-1.5 rounded-full",
                empty
                  ? "bg-destructive"
                  : low
                    ? "bg-foreground/60"
                    : "bg-muted-foreground/40",
              ].join(" ")}
            />
            {balance.toLocaleString("en-IN")}
            <span className="text-muted-foreground/70 font-normal">left</span>
          </Link>
        }
      />
      <TooltipContent>
        {credits(balance)} left on {plan.name}, {resetsIn(data.periodEnd)}
      </TooltipContent>
    </Tooltip>
  );
}
