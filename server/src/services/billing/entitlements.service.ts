import * as repo from "@/db/repositories/billing.repository";
import { creditsFor, type BillableAction, type CreditCharge } from "@/billing/costs";
import { FREE_PLAN, planFor, type Plan } from "@/billing/plans";
import { childLogger } from "@/lib/logger";
import type { Subscription } from "@/db/schema";

const log = childLogger("billing:entitlements");

/**
 * The single answer to "may this person do this, and what did it cost them".
 *
 * One module rather than checks spread across controllers, because the failure
 * mode of a quota system is not being too strict — it is one route that forgot
 * to ask.
 */
export type Entitlement = {
  plan: Plan;
  periodStart: Date;
  periodEnd: Date;
  balance: number;
};

/**
 * A subscription is only worth its plan while it is being paid for.
 *
 * PAST_DUE deliberately still counts: a card that failed this morning should not
 * lock somebody out of a document they are in the middle of reading. The
 * downgrade happens when the period actually ends.
 */
function planOf(subscription: Subscription | undefined): Plan {
  if (!subscription) return FREE_PLAN;
  if (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") {
    return planFor(subscription.planCode);
  }
  return FREE_PLAN;
}

/**
 * The period a charge belongs to.
 *
 * A subscriber's period follows their billing dates, so credits arrive when they
 * pay rather than on the first of the month. Everyone else gets the calendar
 * month in UTC — chosen over "thirty days from signup" because it needs no
 * stored state, and because a free tier that resets on a predictable day is
 * easier to explain than one that resets on a date nobody remembers.
 */
function periodOf(subscription: Subscription | undefined, now: Date): { start: Date; end: Date } {
  if (
    subscription &&
    (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") &&
    subscription.currentPeriodEnd > now
  ) {
    return { start: subscription.currentPeriodStart, end: subscription.currentPeriodEnd };
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

/**
 * Resolves the plan and period, granting the period's credits if that has not
 * happened yet.
 *
 * The grant is lazy rather than scheduled: no cron, nothing to miss, and a user
 * who does not come back this month costs nothing to keep. It is idempotent
 * through the ledger's unique index, so calling this on every request is safe
 * and the second call writes nothing.
 */
export async function entitlementFor(userId: string, now = new Date()): Promise<Entitlement> {
  const subscription = await repo.findSubscription(userId);
  const plan = planOf(subscription);
  const period = periodOf(subscription, now);

  const granted = await repo.appendLedgerEntry({
    userId,
    periodStart: period.start,
    delta: plan.limits.monthlyCredits,
    reason: "GRANT",
    refType: "period",
    refId: period.start.toISOString(),
    meta: { planCode: plan.code },
  });

  if (granted) {
    log.info(
      { userId, plan: plan.code, credits: plan.limits.monthlyCredits, period: period.start },
      "granted the period's credits",
    );
  }

  return {
    plan,
    periodStart: period.start,
    periodEnd: period.end,
    balance: await repo.balanceForPeriod(userId, period.start),
  };
}

export type ChargeResult =
  | { ok: true; balance: number; charged: number }
  | { ok: false; reason: "insufficient-credits"; balance: number; needed: number; plan: Plan }
  | { ok: false; reason: "not-on-plan"; balance: number; needed: number; plan: Plan };

export type ChargeOptions = {
  /**
   * How many of the action this covers. One upload request can carry ten PDFs,
   * and charging it as one source would be a tenfold under-charge.
   */
  units?: number;
  now?: Date;
};

/**
 * Charges for an action, or explains why it cannot.
 *
 * `refId` is the identity of the work being paid for — a message id, a podcast
 * id — and it is what makes this safe to call twice. A retried ingestion job or
 * a re-delivered request charges once, because the ledger's unique index says
 * so.
 *
 * Charging happens before the work, so an expensive action cannot be started by
 * somebody who cannot afford it. Work that then fails is refunded rather than
 * never charged, because the alternative is trusting every failure path to
 * remember.
 */
export async function charge(
  userId: string,
  action: BillableAction,
  refId: string,
  options: ChargeOptions = {},
): Promise<ChargeResult> {
  const now = options.now ?? new Date();
  const units = Math.max(1, Math.trunc(options.units ?? 1));

  const entitlement = await entitlementFor(userId, now);
  const cost = creditsFor(action) * units;

  // A gate that is not about the balance at all: no number of credits buys a
  // podcast on a plan that does not include them.
  if (action === "podcast" && !entitlement.plan.limits.podcasts) {
    return {
      ok: false,
      reason: "not-on-plan",
      balance: entitlement.balance,
      needed: cost,
      plan: entitlement.plan,
    };
  }

  const spend = await repo.spendCredits(
    {
      userId,
      periodStart: entitlement.periodStart,
      refType: action,
      refId,
      meta: { planCode: entitlement.plan.code, units },
    },
    cost,
  );

  if (spend.outcome === "insufficient") {
    return {
      ok: false,
      reason: "insufficient-credits",
      balance: spend.balance,
      needed: cost,
      plan: entitlement.plan,
    };
  }

  return {
    ok: true,
    balance: spend.balance,
    charged: spend.outcome === "spent" ? cost : 0,
  };
}

/**
 * Returns credits for work that was charged for and then failed.
 *
 * Idempotent on the same grounds as the charge: a job that fails three times
 * refunds once. A refund with no matching charge is harmless — it writes a row
 * and the sum is what it is — but it is logged, because it means a caller is
 * refunding something it never paid for.
 */
export async function refund(
  userId: string,
  action: BillableAction,
  refId: string,
  options: ChargeOptions = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const units = Math.max(1, Math.trunc(options.units ?? 1));

  const entitlement = await entitlementFor(userId, now);

  const written = await repo.appendLedgerEntry({
    userId,
    periodStart: entitlement.periodStart,
    delta: creditsFor(action) * units,
    reason: "REFUND",
    refType: action,
    refId,
    meta: { planCode: entitlement.plan.code, units },
  });

  if (written) {
    log.info({ userId, action, refId, units }, "refunded credits for work that failed");
  }
}

/**
 * Refunds a job's charge, if it carried one.
 *
 * Every worker's failure path calls this, so it is written to be impossible to
 * get wrong from a `failed` handler: a missing charge is a no-op rather than a
 * throw, and a failure here is logged rather than propagated. A refund that
 * throws inside an error handler would replace a recoverable problem with an
 * unhandled rejection, and the user would lose the credit either way.
 *
 * Jobs enqueued before this field existed simply have no charge to return, which
 * is why the no-op case is silent rather than a warning.
 *
 * The credit lands in whichever period is current when the job fails, not the one
 * that was charged. A podcast charged on the 31st that fails on the 1st therefore
 * refunds into the new period — which is the useful behaviour, since a credit
 * returned to a period that has already reset would be worth nothing.
 */
export async function refundCharge(
  charge: CreditCharge | undefined,
  action: BillableAction,
): Promise<void> {
  if (!charge?.userId || !charge.ref) return;

  try {
    await refund(charge.userId, action, charge.ref);
  } catch (error) {
    log.error({ err: error, action, ref: charge.ref }, "could not refund a failed job");
  }
}
