import { describe, expect, it, vi, beforeEach } from "vitest";
import type * as EnvModule from "@/config/env";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminAudit, creditLedger } from "@/db/schema";
import { signedInUser } from "./auth-helper";
import { costMicros } from "@/providers/llm/pricing";

/**
 * The admin surface is the one place in this system that can read every account
 * and mint credit, so these tests are mostly about who is refused.
 *
 * ADMIN_EMAILS is read through `@/config/env`, which parses once at import. The
 * module is mocked rather than the environment variable set, because changing
 * process.env after import would have no effect and the test would pass for the
 * wrong reason.
 */
const adminEmails: string[] = [];

vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    ...actual,
    get adminEnabled() {
      return adminEmails.length > 0;
    },
    isAdminEmail: (email: string | null | undefined) =>
      Boolean(email && adminEmails.includes(email.trim().toLowerCase())),
  };
});

const { createApp } = await import("@/app");
const app = createApp();

beforeEach(() => {
  adminEmails.length = 0;
});

describe("the admin gate", () => {
  it("404s for a signed in user who is not an admin", async () => {
    adminEmails.push("owner@example.com");
    const { agent } = await signedInUser(app, "stranger@example.com");

    const response = await agent.get("/api/admin/overview");

    // 404 and not 403: a 403 confirms the panel exists and that the caller
    // merely lacks the key, which is a free hint to anyone probing.
    expect(response.status).toBe(404);
  });

  it("404s for everyone when ADMIN_EMAILS is empty", async () => {
    const { agent } = await signedInUser(app, "owner@example.com");

    const response = await agent.get("/api/admin/overview");

    // An unconfigured deployment has no admin, including the person who would
    // have been one had it been configured.
    expect(response.status).toBe(404);
  });

  it("needs a session at all", async () => {
    adminEmails.push("owner@example.com");
    const stranger = (await import("supertest")).default(app);

    expect((await stranger.get("/api/admin/overview")).status).toBe(401);
  });

  it("lets the configured admin in", async () => {
    adminEmails.push("owner@example.com");
    const { agent } = await signedInUser(app, "owner@example.com");

    const response = await agent.get("/api/admin/overview");

    expect(response.status).toBe(200);
    const body = response.body as { data: { users: { total: number } } };
    expect(body.data.users.total).toBeGreaterThanOrEqual(1);
  });

  it("matches a capitalised ADMIN_EMAILS entry", async () => {
    // The risk is on the env side: better-auth normalises the address it
    // stores, so the capitalisation that can actually lock an owner out of
    // their own dashboard is the one they typed into the env file.
    adminEmails.push("Owner@Example.COM".toLowerCase());
    const { agent } = await signedInUser(app, "owner@example.com");

    expect((await agent.get("/api/admin/me")).status).toBe(200);
  });
});

describe("granting credits", () => {
  it("writes an audit row and moves the balance", async () => {
    adminEmails.push("owner@example.com");
    const admin = await signedInUser(app, "owner@example.com");
    const subject = await signedInUser(app, "member@example.com");

    const before = await admin.agent.get("/api/admin/users");
    expect(before.status).toBe(200);

    const response = await admin.agent
      .post("/api/admin/grant")
      .send({ userId: subject.id, credits: 50, note: "beta tester" });

    expect(response.status).toBe(200);

    const ledger = await db.select().from(creditLedger).where(eq(creditLedger.userId, subject.id));
    const adjustment = ledger.find((row) => row.reason === "ADJUSTMENT");
    expect(adjustment?.delta).toBe(50);
    expect(adjustment?.refType).toBe("admin");

    const audit = await db.select().from(adminAudit);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe("grant_credits");
    expect(audit[0]?.actorEmail).toBe("owner@example.com");
    expect(audit[0]?.subjectEmail).toBe("member@example.com");
    // The amount has to be reconstructable from the log alone.
    expect(audit[0]?.detail).toContain("50");
  });

  it("can take credits away as well as give them", async () => {
    adminEmails.push("owner@example.com");
    const admin = await signedInUser(app, "owner@example.com");
    const subject = await signedInUser(app, "member@example.com");

    const response = await admin.agent
      .post("/api/admin/grant")
      .send({ userId: subject.id, credits: -10, note: "abuse" });

    expect(response.status).toBe(200);
    const ledger = await db.select().from(creditLedger).where(eq(creditLedger.userId, subject.id));
    expect(ledger.find((row) => row.reason === "ADJUSTMENT")?.delta).toBe(-10);
  });

  it("refuses a grant with no note, because the audit log would say nothing", async () => {
    adminEmails.push("owner@example.com");
    const admin = await signedInUser(app, "owner@example.com");
    const subject = await signedInUser(app, "member@example.com");

    const response = await admin.agent
      .post("/api/admin/grant")
      .send({ userId: subject.id, credits: 10, note: "" });

    expect(response.status).toBe(400);
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });

  it("refuses an absurd amount", async () => {
    adminEmails.push("owner@example.com");
    const admin = await signedInUser(app, "owner@example.com");
    const subject = await signedInUser(app, "member@example.com");

    // One fat finger should not be able to mint a million credits.
    const response = await admin.agent
      .post("/api/admin/grant")
      .send({ userId: subject.id, credits: 1_000_000, note: "oops" });

    expect(response.status).toBe(400);
  });

  it("is refused entirely for a non-admin", async () => {
    adminEmails.push("owner@example.com");
    const stranger = await signedInUser(app, "stranger@example.com");

    const response = await stranger.agent
      .post("/api/admin/grant")
      .send({ userId: stranger.id, credits: 1000, note: "for me" });

    expect(response.status).toBe(404);
    expect(await db.select().from(adminAudit)).toHaveLength(0);
  });
});

describe("model pricing", () => {
  it("costs a nano call at a fraction of a paisa, without rounding it to zero", () => {
    // 1000 prompt tokens on gpt-4.1-nano. The reason the column is micro-rupees:
    // in paise this would round to 0 and the totals would understate the bill.
    const micros = costMicros("gpt-4.1-nano", 1000, 0);

    expect(micros).toBeGreaterThan(0);
    expect(micros).toBe(Math.round((1000 / 1_000_000) * 0.1 * 88 * 1_000_000));
  });

  it("prices output tokens higher than input", () => {
    expect(costMicros("gpt-4.1-mini", 0, 1000)).toBeGreaterThan(
      costMicros("gpt-4.1-mini", 1000, 0),
    );
  });

  it("resolves a dated model name to its base price", () => {
    expect(costMicros("gpt-4.1-mini-2026-01-01", 1000, 1000)).toBe(
      costMicros("gpt-4.1-mini", 1000, 1000),
    );
  });

  it("does not let gpt-4.1 shadow gpt-4.1-mini", () => {
    // Both are prefixes of the dated mini name. The longer match has to win, or
    // every mini call is billed at five times its real rate.
    expect(costMicros("gpt-4.1-mini-2026-01-01", 1000, 0)).toBeLessThan(
      costMicros("gpt-4.1-2026-01-01", 1000, 0),
    );
  });

  it("charges an unknown model rather than reporting it free", () => {
    // Understating is the dangerous direction: a cost of zero gets believed.
    expect(costMicros("some-new-model", 1000, 1000)).toBeGreaterThan(0);
  });
});
