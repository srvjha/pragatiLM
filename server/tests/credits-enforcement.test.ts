import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "@/app";
import { db } from "@/db/client";
import { creditLedger, payments, subscriptions } from "@/db/schema";
import { FREE_PLAN } from "@/billing/plans";
import { CREDIT_COSTS } from "@/billing/costs";
import { signedInUser } from "./auth-helper";
import type { BillingStateDto, NotebookDto, PaymentDto } from "@/types/api";

const app = createApp();

let agent: Awaited<ReturnType<typeof signedInUser>>["agent"];
let userId: string;
let notebookId: string;

beforeEach(async () => {
  const session = await signedInUser(app);
  agent = session.agent;
  userId = session.id;

  const created = await agent.post("/api/notebooks").send({ name: "Billing" });
  notebookId = (created.body as { data: NotebookDto }).data.id;
});

async function balance(): Promise<number> {
  const response = await agent.get("/api/billing/me");
  return (response.body as { data: BillingStateDto }).data.balance;
}

/**
 * Spends the period down to `remaining` by writing the ledger directly.
 *
 * Going through the API would need dozens of real requests and would make these
 * tests about ingestion rather than about the gate.
 */
async function leaveOnly(remaining: number): Promise<void> {
  const state = await agent.get("/api/billing/me");
  const period = (state.body as { data: BillingStateDto }).data.periodStart;

  await db.insert(creditLedger).values({
    userId,
    periodStart: new Date(period),
    delta: -(FREE_PLAN.limits.monthlyCredits - remaining),
    reason: "ADJUSTMENT",
    refType: "test",
    refId: "drain",
  });
}

function addTextSource() {
  return agent
    .post(`/api/notebooks/${notebookId}/sources/text`)
    .send({ title: "A note", content: "Consensus requires a quorum of replicas to agree." });
}

describe("a new account", () => {
  it("starts on free with the full allowance", async () => {
    const response = await agent.get("/api/billing/me");

    expect(response.status).toBe(200);
    const state = (response.body as { data: BillingStateDto }).data;
    expect(state.plan.code).toBe("free");
    expect(state.balance).toBe(FREE_PLAN.limits.monthlyCredits);
  });

  it("does not need a session to read the plans", async () => {
    const response = await agent.get("/api/billing/plans");

    expect(response.status).toBe(200);
    const body = response.body as { data: { plans: { code: string }[]; billingEnabled: boolean } };
    expect(body.data.plans.map((plan) => plan.code)).toEqual(["free", "plus", "pro"]);
    // No Razorpay keys in the test environment, so checkout is unavailable.
    expect(body.data.billingEnabled).toBe(false);
  });
});

describe("adding a source", () => {
  it("charges a credit", async () => {
    const before = await balance();
    expect((await addTextSource()).status).toBe(201);

    expect(await balance()).toBe(before - CREDIT_COSTS.source);
  });

  it("is refused with 402 once the allowance is gone", async () => {
    await leaveOnly(0);

    const response = await addTextSource();
    expect(response.status).toBe(402);

    const body = response.body as { error: { code: string; details: { needed: number } } };
    expect(body.error.code).toBe("INSUFFICIENT_CREDITS");
    // The client renders an upgrade prompt from these, so they have to be there.
    expect(body.error.details.needed).toBe(CREDIT_COSTS.source);
  });

  it("costs nothing when the body is invalid, because validation runs first", async () => {
    const before = await balance();
    const response = await agent.post(`/api/notebooks/${notebookId}/sources/text`).send({});

    expect(response.status).toBe(400);
    expect(await balance()).toBe(before);
  });
});

describe("asking a question", () => {
  async function chat(): Promise<string> {
    const response = await agent.post(`/api/notebooks/${notebookId}/chats`).send({});
    return (response.body as { data: { id: string } }).data.id;
  }

  it("is refused with 402 once the allowance is gone", async () => {
    const chatId = await chat();
    await leaveOnly(0);

    const response = await agent
      .post(`/api/notebooks/${notebookId}/chats/${chatId}/messages`)
      .send({ content: "what does it say about quorums" });

    expect(response.status).toBe(402);
    expect((response.body as { error: { code: string } }).error.code).toBe("INSUFFICIENT_CREDITS");
  });

  it("costs nothing when the question is empty", async () => {
    const chatId = await chat();
    const before = await balance();

    expect(
      (
        await agent
          .post(`/api/notebooks/${notebookId}/chats/${chatId}/messages`)
          .send({ content: "" })
      ).status,
    ).toBe(400);
    expect(await balance()).toBe(before);
  });
});

