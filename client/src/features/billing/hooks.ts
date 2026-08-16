"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "./api";
import { queryKeys } from "@/lib/query-keys";
import { ApiError } from "@/lib/api-client";
import type { CreditErrorDetails } from "@/types/api";

/** Prices and limits change only on a deploy, so this never needs refetching. */
export function usePlans() {
  return useQuery({
    queryKey: queryKeys.billing.plans(),
    queryFn: api.fetchPlans,
    staleTime: Infinity,
  });
}

/**
 * The balance, which every charged action moves.
 *
 * Not polled. Nothing else spends this person's credits, so the only things that
 * change it are actions taken here — and those invalidate it directly through
 * `useRefreshBalance`. Polling would spend a request a minute to learn nothing.
 */
export function useBillingState() {
  return useQuery({
    queryKey: queryKeys.billing.me(),
    queryFn: api.fetchBillingState,
  });
}

/**
 * Call after anything that spends credits.
 *
 * Deliberately a refetch rather than an optimistic decrement: the server is the
 * only thing that knows what an action actually cost — an upload of five PDFs
 * costs five, a failed job refunds — and a meter that disagreed with the balance
 * would undermine the one number people check before paying.
 */
export function useRefreshBalance() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: queryKeys.billing.me() });
}

/**
 * Whether an error came from the credit gate, and what it said.
 *
 * The two codes mean different things to the reader: INSUFFICIENT_CREDITS is
 * "wait for the reset or upgrade", PLAN_REQUIRED is "no balance will ever buy
 * this". Callers render different prompts, so this keeps them apart.
 */
export type CreditRefusal = {
  kind: "insufficient" | "not-on-plan";
  message: string;
  details: CreditErrorDetails | null;
};

export function creditRefusal(error: unknown): CreditRefusal | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code !== "INSUFFICIENT_CREDITS" && error.code !== "PLAN_REQUIRED")
    return null;

  return {
    kind: error.code === "PLAN_REQUIRED" ? "not-on-plan" : "insufficient",
    message: error.message,
    details: (error.details as CreditErrorDetails | undefined) ?? null,
  };
}

export function useStartCheckout() {
  return useMutation({
    mutationFn: (planCode: string) => api.startCheckout(planCode),

    onSuccess: (session) => {
      if (!session.shortUrl) {
        toast.error("Checkout could not be opened. Try again in a moment.");
        return;
      }

      // Razorpay's hosted page rather than their embedded widget: it needs no
      // third party script on our origin, and the plan is granted by the signed
      // webhook rather than by anything this browser reports back.
      window.location.href = session.shortUrl;
    },

    onError: (error: unknown) => {
      toast.error(
        error instanceof ApiError && error.status < 500
          ? error.message
          : "Could not start checkout. Try again in a moment.",
      );
    },
  });
}
