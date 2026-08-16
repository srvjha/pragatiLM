import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { paymentEvents, subscriptions } from "@/db/schema";
import { isKnownPlan } from "@/billing/plans";
import { cancelSubscription, PRODUCT_TAG, toDate } from "@/billing/razorpay";
import { entitlementFor } from "./entitlements.service";
import { badRequest } from "@/lib/errors";
import { childLogger } from "@/lib/logger";
import type { SubscriptionStatus } from "@/db/schema";

const log = childLogger("billing:subscription");

/**
 * What a Razorpay webhook does to a subscription.
 *
 * Two rules run through all of it.
 *
 * First, the webhook is the only thing that grants a plan. The browser reporting
 * a successful checkout is a claim by an untrusted party; the signed webhook is
 * the payment provider's own word.
 *
 * Second, every handler is idempotent. Razorpay retries until it gets a 2xx, so
 * a handler that granted a period on each delivery would hand out several. The
 * event row's unique index catches the redelivery before any handler runs, and
 * the credit grant is idempotent underneath that anyway.
 */
export type WebhookOutcome = "handled" | "duplicate" | "ignored";

type RazorpayEvent = {
  event?: string;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        plan_id?: string;
        current_start?: number | null;
        current_end?: number | null;
        notes?: Record<string, string>;
      };
    };
  };
};

/**
 * Records the event before acting on it.
 *
 * Storing first means a crash halfway through a handler leaves a row with a null
 * `processedAt` — visible, replayable, and a far better state than having acted
 * on something there is no record of. It is also the idempotency gate: the
 * unique index on (provider, event id) makes a redelivery a no-op.
 */
export async function recordEvent(
  providerEventId: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  const written = await db
    .insert(paymentEvents)
    .values({
      provider: "razorpay",
      providerEventId,
      eventType,
      payload,
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });

  return written.length > 0;
}

async function markProcessed(providerEventId: string): Promise<void> {
  await db
    .update(paymentEvents)
    .set({ processedAt: new Date() })
    .where(eq(paymentEvents.providerEventId, providerEventId));
}

/**
 * Which of our plans a Razorpay plan id refers to.
 *
 * Read from the subscription's notes rather than mapped back from the plan id,
 * because the notes are what we set when we created it and they survive a plan
 * being re-created in the dashboard.
 */
function planCodeOf(entity: { notes?: Record<string, string> }): string | null {
  const code = entity.notes?.planCode;
  return code && isKnownPlan(code) ? code : null;
}

function userIdOf(entity: { notes?: Record<string, string> }): string | null {
  return entity.notes?.userId ?? null;
}

async function upsertSubscription(input: {
  userId: string;
  planCode: string;
  providerRef: string;
  status: SubscriptionStatus;
  periodStart: Date;
  periodEnd: Date;
}): Promise<void> {
  await db
    .insert(subscriptions)
    .values({
      userId: input.userId,
      planCode: input.planCode,
      status: input.status,
      provider: "razorpay",
      providerRef: input.providerRef,
      currentPeriodStart: input.periodStart,
      currentPeriodEnd: input.periodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        planCode: input.planCode,
        status: input.status,
        providerRef: input.providerRef,
        currentPeriodStart: input.periodStart,
        currentPeriodEnd: input.periodEnd,
        updatedAt: new Date(),
      },
    });
}

async function setStatus(providerRef: string, status: SubscriptionStatus): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(subscriptions.providerRef, providerRef));
}

/**
 * Asks Razorpay to stop billing this person at the end of the period they have
 * paid for.
 *
 * Nothing about their entitlements changes here, and that is the point: they
 * have paid for the rest of the month and keep it. The plan drops to free when
 * the `subscription.cancelled` webhook arrives at the end of the cycle, which
 * is the same path every other status change takes — so there is one place that
 * decides what somebody is on, rather than two that can disagree.
 */
export async function cancelForUser(userId: string): Promise<Date> {
  const subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const row = subscription[0];
  if (!row || !row.providerRef || row.status === "CANCELLED" || row.status === "EXPIRED") {
    throw badRequest("There is no active subscription to cancel.");
  }

  await cancelSubscription(row.providerRef);

  // Recorded locally so the interface can say "ends on the 14th" straight away
  // rather than waiting weeks for the webhook to make it true.
  await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: row.currentPeriodEnd, updatedAt: new Date() })
    .where(eq(subscriptions.id, row.id));

  log.info({ userId, endsAt: row.currentPeriodEnd }, "subscription will not renew");
  return row.currentPeriodEnd;
}

/**
 * Applies one verified webhook.
 *
 * The caller has already checked the signature. This decides what the event
 * means and leaves everything it does not recognise alone — Razorpay sends a lot
 * of events, and acting on an unrecognised one is worse than ignoring it.
 */
export async function applyWebhook(
  providerEventId: string,
  event: RazorpayEvent,
): Promise<WebhookOutcome> {
  const type = event.event ?? "";
  const entity = event.payload?.subscription?.entity;

  const fresh = await recordEvent(providerEventId, type, event);
  if (!fresh) {
    log.info({ providerEventId, type }, "webhook redelivered, already handled");
    return "duplicate";
  }

  if (!entity?.id) {
    await markProcessed(providerEventId);
    return "ignored";
  }

  // Another product on the same Razorpay account. Dropped quietly and at debug
  // level, because on a shared account this is the normal case rather than a
  // fault, and logging it as one would bury the events that are genuinely wrong.
  if (entity.notes?.product !== PRODUCT_TAG) {
    log.debug({ providerEventId, type }, "webhook belongs to another product on this account");
    await markProcessed(providerEventId);
    return "ignored";
  }

  const userId = userIdOf(entity);
  const planCode = planCodeOf(entity);
  const periodStart = toDate(entity.current_start);
  const periodEnd = toDate(entity.current_end);

  switch (type) {
    // Charged fires on the first payment and on every renewal, which is exactly
    // the moment a new period's credits should exist. Handling both with one
    // branch means a renewal cannot be forgotten.
    case "subscription.charged":
    case "subscription.activated": {
      if (!userId || !planCode || !periodStart || !periodEnd) {
        log.error({ providerEventId, type, userId, planCode }, "subscription event is unusable");
        await markProcessed(providerEventId);
        return "ignored";
      }

      await upsertSubscription({
        userId,
        planCode,
        providerRef: entity.id,
        status: "ACTIVE",
        periodStart,
        periodEnd,
      });

      // Materialises the new period's credits immediately rather than on their
      // next request, so the balance is right the moment they return from
      // checkout.
      await entitlementFor(userId);

      log.info({ userId, planCode, providerRef: entity.id }, "subscription is active");
      break;
    }

    // The mandate failed. Entitlements deliberately do not change here: the
    // period is still paid for, and locking somebody out mid-document over a
    // card that will probably retry is the wrong trade.
    case "subscription.pending":
    case "subscription.halted":
      await setStatus(entity.id, "PAST_DUE");
      log.warn({ providerRef: entity.id, type }, "subscription payment is failing");
      break;

    case "subscription.cancelled":
      await setStatus(entity.id, "CANCELLED");
      break;

    case "subscription.completed":
    case "subscription.expired":
      await setStatus(entity.id, "EXPIRED");
      break;

    default:
      await markProcessed(providerEventId);
      return "ignored";
  }

  await markProcessed(providerEventId);
  return "handled";
}