describe("audio overviews", () => {
  it("are refused on free with 403, not 402, and cost nothing", async () => {
    const before = await balance();

    const response = await agent.post(`/api/notebooks/${notebookId}/podcasts`).send({});

    // A plan refusal, not a balance one: no amount of credits unlocks this, and
    // the client has to offer an upgrade rather than "wait for the reset".
    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe("PLAN_REQUIRED");
    expect(await balance()).toBe(before);
  });

  it("charge twenty five credits on a plan that includes them", async () => {
    await db.insert(subscriptions).values({
      userId,
      planCode: "plus",
      status: "ACTIVE",
      provider: "razorpay",
      currentPeriodStart: new Date(Date.now() - 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
    });

    const before = await balance();
    const response = await agent.post(`/api/notebooks/${notebookId}/podcasts`).send({});

    expect(response.status).toBe(202);
    expect(await balance()).toBe(before - CREDIT_COSTS.podcast);
  });
});

describe("a multi-file PDF upload", () => {
  const pdf = "tests/fixtures/distributed-systems.pdf";

  it("charges once per file, not once per request", async () => {
    const before = await balance();

    const response = await agent
      .post(`/api/notebooks/${notebookId}/sources/pdf`)
      .attach("files", pdf)
      .attach("files", "tests/fixtures/handbook-20p.pdf");

    expect(response.status).toBe(201);
    // Two files in one request is two sources, so it is two credits. Charging
    // per request would let ten PDFs through for one.
    expect(await balance()).toBe(before - 2 * CREDIT_COSTS.source);
  });

  it("refunds a file that was rejected as a duplicate", async () => {
    await agent.post(`/api/notebooks/${notebookId}/sources/pdf`).attach("files", pdf);
    const afterFirst = await balance();

    // The same file twice: one is new, one is a duplicate and stores nothing.
    const response = await agent
      .post(`/api/notebooks/${notebookId}/sources/pdf`)
      .attach("files", pdf)
      .attach("files", "tests/fixtures/handbook-20p.pdf");

    expect(response.status).toBe(201);
    expect(await balance()).toBe(afterFirst - CREDIT_COSTS.source);
  });

  it("costs nothing when no file is attached", async () => {
    const before = await balance();
    expect((await agent.post(`/api/notebooks/${notebookId}/sources/pdf`)).status).toBe(400);
    expect(await balance()).toBe(before);
  });
});

describe("reindexing", () => {
  it("is free, because it stores nothing new", async () => {
    const created = await addTextSource();
    const sourceId = (created.body as { data: { id: string } }).data.id;

    const after = await balance();
    const response = await agent.post(`/api/notebooks/${notebookId}/sources/${sourceId}/reindex`);

    expect(response.status).toBeLessThan(400);
    expect(await balance()).toBe(after);
  });
});

describe("cancelling", () => {
  it("refuses when there is nothing to cancel", async () => {
    const response = await agent.post("/api/billing/cancel");

    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
  });

  it("needs a session", async () => {
    const stranger = (await import("supertest")).default(app);
    expect((await stranger.post("/api/billing/cancel")).status).toBe(401);
  });
});

describe("the billing state", () => {
  it("reports no subscription on the free tier", async () => {
    const response = await agent.get("/api/billing/me");
    expect((response.body as { data: BillingStateDto }).data.subscription).toBeNull();
  });

  it("reports the subscription's status once there is one", async () => {
    await db.insert(subscriptions).values({
      userId,
      planCode: "plus",
      status: "ACTIVE",
      provider: "razorpay",
      currentPeriodStart: new Date(Date.now() - 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
    });

    const state = ((await agent.get("/api/billing/me")).body as { data: BillingStateDto }).data;

    expect(state.plan.code).toBe("plus");
    expect(state.subscription?.status).toBe("ACTIVE");
    // Not cancelled, so the date reads as "renews on" rather than "ends on".
    expect(state.subscription?.cancelAtPeriodEnd).toBeNull();
  });
});

describe("invoices", () => {
  it("is empty until a payment is taken", async () => {
    const response = await agent.get("/api/billing/invoices");

    expect(response.status).toBe(200);
    expect((response.body as { data: unknown[] }).data).toEqual([]);
  });

  it("reports what was charged, newest first", async () => {
    await db.insert(payments).values([
      {
        userId,
        providerPaymentId: "pay_older",
        amountPaise: 39_900,
        planCode: "plus",
        paidAt: new Date("2026-01-10T00:00:00Z"),
      },
      {
        userId,
        providerPaymentId: "pay_newer",
        amountPaise: 99_900,
        planCode: "pro",
        paidAt: new Date("2026-02-10T00:00:00Z"),
      },
    ]);

    const rows = ((await agent.get("/api/billing/invoices")).body as { data: PaymentDto[] }).data;

    expect(rows).toHaveLength(2);
    expect(rows[0]?.planCode).toBe("pro");
    // Stored as the provider reported it, not recomputed from today's price.
    expect(rows[0]?.amountPaise).toBe(99_900);
  });

  it("never shows one person another person's receipts", async () => {
    await db.insert(payments).values({
      userId,
      providerPaymentId: "pay_mine",
      amountPaise: 39_900,
      planCode: "plus",
      paidAt: new Date(),
    });

    const stranger = await signedInUser(app, "stranger@example.com");
    const rows = (
      (await stranger.agent.get("/api/billing/invoices")).body as { data: PaymentDto[] }
    ).data;

    expect(rows).toEqual([]);
  });
});
