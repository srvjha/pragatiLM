import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "@/app";
import { db } from "@/db/client";
import { creditLedger, subscriptions } from "@/db/schema";
import {
  charge,
  entitlementFor,
  refund,
  refundCharge,
} from "@/services/billing/entitlements.service";
import { FREE_PLAN, PLUS_PLAN } from "@/billing/plans";
import { CREDIT_COSTS } from "@/billing/costs";
import { signedInUser } from "./auth-helper";

const app = createApp();

let userId: string;

beforeEach(async () => {
  userId = (await signedInUser(app)).id;
});

/** A fixed instant, so a test cannot straddle a month boundary and flake. */
const JANUARY = new Date("2026-01-15T10:00:00Z");
const FEBRUARY = new Date("2026-02-15T10:00:00Z");

async function subscribe(planCode: string, start: Date, end: Date) {
  await db.insert(subscriptions).values({
    userId,
    planCode,
    status: "ACTIVE",
    provider: "razorpay",
    currentPeriodStart: start,
    currentPeriodEnd: end,
  });
}

describe("granting", () => {
  it("puts a new user on free and grants that period's credits", async () => {
    const entitlement = await entitlementFor(userId, JANUARY);

    expect(entitlement.plan.code).toBe("free");
    expect(entitlement.balance).toBe(FREE_PLAN.limits.monthlyCredits);
  });

  it("grants once however many times it is asked", async () => {
    await entitlementFor(userId, JANUARY);
    await entitlementFor(userId, JANUARY);
    const third = await entitlementFor(userId, new Date("2026-01-28T23:00:00Z"));

    expect(third.balance).toBe(FREE_PLAN.limits.monthlyCredits);
    const rows = await db.select().from(creditLedger);
    expect(rows.filter((row) => row.reason === "GRANT")).toHaveLength(1);
  });

  it("grants again in the next period, and the old balance does not carry over", async () => {
    await charge(userId, "chat", "message-1", { now: JANUARY });
    expect((await entitlementFor(userId, JANUARY)).balance).toBe(
      FREE_PLAN.limits.monthlyCredits - 1,
    );

    // A fresh month is a different set of rows, so expiry needs no sweep.
    expect((await entitlementFor(userId, FEBRUARY)).balance).toBe(FREE_PLAN.limits.monthlyCredits);
  });

  it("grants the paid allowance on a subscriber's own billing dates", async () => {
    await subscribe("plus", new Date("2026-01-10T00:00:00Z"), new Date("2026-02-10T00:00:00Z"));
    const entitlement = await entitlementFor(userId, JANUARY);

    expect(entitlement.plan.code).toBe("plus");
    expect(entitlement.balance).toBe(PLUS_PLAN.limits.monthlyCredits);
    expect(entitlement.periodStart.toISOString()).toBe("2026-01-10T00:00:00.000Z");
  });

  it("drops a cancelled subscriber back to free", async () => {
    await subscribe("plus", new Date("2026-01-10T00:00:00Z"), new Date("2026-02-10T00:00:00Z"));
    await db.update(subscriptions).set({ status: "CANCELLED" });

    expect((await entitlementFor(userId, JANUARY)).plan.code).toBe("free");
  });

  it("keeps a past-due subscriber on their plan until the period ends", async () => {
    await subscribe("plus", new Date("2026-01-10T00:00:00Z"), new Date("2026-02-10T00:00:00Z"));
    await db.update(subscriptions).set({ status: "PAST_DUE" });

    // A card that failed this morning should not lock somebody out mid-document.
    expect((await entitlementFor(userId, JANUARY)).plan.code).toBe("plus");
  });
});

