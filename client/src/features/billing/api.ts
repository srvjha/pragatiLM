import { apiFetch } from "@/lib/api-client";
import type { BillingStateDto, PlanCatalogueDto } from "@/types/api";

export function fetchPlans(): Promise<PlanCatalogueDto> {
  return apiFetch<PlanCatalogueDto>("/billing/plans");
}

export function fetchBillingState(): Promise<BillingStateDto> {
  return apiFetch<BillingStateDto>("/billing/me");
}

export type CheckoutSession = {
  subscriptionId: string;
  keyId: string | null;
  /** Razorpay's own hosted page, which is where the browser is sent. */
  shortUrl: string | null;
};

export function startCheckout(planCode: string): Promise<CheckoutSession> {
  return apiFetch<CheckoutSession>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ planCode }),
  });
}

export function cancelSubscription(): Promise<{ endsAt: string }> {
  return apiFetch<{ endsAt: string }>("/billing/cancel", { method: "POST" });
}
