"use client";

import { StatTile, StatTileSkeleton } from "@/components/dashboard/stat-tile";
import { Panel } from "./panel";
import {
  compact,
  count,
  millis,
  onDate,
  percent,
  rupees,
} from "@/features/admin/format";
import type { AdminOverview } from "@/features/admin/api";

/**
 * The headline figures.
 *
 * Twelve numbers, grouped by the question they answer rather than dumped into
 * one grid: who is here, what they did with it, and what it cost to serve. The
 * grid is the same one the user facing dashboard uses, so a tile is the same
 * size and shape wherever it appears in the product.
 *
 * Each band names its own window in the heading. These come from fixed server
 * side windows and are deliberately above the range control, which scopes only
 * the panels under it; a tile that silently meant something different from the
 * chart beside it would be worse than a tile that states its span.
 */
const TILE_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";

/** Above this, the 5xx rate stops being noise and starts being an incident. */
const ERROR_RATE_ALARM = 0.01;

export function OverviewTiles({ data }: { data: AdminOverview }) {
  return (
    <div className="space-y-8">
      <Panel
        id="people"
        title="People"
        blurb="Accounts, and who is using them."
      >
        <dl className={TILE_GRID}>
          <StatTile
            label="Total users"
            value={count(data.users.total)}
            note="Every account ever created."
          />
          <StatTile
            label="New today"
            value={count(data.users.newToday)}
            note="Signed up in the last 24 hours."
          />
          <StatTile
            label="New this week"
            value={count(data.users.newThisWeek)}
            note="Signed up in the last 7 days."
          />
          <StatTile
            label="Active this week"
            value={count(data.users.activeThisWeek)}
            detail={
              data.users.total > 0
                ? `${percent(data.users.activeThisWeek / data.users.total, 0)} of all accounts`
                : undefined
            }
            meter={
              data.users.total > 0
                ? {
                    fraction: data.users.activeThisWeek / data.users.total,
                    tone: "marker",
                  }
                : undefined
            }
            note="Made at least one request in 7 days."
          />
        </dl>
      </Panel>

      <Panel
        id="usage"
        title="What was used"
        blurb="Charged actions in the last 30 days."
      >
        <dl className={TILE_GRID}>
          <StatTile
            label="Questions"
            value={count(data.usage.questions)}
            note="Asked of a notebook, answered or refused."
          />
          <StatTile
            label="Sources"
            value={count(data.usage.sources)}
            note="Added and accepted for indexing."
          />
          <StatTile
            label="Roadmaps"
            value={count(data.usage.roadmaps)}
            note="Study plans built from a notebook."
          />
          <StatTile
            label="Podcasts"
            value={count(data.usage.podcasts)}
            note="Audio overviews generated."
          />
        </dl>
      </Panel>

      <Panel
        id="money"
        title="Money and service"
        blurb="What it earns, what it costs, and how it is holding up."
      >
        <dl className={TILE_GRID}>
          <StatTile
            label="Monthly revenue"
            value={rupees(data.revenue.monthlyRupees)}
            detail={`${count(data.revenue.payingUsers)} paying ${data.revenue.payingUsers === 1 ? "account" : "accounts"}`}
            note="Active subscriptions at today's list price."
          />
          {/*
            The cost figure is the one number on this page that could be
            mistaken for a bill, so the tile says what it is twice: an estimate
            in the label, and the date of the price table underneath it.
          */}
          <StatTile
            label="AI cost (estimate)"
            value={rupees(data.ai.costRupees)}
            detail={`${count(data.ai.calls)} calls · ${compact(data.ai.totalTokens)} tokens`}
            note={`From list prices of ${onDate(data.ai.pricesUpdated)}. Not an invoice.`}
          />
          <StatTile
            label="p95 latency"
            value={millis(data.api.p95)}
            detail={`p50 ${millis(data.api.p50)} · p99 ${millis(data.api.p99)}`}
            note={`Over ${count(data.api.requests)} requests in 7 days.`}
          />
          <StatTile
            label="Error rate"
            value={percent(data.api.errorRate)}
            tone={data.api.errorRate >= ERROR_RATE_ALARM ? "stamp" : "neutral"}
            detail={`${count(Math.round(data.api.errorRate * data.api.requests))} of ${count(data.api.requests)} requests`}
            meter={
              data.api.errorRate > 0
                ? { fraction: data.api.errorRate, tone: "stamp" }
                : undefined
            }
            note="Only 5xx. A refusal is the product working."
          />
        </dl>
      </Panel>
    </div>
  );
}

/**
 * The loading board. The headings are known before the request returns, so they
 * are printed rather than greyed and nothing moves when the figures land.
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      {[
        { id: "people", title: "People" },
        { id: "usage", title: "What was used" },
        { id: "money", title: "Money and service" },
      ].map((band) => (
        <Panel key={band.id} id={band.id} title={band.title}>
          <div className={TILE_GRID}>
            {Array.from({ length: 4 }, (_value, index) => (
              <StatTileSkeleton key={index} />
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