describe("charging", () => {
  it("deducts the action's cost", async () => {
    const result = await charge(userId, "chat", "message-1", { now: JANUARY });

    expect(result.ok).toBe(true);
    expect(result.ok && result.balance).toBe(FREE_PLAN.limits.monthlyCredits - CREDIT_COSTS.chat);
  });

  it("charges once for the same piece of work, however many attempts", async () => {
    await charge(userId, "chat", "message-1", { now: JANUARY });
    const second = await charge(userId, "chat", "message-1", { now: JANUARY });

    expect(second.ok).toBe(true);
    // The retry is allowed through — it is the same work — but costs nothing.
    expect(second.ok && second.charged).toBe(0);
    expect((await entitlementFor(userId, JANUARY)).balance).toBe(
      FREE_PLAN.limits.monthlyCredits - 1,
    );
  });

  it("refuses once the balance is spent, rather than going negative", async () => {
    for (let i = 0; i < FREE_PLAN.limits.monthlyCredits; i += 1) {
      expect((await charge(userId, "chat", `message-${i}`, { now: JANUARY })).ok).toBe(true);
    }

    const overdrawn = await charge(userId, "chat", "one-too-many", { now: JANUARY });
    expect(overdrawn.ok).toBe(false);
    expect(!overdrawn.ok && overdrawn.reason).toBe("insufficient-credits");
    expect((await entitlementFor(userId, JANUARY)).balance).toBe(0);
  });

  it("never lets concurrent requests spend the same credits twice", async () => {
    // The read-modify-write this is guarding: without the lock both would see a
    // sufficient balance and both would spend it.
    const attempts = Array.from({ length: 30 }, (_, i) =>
      charge(userId, "chat", `concurrent-${i}`, { now: JANUARY }),
    );
    const results = await Promise.all(attempts);

    expect(results.filter((r) => r.ok)).toHaveLength(FREE_PLAN.limits.monthlyCredits);
    expect((await entitlementFor(userId, JANUARY)).balance).toBe(0);
  });

  it("refuses a podcast on free however many credits are left", async () => {
    const result = await charge(userId, "podcast", "podcast-1", { now: JANUARY });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("not-on-plan");
    // Balance untouched: the refusal is about the plan, not the balance.
    expect((await entitlementFor(userId, JANUARY)).balance).toBe(FREE_PLAN.limits.monthlyCredits);
  });

  it("charges a podcast at its real weight on a plan that allows it", async () => {
    await subscribe("plus", new Date("2026-01-10T00:00:00Z"), new Date("2026-02-10T00:00:00Z"));
    const result = await charge(userId, "podcast", "podcast-1", { now: JANUARY });

    expect(result.ok).toBe(true);
    expect(result.ok && result.balance).toBe(
      PLUS_PLAN.limits.monthlyCredits - CREDIT_COSTS.podcast,
    );
  });
});

describe("refunding", () => {
  it("returns the credits when the work failed", async () => {
    await charge(userId, "podcast", "podcast-1", { now: JANUARY });
    await subscribe("plus", new Date("2026-01-10T00:00:00Z"), new Date("2026-02-10T00:00:00Z"));

    await charge(userId, "chat", "message-1", { now: JANUARY });
    const spent = (await entitlementFor(userId, JANUARY)).balance;

    await refund(userId, "chat", "message-1", { now: JANUARY });
    expect((await entitlementFor(userId, JANUARY)).balance).toBe(spent + CREDIT_COSTS.chat);
  });

  it("returns nothing when the job carried no charge", async () => {
    const before = (await entitlementFor(userId)).balance;

    // A reindex, or a job queued before charges existed. Must be a no-op rather
    // than a free credit.
    await refundCharge(undefined, "chat");
    await refundCharge({ userId, ref: "" }, "chat");

    expect((await entitlementFor(userId)).balance).toBe(before);
  });

  // These use the current period rather than a fixed one, because refundCharge
  // resolves the period when the job fails rather than taking it as an argument.
  it("refunds a job charge exactly once across repeated failures", async () => {
    await charge(userId, "chat", "message-1");
    const spent = (await entitlementFor(userId)).balance;

    // Both the service's own catch and the worker's failed handler can fire for
    // one answer, so the two paths overlapping must cost nothing.
    await refundCharge({ userId, ref: "message-1" }, "chat");
    await refundCharge({ userId, ref: "message-1" }, "chat");

    expect((await entitlementFor(userId)).balance).toBe(spent + CREDIT_COSTS.chat);
  });

  it("refunds each source of a multi-file upload independently", async () => {
    // One upload charged three credits under one request reference; two of the
    // three sources then fail. Keyed on the source, both come back — which a ref
    // shared across the upload could not do, because the ledger's unique index
    // would swallow the second.
    await charge(userId, "source", "upload-ref", { units: 3 });
    const spent = (await entitlementFor(userId)).balance;

    await refundCharge({ userId, ref: "source-a" }, "source");
    await refundCharge({ userId, ref: "source-b" }, "source");

    expect((await entitlementFor(userId)).balance).toBe(spent + 2 * CREDIT_COSTS.source);
  });

  it("refunds once even when a job fails repeatedly", async () => {
    await charge(userId, "chat", "message-1", { now: JANUARY });
    const spent = (await entitlementFor(userId, JANUARY)).balance;

    await refund(userId, "chat", "message-1", { now: JANUARY });
    await refund(userId, "chat", "message-1", { now: JANUARY });
    await refund(userId, "chat", "message-1", { now: JANUARY });

    expect((await entitlementFor(userId, JANUARY)).balance).toBe(spent + CREDIT_COSTS.chat);
  });
});
