import { describe, expect, it, beforeAll } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithQuery } from "./render";
import { GrowthChart } from "@/components/admin/growth-chart";
import { AiUsage } from "@/components/admin/ai-usage";
import { UsersTable } from "@/components/admin/users-table";
import { PerformanceTable } from "@/components/admin/performance-table";
import { AuditLog } from "@/components/admin/audit-log";
import { OverviewTiles } from "@/components/admin/overview-tiles";

beforeAll(() => {
  // jsdom lays nothing out, so the chart would measure zero and draw nothing.
  Element.prototype.getBoundingClientRect = () =>
    ({
      width: 800,
      height: 200,
      top: 0,
      left: 0,
      right: 800,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
});

const days = Array.from({ length: 30 }, (_v, i) => ({
  day: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
  signups: i % 5,
  active: (i % 7) + 1,
}));

describe("admin panels", () => {
  it("growth chart draws two series", () => {
    const { container } = renderWithQuery(
      <GrowthChart points={days} days={30} />,
    );
    expect(container.querySelectorAll("path").length).toBe(2);
    expect(screen.getByText(/signups in 30 days/)).toBeInTheDocument();
  });

  it("growth chart copes with an empty window", () => {
    renderWithQuery(<GrowthChart points={[]} days={7} />);
    expect(screen.getByText(/Nobody has signed up/)).toBeInTheDocument();
  });

  it("growth chart copes with a single point", () => {
    const { container } = renderWithQuery(
      <GrowthChart
        points={[{ day: "2026-09-01", signups: 2, active: 1 }]}
        days={1}
      />,
    );
    expect(container.querySelectorAll("path").length).toBe(2);
  });

  it("ai usage labels the estimate", () => {
    renderWithQuery(
      <AiUsage
        rows={[
          { feature: "chat", calls: 120, tokens: 1_240_000, costRupees: 412.5 },
          {
            feature: "podcast_script",
            calls: 3,
            tokens: 900,
            costRupees: 0.42,
          },
        ]}
        days={30}
        pricesUpdated="2026-09-01"
      />,
    );
    expect(
      screen.getByText(/Cost is an estimate, not a bill/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Podcast script").length).toBe(2);
  });

  it("users table sorts and warns about the proxy", () => {
    renderWithQuery(
      <UsersTable
        rows={[
          {
            id: "a",
            name: "Asha",
            email: "asha@example.com",
            createdAt: "2026-09-01T10:00:00.000Z",
            plan: "pro",
            minutesSpent: 145,
            questions: 12,
            sources: 4,
            tokens: 120_000,
            costRupees: 12.5,
            lastSeen: "2026-09-12T10:00:00.000Z",
          },
          {
            id: "b",
            name: "",
            email: "b@example.com",
            createdAt: "2026-08-01T10:00:00.000Z",
            plan: "free",
            minutesSpent: 0,
            questions: 0,
            sources: 0,
            tokens: 0,
            costRupees: 0,
            lastSeen: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("2h 25m")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText(/Time spent is a proxy/)).toBeInTheDocument();
  });

  it("performance table renders percentiles", () => {
    renderWithQuery(
      <PerformanceTable
        rows={[
          {
            route: "/api/chat",
            method: "POST",
            requests: 100,
            errorRate: 0.02,
            p50: 120,
            p95: 900,
            p99: 1500,
            maxMs: 12000,
          },
        ]}
        days={7}
      />,
    );
    expect(screen.getByText("900ms")).toBeInTheDocument();
    expect(screen.getByText("12.0s")).toBeInTheDocument();
    expect(screen.getByText("2.0%")).toBeInTheDocument();
  });

  it("audit log reads as a sentence", () => {
    renderWithQuery(
      <AuditLog
        rows={[
          {
            id: "1",
            actorEmail: "root@example.com",
            action: "grant_credits",
            subjectEmail: "asha@example.com",
            detail: "+50 credits. Refund for a failed run.",
            createdAt: "2026-09-12T10:00:00.000Z",
          },
        ]}
      />,
    );
    expect(screen.getByText("granted credits to")).toBeInTheDocument();
  });

  it("overview tiles say the cost is an estimate", () => {
    renderWithQuery(
      <OverviewTiles
        data={{
          users: { total: 40, newToday: 2, newThisWeek: 9, activeThisWeek: 14 },
          usage: { questions: 120, sources: 45, roadmaps: 3, podcasts: 7 },
          ai: {
            calls: 900,
            totalTokens: 4_500_000,
            costRupees: 1240.44,
            pricesUpdated: "2026-09-01",
          },
          api: {
            requests: 10_000,
            errorRate: 0.004,
            p50: 40,
            p95: 320,
            p99: 900,
          },
          revenue: { payingUsers: 3, monthlyRupees: 2997 },
        }}
      />,
    );
    expect(screen.getByText("AI cost (estimate)")).toBeInTheDocument();
    expect(screen.getByText(/From list prices of/)).toBeInTheDocument();
    expect(screen.getByText("₹1,240")).toBeInTheDocument();
    expect(screen.getByText("0.4%")).toBeInTheDocument();
  });
});
