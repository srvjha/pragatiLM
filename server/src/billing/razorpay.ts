import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { childLogger } from "@/lib/logger";
import { badRequest, internal } from "@/lib/errors";

const log = childLogger("billing:razorpay");

const API = "https://api.razorpay.com/v1";

/**
 * Razorpay over its REST API rather than the official SDK.
 *
 * The SDK is a thin wrapper over these three calls plus an HMAC comparison, and
 * this file is shorter than the dependency's changelog. It also keeps the one
 * security-critical part — signature verification — visible in the repository
 * rather than behind a version bump.
 */
export function isBillingConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/** The public key the browser needs to open checkout. Never the secret. */
export function publishableKey(): string | null {
  return env.RAZORPAY_KEY_ID ?? null;
}

/** The Razorpay plan id backing one of our plan codes, if it has one. */
export function razorpayPlanId(planCode: string): string | null {
  switch (planCode) {
    case "plus":
      return env.RAZORPAY_PLAN_PLUS ?? null;
    case "pro":
      return env.RAZORPAY_PLAN_PRO ?? null;
    default:
      return null;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isBillingConfigured()) {
    throw internal("Razorpay is not configured");
  }

  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");

  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    // Razorpay's message is written for a developer and often names the exact
    // field, so it is worth logging. It is not returned to the browser, which
    // gets a generic failure: it can contain account level detail.
    log.error({ status: response.status, body, path }, "razorpay call failed");
    throw internal("The payment provider rejected the request");
  }

  return body as T;
}

/**
 * Stamped into every subscription's notes, and checked on every webhook.
 *
 * One Razorpay account can serve several products, and its webhooks are filtered
 * by event type rather than by which product the payment belongs to. So a
 * webhook endpoint here receives `subscription.charged` for *every* product on
 * the account, not only this one.
 *
 * Without this tag those foreign events look like malformed events for us: they
 * would log an error each time, and — if another product happened to use the
 * same note keys and a plan code we recognise — would try to write a
 * subscription for a user id that does not exist here, fail the foreign key,
 * return 500, and be retried by Razorpay indefinitely.
 */
export const PRODUCT_TAG = "pragatilm";

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  short_url?: string;
};

/**
 * Creates a subscription in Razorpay and returns it unstarted.
 *
 * Nothing is granted here. The subscription becomes real when the webhook says
 * it was charged, because that is the only report of payment that did not come
 * from the browser.
 */
export function createSubscription(
  planId: string,
  notes: Record<string, string>,
): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
      // Razorpay requires a bounded count. Twelve months, after which the
      // customer re-subscribes; an effectively infinite value would make the
      // mandate harder to reason about, not easier.
      total_count: 12,
      customer_notify: 1,
      notes,
    }),
  });
}

export function fetchSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>(`/subscriptions/${subscriptionId}`);
}

export function cancelSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>(`/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    // Cancel at the end of the paid period rather than immediately: they have
    // paid for the rest of the month and should keep it.
    body: JSON.stringify({ cancel_at_cycle_end: 1 }),
  });
}

/**
 * Whether a webhook really came from Razorpay.
 *
 * The signature is an HMAC over the **raw** request body. Re-serialising the
 * parsed JSON would change key order and whitespace and never match, which is
 * why the webhook route is mounted with a raw body parser ahead of the JSON one.
 *
 * Compared with timingSafeEqual rather than `===`. A string comparison exits at
 * the first differing byte, which leaks how much of a guess was right, and a
 * signature check is exactly the place that matters.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    log.error("a webhook arrived but RAZORPAY_WEBHOOK_SECRET is not set, so it cannot be trusted");
    return false;
  }

  if (!signature) return false;

  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest();

  let received: Buffer;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return false;
  }

  // timingSafeEqual throws on a length mismatch, which would itself be a
  // disclosure if it escaped as a different status code.
  if (received.length !== expected.length) return false;

  return timingSafeEqual(expected, received);
}

/** Razorpay sends unix seconds; the rest of this codebase deals in Date. */
export function toDate(seconds: number | null | undefined): Date | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

export function requirePlanId(planCode: string): string {
  const id = razorpayPlanId(planCode);
  if (!id) throw badRequest(`Plan "${planCode}" cannot be subscribed to`);
  return id;
}
