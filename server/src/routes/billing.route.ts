import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireSession, requireUser } from "@/middleware/session";
import { validate } from "@/middleware/validate";
import { entitlementFor } from "@/services/billing/entitlements.service";
import { applyWebhook, cancelForUser } from "@/services/billing/subscription.service";
import {
  createSubscription,
  isBillingConfigured,
  PRODUCT_TAG,
  publishableKey,
  requirePlanId,
  verifyWebhookSignature,
} from "@/billing/razorpay";
import { paidPlans, PLANS } from "@/billing/plans";
import { CREDIT_COSTS } from "@/billing/costs";
import { badRequest } from "@/lib/errors";
import { childLogger } from "@/lib/logger";
import { listPayments } from "@/db/repositories/billing.repository";
import type { BillingStateDto, PaymentDto, PlanDto } from "@/types/api";

const log = childLogger("billing:route");

export const billingRouter: Router = Router();

function toPlanDto(plan: (typeof PLANS)[number]): PlanDto {
  return {
    code: plan.code,
    name: plan.name,
    blurb: plan.blurb,
    pricePaise: plan.pricePaise,
    monthlyCredits: plan.limits.monthlyCredits,
    notebooks: plan.limits.notebooks,
    sourcesPerNotebook: plan.limits.sourcesPerNotebook,
    storageBytes: plan.limits.storageBytes,
    podcasts: plan.limits.podcasts,
  };
}

/**
 * The pricing page's data. Unauthenticated, because a price is public and a
 * signed out visitor is exactly who needs to read it.
 *
 * `creditCosts` ships too, so the page can say what a credit buys without the
 * numbers being written down a second time in the client and drifting.
 */
billingRouter.get("/billing/plans", (_req, res) => {
  res.json({
    data: {
      plans: PLANS.map(toPlanDto),
      creditCosts: CREDIT_COSTS,
      billingEnabled: isBillingConfigured(),
    },
  });
});

/** What this person is on, what they have left, and when it resets. */
billingRouter.get(
  "/billing/me",
  requireSession,
  (req: Request, res: Response, next: NextFunction) => {
    entitlementFor(requireUser(req).id)
      .then((entitlement) => {
        const body: BillingStateDto = {
          plan: toPlanDto(entitlement.plan),
          balance: entitlement.balance,
          periodStart: entitlement.periodStart.toISOString(),
          periodEnd: entitlement.periodEnd.toISOString(),
          // Only the two fields the interface needs. The provider reference and
          // the internal id are of no use to a browser and are not its business.
          subscription: entitlement.subscription
            ? {
                status: entitlement.subscription.status,
                cancelAtPeriodEnd:
                  entitlement.subscription.cancelAtPeriodEnd?.toISOString() ?? null,
              }
            : null,
        };
        res.json({ data: body });
      })
      .catch(next);
  },
);

/**
 * Stops the subscription renewing.
 *
 * A POST rather than a DELETE, because nothing is deleted: the person keeps
 * everything they paid for until the period runs out, and the row stays as the
 * record of what they were on.
 */
billingRouter.post(
  "/billing/cancel",
  requireSession,
  (req: Request, res: Response, next: NextFunction) => {
    cancelForUser(requireUser(req).id)
      .then((endsAt) => res.json({ data: { endsAt: endsAt.toISOString() } }))
      .catch(next);
  },
);

/**
 * Receipts. Read from the payments table rather than the raw webhook log, which
 * exists for disputes and would mean trusting the shape of somebody else's JSON.
 */
billingRouter.get(
  "/billing/invoices",
  requireSession,
  (req: Request, res: Response, next: NextFunction) => {
    listPayments(requireUser(req).id)
      .then((rows) => {
        const data: PaymentDto[] = rows.map((row) => ({
          id: row.id,
          amountPaise: row.amountPaise,
          currency: row.currency,
          planCode: row.planCode,
          paidAt: row.paidAt.toISOString(),
        }));
        res.json({ data });
      })
      .catch(next);
  },
);

const checkoutBody = z.object({
  planCode: z.string().trim().min(1).max(40),
});

/**
 * Starts a subscription and hands the browser what it needs to open checkout.
 *
 * Nothing is granted here, deliberately. This route's output is a claim that a
 * payment is *about* to happen; the plan is only applied when the signed webhook
 * confirms it did. A user who closes the tab mid-payment therefore gets nothing,
 * which is the correct outcome and the reason this cannot be spoofed.
 */
billingRouter.post(
  "/billing/checkout",
  requireSession,
  validate({ body: checkoutBody }),
  (req: Request, res: Response, next: NextFunction) => {
    const user = requireUser(req);
    const { planCode } = req.body as z.infer<typeof checkoutBody>;

    if (!isBillingConfigured()) {
      next(badRequest("Payments are not set up yet."));
      return;
    }

    if (!paidPlans().some((plan) => plan.code === planCode)) {
      next(badRequest(`Plan "${planCode}" cannot be subscribed to`));
      return;
    }

    // The notes come back on every webhook for this subscription, and are how a
    // payment is matched to an account. Razorpay has no idea who our users are.
    Promise.resolve(requirePlanId(planCode))
      .then((planId) =>
        createSubscription(planId, { product: PRODUCT_TAG, userId: user.id, planCode }),
      )
      .then((subscription) => {
        log.info({ userId: user.id, planCode, subscriptionId: subscription.id }, "checkout opened");
        res.status(201).json({
          data: {
            subscriptionId: subscription.id,
            keyId: publishableKey(),
            shortUrl: subscription.short_url ?? null,
          },
        });
      })
      .catch(next);
  },
);

/**
 * Razorpay's webhook.
 *
 * Mounted in app.ts with a raw body parser, ahead of the JSON one: the signature
 * is an HMAC over the exact bytes sent, and re-serialising parsed JSON would
 * change key order and whitespace and never match.
 *
 * A bad signature is a 400 and nothing else — no detail, and no clue about which
 * part failed. Anyone on the internet can POST here.
 */
export function handleWebhook(req: Request, res: Response, next: NextFunction): void {
  const raw = req.body as Buffer;
  const signature = req.header("x-razorpay-signature");

  if (!Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, signature)) {
    log.warn({ ip: req.ip }, "rejected a webhook with a bad signature");
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Invalid signature" } });
    return;
  }

  let event: unknown;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Invalid payload" } });
    return;
  }

  // Razorpay's own id for this delivery, which is what makes a retry a no-op.
  // Falling back to the signature is not arbitrary: it is unique per payload and
  // per delivery, so it still collapses genuine redeliveries.
  const eventId = req.header("x-razorpay-event-id") ?? signature ?? "";

  applyWebhook(eventId, event as Parameters<typeof applyWebhook>[1])
    .then((outcome) => {
      // Always 200 once the signature is good, including for events we ignore.
      // A non-2xx makes Razorpay retry, and retrying something deliberately
      // ignored achieves nothing but noise.
      res.status(200).json({ data: { outcome } });
    })
    .catch(next);
}
